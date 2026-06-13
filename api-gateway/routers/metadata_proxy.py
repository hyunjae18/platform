import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from config import get_settings
from security import TokenPayload, get_current_user
from load_balancer import get_balancer


router = APIRouter(prefix="/api/metadata", tags=["metadata"])
settings = get_settings()

TIMEOUT = 20.0

_metadata_balancer = get_balancer("metadata", settings.METADATA_SERVICE_URLS)

def _downstream_headers(api_key: str = "", enterprise_id: str = "") -> dict:
    headers = {"X-Forwarded-By": "api-gateway"}
    if api_key:
        headers["X-API-Key"] = api_key
    if enterprise_id:
        headers["X-Enterprise-ID"] = enterprise_id
    return headers


# ── Request models ─────────────────────────────────────────────────────────────

class MetadataCreateRequest(BaseModel):
    documentId: str
    title: Optional[str] = None
    author: Optional[str] = None
    tags: Optional[list[str]] = []
    extra: Optional[dict] = None


class MetadataUpdateRequest(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    tags: Optional[list[str]] = None
    extra: Optional[dict] = None


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post(
    "/",
    summary="Create metadata record for a document",
    dependencies=[Depends(get_current_user)],
)
async def create_metadata(
    payload: MetadataCreateRequest,
    current_user: TokenPayload = Depends(get_current_user),
):
    target_url = f"{_metadata_balancer.next_url()}/metadata"  # FIXED: _metadata_balancer

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.post(
                target_url,
                json=payload.model_dump(exclude_none=True),
                headers={
                    **_downstream_headers(
                        settings.METADATA_API_KEY,
                        current_user.enterprise_id,
                    ),
                    "Content-Type": "application/json",
                },
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Metadata service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.get(
    "/{documentId}",
    summary="Retrieve metadata for a document",
    dependencies=[Depends(get_current_user)],
)
async def get_metadata(
    documentId: str,
    current_user: TokenPayload = Depends(get_current_user),
):
    target_url = f"{_metadata_balancer.next_url()}/metadata/{documentId}"  # FIXED: _metadata_balancer

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.get(
                target_url,
                headers=_downstream_headers(
                    settings.METADATA_API_KEY,
                    current_user.enterprise_id,
                ),
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Metadata service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.patch(
    "/{documentId}",
    summary="Update metadata fields for a document",
    dependencies=[Depends(get_current_user)],
)
async def update_metadata(
    documentId: str,
    payload: MetadataUpdateRequest,
    current_user: TokenPayload = Depends(get_current_user),
):
    target_url = f"{_metadata_balancer.next_url()}/metadata/{documentId}"  # FIXED: _metadata_balancer

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.patch(
                target_url,
                json=payload.model_dump(exclude_none=True),
                headers={
                    **_downstream_headers(
                        settings.METADATA_API_KEY,
                        current_user.enterprise_id,
                    ),
                    "Content-Type": "application/json",
                },
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Metadata service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.delete(
    "/{documentId}",
    summary="Delete metadata record for a document",
    dependencies=[Depends(get_current_user)],
)
async def delete_metadata(
    documentId: str,
    current_user: TokenPayload = Depends(get_current_user),
):
    target_url = f"{_metadata_balancer.next_url()}/metadata/{documentId}"  # FIXED: _metadata_balancer

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.delete(
                target_url,
                headers=_downstream_headers(
                    settings.METADATA_API_KEY,
                    current_user.enterprise_id,
                ),
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Metadata service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )


@router.get(
    "/",
    summary="List / search metadata records",
    dependencies=[Depends(get_current_user)],
)
async def list_metadata(
    tag: Optional[str] = Query(None, description="Filter by tag"),
    author: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: TokenPayload = Depends(get_current_user),
):
    target_url = f"{_metadata_balancer.next_url()}/metadata"  # FIXED: _metadata_balancer
    params = {"page": page, "page_size": page_size}
    if tag:
        params["tag"] = tag
    if author:
        params["author"] = author

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.get(
                target_url,
                params=params,
                headers=_downstream_headers(
                    settings.METADATA_API_KEY,
                    current_user.enterprise_id,
                ),
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Metadata service unreachable: {exc}",
            )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
    )
