import time
import logging
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

# Move these imports to the top!
from config import get_settings
from jose import jwt

logger = logging.getLogger("api_gateway.middleware")

PUBLIC_PATHS: set[str] = {
    "/auth/token",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/health",
}

class AuthLoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        # Load settings ONCE during startup
        self.settings = get_settings()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()

        # ── Attach username to request state ───
        request.state.username = "anonymous"
        
        if request.url.path not in PUBLIC_PATHS:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                try:
                    # Use the pre-loaded settings here
                    payload = jwt.decode(
                        token,
                        self.settings.JWT_SECRET,
                        algorithms=[self.settings.ALGORITHM],
                    )
                    request.state.username = payload.get("sub") or payload.get("userId", "anonymous")
                    request.state.enterprise_id = payload.get("enterpriseId")
                except Exception:
                    pass  # Invalid token — let the route handler raise 401

        # ── Process request ───────────────────────────────────────────────────
        response: Response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        return response
