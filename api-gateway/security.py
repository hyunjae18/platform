import logging
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from config import get_settings   # Assumes config.py has a get_settings() function

logger = logging.getLogger("api_gateway")
settings = get_settings()
bearer_scheme = HTTPBearer()


class TokenPayload(BaseModel):
    sub: str          # user id (Node.js uses "sub")
    email: str
    role: str
    enterprise_id: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> TokenPayload:
    token = credentials.credentials
    logger.debug(f"Token received (first 50 chars): {token[:50]}...")
    
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.ALGORITHM],
        )
        logger.debug(f"Decoded payload: {payload}")
    except JWTError as exc:
        logger.error(f"JWT decode failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract claims – handle both "sub" and "userId" for compatibility
    user_id = payload.get("sub") or payload.get("userId")
    email = payload.get("email")
    role = payload.get("role")
    enterprise_id = payload.get("enterpriseId")   # Node auth server uses "enterpriseId"

    if not user_id or not email or not role:
        logger.error(f"Missing claims - sub: {user_id}, email: {email}, role: {role}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing required fields (sub, email, role)",
        )

    if not enterprise_id:
        logger.error("Missing enterpriseId claim")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing enterpriseId in token",
        )

    return TokenPayload(
        sub=user_id,
        email=email,
        role=role,
        enterprise_id=enterprise_id,
    )


def require_role(role: str):
    async def role_checker(current_user: TokenPayload = Depends(get_current_user)):
        if current_user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' required. Your role: '{current_user.role}'",
            )
        return current_user
    return role_checker