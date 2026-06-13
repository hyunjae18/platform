from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── Incoming payload from OCR / Message Broker ────────────────────────────────

class IndexRequest(BaseModel):
    documentId: str
    filename: str
    raw_text: str
    language: Optional[str] = "unknown"
    document_type: Optional[str] = None
    category: Optional[str] = None
    processed_at: Optional[str] = None


# ── Search request ─────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query text")
    top_k: int = Field(5, ge=1, le=50, description="Number of results to return")
    search_type: str = Field(
        "hybrid",
        description="'semantic', 'keyword', or 'hybrid'",
    )
    filter_language: Optional[str] = None
    filter_document_type: Optional[str] = None
    filter_category: Optional[str] = None


# ── Search result ──────────────────────────────────────────────────────────────

class SearchHit(BaseModel):
    documentId: str
    filename: str
    raw_text: str
    language: Optional[str]
    document_type: Optional[str]
    metadata: Optional[dict] = None
    category: Optional[str]
    score: float
    processed_at: Optional[str]


class SearchResponse(BaseModel):
    query: str
    total_hits: int
    search_type: str
    results: list[SearchHit]
    searched_at: str


# ── Index response ─────────────────────────────────────────────────────────────

class IndexResponse(BaseModel):
    success: bool
    documentId: str
    message: str
