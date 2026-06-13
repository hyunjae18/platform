from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "API Gateway"
    DEBUG: bool = False
    
    JWT_SECRET: str = "docmind-secure-jwt-key-2024"
    ALGORITHM: str = "HS256"
    NODE_AUTH_URL: str = "http://localhost:3001"

    # ── Service URLs as lists (default values) ──────────────────────────────
    OCR_SERVICE_URLS: List[str] = [
        "http://ocr-service-1:8000",
        "http://ocr-service-2:8000",
        "http://ocr-service-3:8000",
    ]
    CLASSIFIER_SERVICE_URLS: List[str] = [
        "http://classifier-service-1:8002",
        "http://classifier-service-2:8002",
    ]
    SEARCH_SERVICE_URLS: List[str] = [
        "http://semantic-search-service-1:8003",
        "http://semantic-search-service-2:8003",
    ]
    METADATA_SERVICE_URLS: List[str] = [
        "http://metadata-service-1:8004",   # only one instance
    ]
    ARCHIVE_SERVICE_URLS: List[str] = [
        "http://archive-service:3007",
    ]
    DOCUMENT_SERVICE_URLS: List[str] = [
        "http://document-service:3000",
    ]

    # API Keys
    OCR_API_KEY: str = ""
    CLASSIFICATION_API_KEY: str = ""
    METADATA_API_KEY: str = ""
    ARCHIVING_API_KEY: str = ""
    DOCUMENT_API_KEY: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

def get_settings() -> Settings:
    return Settings()
