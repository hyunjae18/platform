import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from config import get_settings
from security import get_current_user
from load_balancer import get_balancer


router = APIRouter(prefix="/api/classify", tags=["classification"])
settings = get_settings()

TIMEOUT = 60.0

_classifier_balancer = get_balancer("classifier", settings.CLASSIFIER_SERVICE_URLS)

def _downstream_headers(api_key: str) -> dict:
    headers = {"X-Forwarded-By": "api-gateway"}
    if api_key:
        headers["X-API-Key"] = api_key
    return headers


# ── Request models ─────────────────────────────────────────────────────────────

class ClassifyTextRequest(BaseModel):
    text: str
    model: Optional[str] = None
    threshold: Optional[float] = 0.5


class ClassifyBatchRequest(BaseModel):
    texts: list[str]
    model: Optional[str] = None
    threshold: Optional[float] = 0.5


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post(
    "/text",
    summary="Classify a single text document",
    dependencies=[Depends(get_current_user)],
)
async def classify_text(payload: ClassifyTextRequest):
    """Proxy a single-document classification request to the downstream classification service."""
    target_url = f"{_classifier_balancer.next_url()}/classify"  # FIXED: _classifier_balancer

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.post(
                target_url,
                json=payload.model_dump(exclude_none=True),
                headers={
                    **_downstream_headers(settings.CLASSIFICATION_API_KEY),
                    "Content-Type": "application/json",
                },
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Classification service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.post(
    "/batch",
    summary="Classify multiple text documents in one request",
    dependencies=[Depends(get_current_user)],
)
async def classify_batch(payload: ClassifyBatchRequest):
    """Proxy a batch classification request."""
    target_url = f"{_classifier_balancer.next_url()}/classify/batch"  # FIXED: _classifier_balancer

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.post(
                target_url,
                json=payload.model_dump(exclude_none=True),
                headers={
                    **_downstream_headers(settings.CLASSIFICATION_API_KEY),
                    "Content-Type": "application/json",
                },
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Classification service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.get(
    "/labels",
    summary="Retrieve available classification labels from the downstream service",
    dependencies=[Depends(get_current_user)],
)
async def list_labels():
    target_url = f"{_classifier_balancer.next_url()}/labels"  # FIXED: _classifier_balancer

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.get(
                target_url,
                headers=_downstream_headers(settings.CLASSIFICATION_API_KEY),
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Classification service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )
