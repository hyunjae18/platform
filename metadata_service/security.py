"""
JWT Security Module with Access & Refresh Tokens
Service-to-service authentication for on-premise deployment.
"""

import os
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict

from jose import jwt, JWTError
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# --- Config from env (override in production) ---
SECRET_KEY = os.getenv(
    "JWT_SECRET",
    os.getenv("JWT_SECRET_KEY", "docmind-secure-jwt-key-2024"),
)
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# In-memory refresh token store.
# PRODUCTION NOTE: Replace with Redis / PostgreSQL for multi-replica deployments.
_refresh_token_store: Dict[str, Dict] = {}

security = HTTPBearer(auto_error=False)


def create_access_token(service_name: str) -> str:
    """Create short-lived JWT access token."""
    payload = {
        "sub": service_name,
        "type": "access",
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": secrets.token_hex(16)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(service_name: str) -> str:
    """Create long-lived opaque refresh token."""
    token_id = secrets.token_urlsafe(32)
    exp = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    _refresh_token_store[token_id] = {
        "service": service_name,
        "exp": exp,
        "created_at": datetime.utcnow()
    }
    return token_id


def verify_access_token(token: str) -> Optional[Dict]:
    """Verify JWT access token. Returns payload or None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def verify_refresh_token(token: str) -> Optional[Dict]:
    """Verify opaque refresh token. Returns data or None."""
    data = _refresh_token_store.get(token)
    if not data:
        return None
    if datetime.utcnow() > data["exp"]:
        del _refresh_token_store[token]
        return None
    return data


def revoke_refresh_token(token: str) -> bool:
    """Revoke a refresh token."""
    if token in _refresh_token_store:
        del _refresh_token_store[token]
        return True
    return False


def get_current_service(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    """FastAPI dependency to enforce valid access token."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    payload = verify_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")
    return payload["sub"]
