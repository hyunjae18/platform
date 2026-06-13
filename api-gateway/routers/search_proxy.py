import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional

from config import get_settings
from load_balancer import get_balancer
from security import TokenPayload, get_current_user


router = APIRouter(prefix="/api/search", tags=["search"])
security = HTTPBearer()
settings = get_settings()

TIMEOUT = 60.0

_search_balancer = get_balancer("search", settings.SEARCH_SERVICE_URLS)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    search_type: str = "hybrid"  # keyword, semantic, hybrid
    filter_language: Optional[str] = None
    filter_document_type: Optional[str] = None
    filter_category: Optional[str] = None


@router.post("")
@router.post("/")
@router.post("/query")
async def search(
    payload: SearchRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Search documents through API Gateway"""
    token = credentials.credentials
    print(f"Search request: query={payload.query}, type={payload.search_type}")
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            response = await client.post(
                f"{_search_balancer.next_url()}/search/query",  # FIXED: _search_balancer
                json=payload.model_dump(),
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Enterprise-ID": current_user.enterprise_id,
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                print(f"Search service returned {response.status_code}: {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Search service error"
                )
            
            return response.json()
            
        except httpx.ConnectError as e:
            print(f"Cannot connect to search service: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Search service unavailable"
            )
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Search service timeout"
            )
        except Exception as e:
            print(f"Search error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Search error: {str(e)}"
            )


@router.get("")
@router.get("/")
@router.get("/query")
async def search_get(
    q: str,
    top_k: int = 10,
    search_type: str = "hybrid",
    credentials: HTTPAuthorizationCredentials = Depends(security),
    current_user: TokenPayload = Depends(get_current_user),
):
    """GET search request"""
    payload = SearchRequest(
        query=q,
        top_k=top_k,
        search_type=search_type
    )
    
    return await search(payload, credentials, current_user)
