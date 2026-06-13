import logging
import httpx

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    status,
    Query,
    Header,
    Request,
)

from fastapi.responses import Response

from config import get_settings
from security import get_current_user
from load_balancer import get_balancer

logger = logging.getLogger("api_gateway.ocr")

router = APIRouter(
    prefix="/api/ocr",
    tags=["ocr"]
)

settings = get_settings()

TIMEOUT = 60.0

_ocr_balancer = get_balancer("ocr", settings.OCR_SERVICE_URLS)


def _downstream_headers(api_key: str) -> dict:
    headers = {
        "X-Forwarded-By": "api-gateway"
    }

    if api_key:
        headers["X-API-Key"] = api_key

    return headers


async def _request_with_failover(
    method: str,
    path: str,
    **kwargs
):
    last_error = None

    for _ in range(len(settings.OCR_SERVICE_URLS)):
        base_url = _ocr_balancer.next_url()
        target_url = f"{base_url}{path}"

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.request(method, target_url, **kwargs)
            return response

        except httpx.RequestError as exc:
            logger.warning("OCR instance failed: %s", target_url)
            last_error = exc

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"All OCR instances unavailable: {last_error}"
    )


# ------------------------------------------------------------------
# Extract OCR
# ------------------------------------------------------------------

@router.post(
    "/extract",
    summary="Extract text from uploaded image/pdf",
    # dependencies=[Depends(get_current_user)]
)
async def ocr_extract(
    file: UploadFile = File(...),
    dpi: int = Query(default=200, ge=72, le=400, description="Rendering DPI for PDF/PPTX pages"),
    force: bool = Query(default=False, description="Force OCR processing even if low quality is detected"),
    x_enterprise_id: str = Header(None, alias="X-Enterprise-ID"),
):
    content = await file.read()
    
    # Forward query parameters to downstream service
    params = {"dpi": dpi, "force": force}

    # Add enterprise ID to downstream headers
    downstream_headers = _downstream_headers(settings.OCR_API_KEY)
    if x_enterprise_id:
        downstream_headers["X-Enterprise-ID"] = x_enterprise_id

    response = await _request_with_failover(
        "POST",
        "/ocr/extract",
        params=params,
        files={
            "file": (
                file.filename,
                content,
                file.content_type
            )
        },
        headers=downstream_headers
    )

    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type=response.headers.get("content-type", "application/json")
    )


# ------------------------------------------------------------------
# Job Status
# ------------------------------------------------------------------

@router.get(
    "/status/{job_id}",
    summary="OCR Job Status",
    dependencies=[Depends(get_current_user)]
)
async def ocr_job_status(job_id: str):
    response = await _request_with_failover(
        "GET",
        f"/status/{job_id}",
        headers=_downstream_headers(settings.OCR_API_KEY)
    )

    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type=response.headers.get("content-type", "application/json")
    )


# ------------------------------------------------------------------
# Failure Callback (Called by OCR/Classifier/Metadata/Search)
# ------------------------------------------------------------------

@router.post(
    "/failure",
    summary="Report processing failure for a document",
    status_code=status.HTTP_202_ACCEPTED,
)
async def report_failure(
    payload: dict,
    x_enterprise_id: str = Header(..., alias="X-Enterprise-ID"),
    request: Request = None,
):
    """
    Called by any downstream service (OCR, classifier, metadata, search)
    when a document fails to process.
    """
    doc_id = payload.get("documentId")
    error_msg = payload.get("error_message")
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing documentId")

    # Forward to document service
    document_service_url = settings.DOCUMENT_SERVICE_URLS[0]
    if not document_service_url:
        logger.error("DOCUMENT_SERVICE_URL not configured")
        raise HTTPException(status_code=500, detail="Internal configuration error")

    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                f"{document_service_url}/documents/fail",
                json={"documentId": doc_id, "error_message": error_msg},
                headers={"X-Enterprise-ID": x_enterprise_id},
                timeout=5.0,
            )
        except Exception as e:
            logger.error(f"Failed to forward failure to document service: {e}")
            raise HTTPException(status_code=502, detail="Document service unreachable")

    return {"status": "failure recorded"}


# ------------------------------------------------------------------
# Health Check
# ------------------------------------------------------------------

@router.get("/health")
async def health():
    results = []

    async with httpx.AsyncClient(timeout=5.0) as client:
        for url in settings.OCR_SERVICE_URLS:
            try:
                r = await client.get(f"{url}/health")
                results.append({
                    "url": url,
                    "status": "up",
                    "code": r.status_code
                })
            except Exception:
                results.append({
                    "url": url,
                    "status": "down"
                })

    return {
        "instances": results
    }
