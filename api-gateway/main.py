import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import logging
import logging.config

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from middleware.auth_middleware import AuthLoggingMiddleware
from routers import auth, ocr_proxy, search_proxy, classification_proxy, metadata_proxy, archiving_proxy, documents_proxy, node_proxy
from routers.extract_proxy import router as extract_router
from routers.admin_proxy import router as admin_router   # <-- NEW

# ── Logging setup ─────────────────────────────────────────────────────────────

logging.config.dictConfig(
    {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "default",
            }
        },
        "root": {"level": "INFO", "handlers": ["console"]},
    }
)

logger = logging.getLogger("api_gateway")

# ── App factory ───────────────────────────────────────────────────────────────

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description=(
            "Centralised API Gateway that authenticates requests via JWT and "
            "proxies them to the OCR, Search, Classification, and Document micro-services."
        ),
        version="2.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Custom middleware ─────────────────────────────────────────────────────
    app.add_middleware(AuthLoggingMiddleware)

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(auth.router)                 # /api/auth/*
    app.include_router(ocr_proxy.router)            # /api/ocr/*
    app.include_router(search_proxy.router)         # /api/search/*
    app.include_router(classification_proxy.router) # /api/classify/*
    app.include_router(metadata_proxy.router)       # /api/metadata/*
    app.include_router(archiving_proxy.router)      # /api/archive/*
    app.include_router(documents_proxy.router)      # /api/documents/*
    app.include_router(node_proxy.router)           # /api/profile, /api/notifications, /api/workflows
    app.include_router(extract_router, prefix="/api")   # /api/extract/*
    app.include_router(admin_router)                # <-- NEW: /api/admin/* and /api/support/*

    # ── Health check endpoints ───────────────────────────────────────────────
    @app.get("/health", tags=["health"], summary="Liveness probe")
    async def health():
        return {
            "status": "ok", 
            "service": settings.APP_NAME,
            "version": "2.0.0"
        }

    @app.get("/api/health", tags=["health"], summary="API Health check")
    async def api_health():
        return {
            "status": "ok",
            "service": settings.APP_NAME,
            "routes": [
                "/api/auth/*",
                "/api/documents/*",
                "/api/ocr/*",
                "/api/search/*",
                "/api/classify/*",
                "/api/metadata/*",
                "/api/archive/*",
                "/api/extract/*",
                "/api/profile",
                "/api/notifications/*",
                "/api/workflows/*",
                "/api/admin/*",           # <-- NEW
                "/api/support/*"          # <-- NEW
            ]
        }

    logger.info("API Gateway started — debug=%s", settings.DEBUG)
    logger.info("Available routes:")
    logger.info("  - Authentication: /api/auth/*")
    logger.info("  - Documents: /api/documents/*")
    logger.info("  - OCR: /api/ocr/*")
    logger.info("  - Search: /api/search/*")
    logger.info("  - Classification: /api/classify/*")
    logger.info("  - Metadata: /api/metadata/*")
    logger.info("  - Archive: /api/archive/*")
    logger.info("  - Extraction: /api/extract/*")
    logger.info("  - App routes: /api/profile, /api/notifications/*, /api/workflows/*")
    logger.info("  - Admin: /api/admin/*")        # <-- NEW
    logger.info("  - Support: /api/support/*")    # <-- NEW

    return app


app = create_app()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=settings.DEBUG,
        log_level="info",
    )
