from datetime import datetime, timezone
import asyncio

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from config import get_settings
from security import require_role, TokenPayload

router = APIRouter(prefix="/api", tags=["admin"])
settings = get_settings()


def node_auth_url() -> str:
    return settings.NODE_AUTH_URL.rstrip("/")


def document_service_url() -> str:
    return settings.DOCUMENT_SERVICE_URLS[0].rstrip("/")


async def _probe_service(client: httpx.AsyncClient, name: str, url: str) -> dict:
    target = url.rstrip("/")
    try:
        response = await client.get(f"{target}/health", timeout=3.0)
        if response.status_code < 400:
            return {"name": name, "status": "online", "detail": target}
        return {"name": name, "status": "degraded", "detail": f"{target} returned {response.status_code}"}
    except Exception as exc:
        return {"name": name, "status": "offline", "detail": f"{target}: {type(exc).__name__}"}


def _extract_users(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("users", "data", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


def _count_users(users):
    return {
        "totalUsers": len(users),
        "activeUsers": sum(1 for user in users if user.get("status") == "active"),
        "disabledUsers": sum(1 for user in users if user.get("status") == "disabled"),
        "adminUsers": sum(1 for user in users if user.get("role") == "admin"),
        "pendingApprovals": sum(
            1
            for user in users
            if user.get("approvalStatus") == "pending" or user.get("approval_status") == "pending"
        ),
    }


async def forward_request(request: Request, target_url: str) -> JSONResponse:
    async with httpx.AsyncClient(timeout=30.0) as client:
        headers = dict(request.headers)
        headers.pop("host", None)
        body = await request.body()
        try:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
            )
            try:
                content = resp.json()
            except Exception:
                content = {"message": resp.text}
            return JSONResponse(content=content, status_code=resp.status_code)
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail=f"Service unavailable: {target_url}")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Proxy error: {exc}")


@router.api_route(
    "/admin/users",
    methods=["GET", "POST"],
    dependencies=[Depends(require_role("admin"))],
)
async def admin_users(request: Request):
    return await forward_request(request, f"{node_auth_url()}/api/admin/users")


@router.api_route(
    "/admin/users/{user_id}",
    methods=["PUT", "DELETE"],
    dependencies=[Depends(require_role("admin"))],
)
async def admin_user_detail(request: Request, user_id: str):
    return await forward_request(request, f"{node_auth_url()}/api/admin/users/{user_id}")


@router.api_route(
    "/admin/users/{user_id}/{action}",
    methods=["POST"],
    dependencies=[Depends(require_role("admin"))],
)
async def admin_user_action(request: Request, user_id: str, action: str):
    if action not in ("approve", "reject"):
        raise HTTPException(400, "Invalid action")
    return await forward_request(request, f"{node_auth_url()}/api/admin/users/{user_id}/{action}")


@router.get("/admin/documents/stats", dependencies=[Depends(require_role("admin"))])
async def admin_document_stats(request: Request):
    return await forward_request(request, f"{document_service_url()}/api/admin/documents/stats")


@router.get("/admin/documents/failed", dependencies=[Depends(require_role("admin"))])
async def admin_failed_documents(request: Request):
    return await forward_request(request, f"{document_service_url()}/api/admin/documents/failed")


@router.post("/admin/documents/{doc_id}/reprocess")
async def admin_reprocess_document(
    request: Request,
    doc_id: str,
    current_user: TokenPayload = Depends(require_role("admin")),
):
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    enterprise_id = current_user.enterprise_id
    headers.update({
        "X-Enterprise-ID": enterprise_id,
        "X-User-ID": current_user.sub,
        "X-User-Role": current_user.role,
        "X-User-Email": current_user.email,
    })

    async with httpx.AsyncClient(timeout=300.0) as client:
        target_doc_id = doc_id
        doc_resp = await client.get(f"{document_service_url()}/documents/{target_doc_id}", headers=headers)
        if doc_resp.status_code == 404:
            failed_resp = await client.get(f"{document_service_url()}/api/admin/documents/failed", headers=headers)
            if failed_resp.status_code < 400:
                for failed_doc in failed_resp.json():
                    if failed_doc.get("id") == doc_id or failed_doc.get("_id") == doc_id:
                        target_doc_id = failed_doc.get("documentId") or doc_id
                        doc_resp = await client.get(f"{document_service_url()}/documents/{target_doc_id}", headers=headers)
                        break
        if doc_resp.status_code == 404:
            raise HTTPException(404, "Document not found")
        if doc_resp.status_code >= 400:
            raise HTTPException(doc_resp.status_code, doc_resp.text)
        doc = doc_resp.json()

        retry_resp = await client.post(f"{document_service_url()}/api/admin/documents/{target_doc_id}/reprocess", headers=headers)
        if retry_resp.status_code >= 400:
            try:
                detail = retry_resp.json().get("message") or retry_resp.json().get("detail")
            except Exception:
                detail = retry_resp.text
            raise HTTPException(retry_resp.status_code, detail)

        archive_resp = await client.get(
            f"{settings.ARCHIVE_SERVICE_URLS[0].rstrip('/')}/archive/{doc.get('documentId') or doc_id}",
            headers=headers,
        )
        if archive_resp.status_code >= 400:
            await client.post(
                f"{document_service_url()}/documents/fail",
                json={"documentId": doc.get("documentId") or doc_id, "error_message": "Archived original unavailable for reprocess"},
                headers=headers,
            )
            raise HTTPException(archive_resp.status_code, "Archived original unavailable for reprocess")

        filename = doc.get("name") or doc.get("filename") or f"{doc_id}.bin"
        content_type = archive_resp.headers.get("content-type") or doc.get("type") or "application/octet-stream"
        ocr_resp = await client.post(
            f"{settings.OCR_SERVICE_URLS[0].rstrip('/')}/ocr/extract",
            files={"file": (filename, archive_resp.content, content_type)},
            headers={"X-Enterprise-ID": enterprise_id},
            params={"force": True},
        )
        if ocr_resp.status_code >= 400:
            await client.post(
                f"{document_service_url()}/documents/fail",
                json={"documentId": doc.get("documentId") or doc_id, "error_message": f"OCR reprocess failed: {ocr_resp.text[:300]}"},
                headers=headers,
            )
            raise HTTPException(ocr_resp.status_code, "OCR reprocess failed")

        ocr_data = ocr_resp.json()
        ocr_result = ocr_data.get("ocr_result") or ocr_data
        extracted_text = ocr_result.get("raw_text", "")
        update_resp = await client.post(
            f"{document_service_url()}/documents/process",
            json={
                "documentId": doc.get("documentId") or doc_id,
                "name": filename,
                "type": content_type,
                "size": len(archive_resp.content),
                "ownerId": doc.get("ownerId") or doc.get("owner_id") or "unknown",
                "enterprise_id": enterprise_id,
                "extractedText": extracted_text,
            },
            headers=headers,
        )
        if update_resp.status_code >= 400:
            raise HTTPException(update_resp.status_code, update_resp.text)

        result = update_resp.json()
        result["reprocess"] = retry_resp.json()
        result["ocr_applied"] = bool(extracted_text)
        result["text_length"] = len(extracted_text)
        return JSONResponse(content=result)


@router.get("/admin/storage", dependencies=[Depends(require_role("admin"))])
async def admin_storage(request: Request):
    return await forward_request(request, f"{document_service_url()}/api/admin/storage")


@router.get("/admin/stats", dependencies=[Depends(require_role("admin"))])
async def admin_combined_stats(request: Request):
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            users_resp = await client.get(f"{node_auth_url()}/api/admin/users", headers=headers)
            doc_stats_resp = await client.get(
                f"{document_service_url()}/api/admin/documents/stats",
                headers=headers,
            )
            storage_resp = await client.get(f"{document_service_url()}/api/admin/storage", headers=headers)
            service_checks = await asyncio.gather(
                _probe_service(client, "API Gateway", "http://api-gateway:8001"),
                _probe_service(client, "Auth API", node_auth_url()),
                _probe_service(client, "Document Service", document_service_url()),
                _probe_service(client, "Archive Service", settings.ARCHIVE_SERVICE_URLS[0]),
                _probe_service(client, "Metadata Service", settings.METADATA_SERVICE_URLS[0]),
                _probe_service(client, "Semantic Search", settings.SEARCH_SERVICE_URLS[0]),
                _probe_service(client, "Classifier Service", settings.CLASSIFIER_SERVICE_URLS[0]),
                _probe_service(client, "OCR Service", settings.OCR_SERVICE_URLS[0]),
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Admin stats dependency unavailable: {exc}") from exc

    if users_resp.status_code != 200:
        raise HTTPException(503, "Auth service users unavailable")
    if doc_stats_resp.status_code != 200:
        raise HTTPException(503, "Document service stats unavailable")
    if storage_resp.status_code != 200:
        raise HTTPException(503, "Storage info unavailable")

    users = _extract_users(users_resp.json())
    user_counts = _count_users(users)
    doc_stats = doc_stats_resp.json()
    storage = storage_resp.json()

    return JSONResponse(
        content={
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "overview": {
                **user_counts,
                "totalDocuments": doc_stats.get("totalDocuments", 0),
                "processedDocuments": doc_stats.get("processedDocuments", 0),
                "processingDocuments": doc_stats.get("processingDocuments", 0),
                "pendingDocuments": doc_stats.get("pendingDocuments", 0),
                "failedDocuments": doc_stats.get("failedDocuments", 0),
                "workflowCount": 0,
                "workflowRunsToday": 0,
            },
            "storage": storage,
            "services": [
                *service_checks,
                {"name": "Storage", "status": "online", "detail": storage.get("path", "Document storage")},
            ],
        }
    )


@router.api_route("/support/messages", methods=["GET", "POST"])
async def support_messages(request: Request):
    return await forward_request(request, f"{node_auth_url()}/api/support/messages")
