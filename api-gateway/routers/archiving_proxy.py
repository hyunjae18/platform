import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from config import get_settings
from load_balancer import get_balancer
from security import TokenPayload, get_current_user, require_role

router = APIRouter(prefix="/api/archive", tags=["archiving"])
settings = get_settings()

TIMEOUT = 60.0  # Archiving large files can be slow

_archive_balancer = get_balancer("archive", settings.ARCHIVE_SERVICE_URLS)


def _downstream_headers(
    api_key: str = "",
    enterprise_id: str = "",
    authorization: str = "",
) -> dict:
    headers = {"X-Forwarded-By": "api-gateway"}
    if api_key:
        headers["X-API-Key"] = api_key
    if enterprise_id:
        headers["X-Enterprise-ID"] = enterprise_id
    if authorization:
        headers["Authorization"] = authorization
    return headers


# ── Request models ─────────────────────────────────────────────────────────────

class ArchiveRequest(BaseModel):
    documentId: str
    reason: Optional[str] = None
    retention_days: Optional[int] = None  # None = keep forever


class RestoreRequest(BaseModel):
    documentId: str
    reason: Optional[str] = None


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post(
    "/store",
    summary="Upload and store a document in the archive",
    dependencies=[Depends(get_current_user)],
)
async def store_document(
    request: Request,
    file: UploadFile = File(...),
    documentId: Optional[str] = Query(None, description="Optional client-supplied ID"),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Proxy a file upload to the archiving service for long-term storage.
    """
    content = await file.read()
    target_url = f"{_archive_balancer.next_url()}/archive/store"

    params = {}
    if documentId:
        params["documentId"] = documentId

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.post(
                target_url,
                files={"file": (file.filename, content, file.content_type)},
                params=params,
                headers=_downstream_headers(
                    settings.ARCHIVING_API_KEY,
                    current_user.enterprise_id,
                    request.headers.get("Authorization", ""),
                ),
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Archiving service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.get(
    "/{documentId}/presigned-url",
    summary="Generate a temporary URL for an archived document",
    dependencies=[Depends(get_current_user)],
)
async def get_presigned_url(
    request: Request,
    documentId: str,
    current_user: TokenPayload = Depends(get_current_user),
):
    target_url = f"{_archive_balancer.next_url()}/archive/{documentId}/presigned-url"

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            resp = await client.get(
                target_url,
                headers=_downstream_headers(
                    settings.ARCHIVING_API_KEY,
                    current_user.enterprise_id,
                    request.headers.get("Authorization", ""),
                ),
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Archiving service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.get(
    "/{documentId}",
    summary="Retrieve an archived document by ID",
    dependencies=[Depends(get_current_user)],
)
async def retrieve_document(
    request: Request,
    documentId: str,
    current_user: TokenPayload = Depends(get_current_user),
):
    target_url = f"{_archive_balancer.next_url()}/archive/{documentId}"

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.get(
                target_url,
                headers=_downstream_headers(
                    settings.ARCHIVING_API_KEY,
                    current_user.enterprise_id,
                    request.headers.get("Authorization", ""),
                ),
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Archiving service unreachable: {exc}",
            )

    # Stream back whatever the archiving service returns (binary or JSON)
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/octet-stream"),
    )


@router.get(
    "/",
    summary="List archived documents",
    dependencies=[Depends(get_current_user)],
)
async def list_archived(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: TokenPayload = Depends(get_current_user),
):
    target_url = f"{_archive_balancer.next_url()}/archive"
    params: dict = {"page": page, "page_size": page_size}
    if status_filter:
        params["status"] = status_filter

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            resp = await client.get(
                target_url,
                params=params,
                headers=_downstream_headers(
                    settings.ARCHIVING_API_KEY,
                    current_user.enterprise_id,
                    request.headers.get("Authorization", ""),
                ),
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Archiving service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.post(
    "/soft-delete",
    summary="Soft-delete (archive) a document — admin only",
    dependencies=[Depends(require_role("admin"))],
)
async def soft_delete(
    request: Request,
    payload: ArchiveRequest,
    current_user: TokenPayload = Depends(require_role("admin")),
):
    """
    Marks a document as archived/deleted without permanent removal.
    Requires the **admin** role.
    """
    target_url = f"{_archive_balancer.next_url()}/archive/soft-delete"

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            resp = await client.post(
                target_url,
                json=payload.model_dump(exclude_none=True),
                headers={
                    **_downstream_headers(
                        settings.ARCHIVING_API_KEY,
                        current_user.enterprise_id,
                        request.headers.get("Authorization", ""),
                    ),
                    "Content-Type": "application/json",
                },
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Archiving service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.post(
    "/restore",
    summary="Restore a soft-deleted document — admin only",
    dependencies=[Depends(require_role("admin"))],
)
async def restore_document(
    request: Request,
    payload: RestoreRequest,
    current_user: TokenPayload = Depends(require_role("admin")),
):
    """
    Restores a previously soft-deleted document.
    Requires the **admin** role.
    """
    target_url = f"{_archive_balancer.next_url()}/archive/restore"

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            resp = await client.post(
                target_url,
                json=payload.model_dump(exclude_none=True),
                headers={
                    **_downstream_headers(
                        settings.ARCHIVING_API_KEY,
                        current_user.enterprise_id,
                        request.headers.get("Authorization", ""),
                    ),
                    "Content-Type": "application/json",
                },
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Archiving service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.delete(
    "/{documentId}",
    summary="Permanently delete a document — admin only",
    dependencies=[Depends(require_role("admin"))],
)
async def permanent_delete(
    request: Request,
    documentId: str,
    current_user: TokenPayload = Depends(require_role("admin")),
):
    """
    Hard-deletes a document from the archive. **Irreversible.**
    Requires the **admin** role.
    """
    target_url = f"{_archive_balancer.next_url()}/archive/{documentId}"

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            resp = await client.delete(
                target_url,
                headers=_downstream_headers(
                    settings.ARCHIVING_API_KEY,
                    current_user.enterprise_id,
                    request.headers.get("Authorization", ""),
                ),
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Archiving service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )
