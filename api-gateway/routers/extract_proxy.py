import httpx
from fastapi import APIRouter, Request, Response, HTTPException
from config import get_settings
from load_balancer import get_balancer

router = APIRouter(tags=["extraction"])
settings = get_settings()
balancer = get_balancer("metadata", settings.METADATA_SERVICE_URLS)

@router.post("/extract")
@router.post("/metadata/extract")
async def proxy_extract(request: Request):
    # Read the raw body as bytes to preserve exact JSON
    body = await request.body()
    target_url = f"{balancer.next_url()}/extract"
    
    # Forward all headers except Host
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(target_url, content=body, headers=headers)
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type=resp.headers.get("content-type", "application/json"),
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Metadata service unreachable: {e}")
