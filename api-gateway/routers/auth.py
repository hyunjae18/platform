# api_gateway/routers/auth.py
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import httpx
from jose import jwt
import logging

from config import get_settings

logger = logging.getLogger("api_gateway")
router = APIRouter(prefix="/api/auth", tags=["authentication"])
security = HTTPBearer()
settings = get_settings()

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    enterpriseId: str
    requestedRole: Optional[str] = "member"

@router.post("/login")
async def login(request: LoginRequest):
    """Forward login to the Node.js auth service."""
    logger.info(f"Login attempt: {request.email}")
    logger.info(f"Forwarding to: {settings.NODE_AUTH_URL}/api/auth/login")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{settings.NODE_AUTH_URL}/api/auth/login",
                json=request.dict()
            )
            
            logger.info(f"Node.js responded with status: {response.status_code}")
            
            if response.status_code != 200:
                error_detail = response.json().get("message", "Login failed")
                logger.warning(f"Login failed: {error_detail}")
                raise HTTPException(status_code=response.status_code, detail=error_detail)
            
            logger.info(f"Login successful for {request.email}")
            return response.json()
            
        except httpx.ConnectError:
            logger.error(f"Cannot connect to Node.js auth at {settings.NODE_AUTH_URL}")
            raise HTTPException(
                status_code=503, 
                detail=f"Auth service unavailable at {settings.NODE_AUTH_URL}. Make sure the Node.js auth service is running."
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Login error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

@router.post("/register")
async def register(request: RegisterRequest):
    """Forward registration to Node.js"""
    logger.info(f"Registration attempt: {request.email}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{settings.NODE_AUTH_URL}/api/auth/register",
                json=request.dict()
            )
            
            if response.status_code not in [200, 201]:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("message", "Registration failed")
                )
            
            logger.info(f"Registration successful for {request.email}")
            return response.json()
            
        except httpx.ConnectError:
            logger.error(f"Cannot connect to Node.js at {settings.NODE_AUTH_URL}")
            raise HTTPException(status_code=503, detail="Auth service unavailable")
        except HTTPException:
            raise

@router.get("/me")
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user info"""
    token = credentials.credentials
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"{settings.NODE_AUTH_URL}/api/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid token")
            
            return response.json()
            
        except httpx.ConnectError:
            logger.error(f"Cannot connect to Node.js at {settings.NODE_AUTH_URL}")
            raise HTTPException(status_code=503, detail="Auth service unavailable")
        except HTTPException:
            raise

@router.get("/validate")
async def validate_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Validate JWT token"""
    token = credentials.credentials
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"{settings.NODE_AUTH_URL}/api/auth/validate",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid token")
            
            return response.json()
            
        except httpx.ConnectError:
            logger.error(f"Cannot connect to Node.js at {settings.NODE_AUTH_URL}")
            raise HTTPException(status_code=503, detail="Auth service unavailable")
        except HTTPException:
            raise

@router.post("/request-password-reset")
async def request_password_reset(request: Request):
    """Request password reset"""
    body = await request.json()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{settings.NODE_AUTH_URL}/api/auth/request-password-reset",
                json=body
            )
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("message", "Password reset request failed"),
                )
            return response.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Auth service unavailable")
        except HTTPException:
            raise

@router.post("/reset-password")
async def reset_password(request: Request):
    """Reset password with token"""
    body = await request.json()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{settings.NODE_AUTH_URL}/api/auth/reset-password",
                json=body
            )
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("message", "Password reset failed"),
                )
            return response.json()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Auth service unavailable")
        except HTTPException:
            raise
