import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from config import get_settings
from security import get_current_user

router = APIRouter(prefix="/api", tags=["app"])
settings = get_settings()


def node_url() -> str:
    return settings.NODE_AUTH_URL.rstrip("/")


async def forward_to_node(request: Request, path: str) -> JSONResponse:
    headers = dict(request.headers)
    headers.pop("host", None)
    body = await request.body()

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.request(
                method=request.method,
                url=f"{node_url()}/api/{path.lstrip('/')}",
                headers=headers,
                params=request.query_params,
                content=body,
            )
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Node app service unavailable")
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Node app proxy failed: {exc}")

    try:
        content = response.json()
    except ValueError:
        content = {"message": response.text}

    return JSONResponse(content=content, status_code=response.status_code)


@router.api_route(
    "/notifications",
    methods=["GET"],
    dependencies=[Depends(get_current_user)],
)
async def notifications(request: Request):
    return await forward_to_node(request, "notifications")


@router.api_route(
    "/notifications/{notification_id}/read",
    methods=["POST"],
    dependencies=[Depends(get_current_user)],
)
async def notification_read(request: Request, notification_id: str):
    return await forward_to_node(request, f"notifications/{notification_id}/read")


@router.api_route(
    "/profile",
    methods=["GET", "PUT"],
    dependencies=[Depends(get_current_user)],
)
async def profile(request: Request):
    return await forward_to_node(request, "profile")


@router.api_route(
    "/workflows",
    methods=["GET", "POST"],
    dependencies=[Depends(get_current_user)],
)
async def workflows(request: Request):
    return await forward_to_node(request, "workflows")


@router.api_route(
    "/workflows/{workflow_id}/run",
    methods=["POST"],
    dependencies=[Depends(get_current_user)],
)
async def workflow_run(request: Request, workflow_id: str):
    return await forward_to_node(request, f"workflows/{workflow_id}/run")
