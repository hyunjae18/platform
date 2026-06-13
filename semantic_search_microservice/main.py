import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config import settings
from embedding_engine import embedding_engine
from es_client import es_client
from rabbitmq_consumer import rabbitmq_consumer
from schemas import (
    IndexRequest,
    IndexResponse,
    SearchRequest,
    SearchResponse,
    SearchHit,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer()


def get_enterprise_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
        )

    enterprise_id = payload.get("enterpriseId")
    if not enterprise_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing enterpriseId in token",
        )
    return enterprise_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== Semantic Search Service starting ===")

    # 1. Initialize embedding model
    logger.info("Initializing embedding engine...")
    embedding_engine.initialize()

    # 2. Connect to Elasticsearch and ensure index exists
    logger.info("Connecting to Elasticsearch...")
    es_client.connect()

    # 3. Connect to RabbitMQ and start consuming classification_result_queue
    logger.info("Connecting to RabbitMQ...")
    await rabbitmq_consumer.connect()

    logger.info("=== All systems ready ===")
    logger.info(f"   Listening on queue: classification_result_queue")
    logger.info(f"   Publishing to: document.search.indexed")

    yield

    # Graceful shutdown
    await rabbitmq_consumer.close()
    logger.info("=== Semantic Search Service stopped ===")


app = FastAPI(
    title="Semantic Search Service", 
    description="Document search service with keyword, semantic, and hybrid search capabilities",
    version="2.0",
    lifespan=lifespan
)


@app.post("/search/metadata/update")
async def update_document_metadata(payload: dict):
    document_id = payload.get("documentId") or payload.get("doc_id")
    enterprise_id = payload.get("enterprise_id") or payload.get("enterpriseId") or "ENT_DEFAULT"
    metadata_fields = payload.get("metadata_fields") or payload.get("metadata") or {}

    if not document_id:
        raise HTTPException(status_code=400, detail="documentId is required")
    if not metadata_fields:
        raise HTTPException(status_code=400, detail="metadata_fields is required")

    updated = es_client.update_metadata(document_id, enterprise_id, metadata_fields)
    return {
        "success": updated,
        "documentId": document_id,
        "enterprise_id": enterprise_id,
    }


# ── Health check ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "semantic-search",
        "version": "2.0",
        "rabbitmq_connected": rabbitmq_consumer._connection is not None,
        "elasticsearch_connected": es_client is not None,
        "queues": {
            "consumes_from": "classification_result_queue",
            "publishes_to": "document.search.indexed"
        }
    }


@app.get("/")
async def root():
    return {
        "service": "Semantic Search Service",
        "version": "2.0",
        "search_types": ["keyword", "semantic", "hybrid"],
        "queues": {
            "input": "classification_result_queue",
            "output_to_document_service": "document.search.indexed"
        },
        "endpoints": {
            "health": "/health",
            "search": "/search/query",
            "index": "/search/index",
            "delete": "/search/index/{documentId}"
        }
    }


# ── Index a document (REST fallback, bypasses RabbitMQ) ───────────────────────

@app.post("/search/index", response_model=IndexResponse)
async def index_document(
    req: IndexRequest,
    enterprise_id: str = Depends(get_enterprise_id),
):
    """
    Index a document directly (without RabbitMQ).
    Useful for testing or manual indexing.
    """
    try:
        doc = req.model_dump()
        doc["enterprise_id"] = enterprise_id
        success = es_client.index_document(doc)
        
        # Notify document service if this was a direct index
        if success and req.documentId:
            await rabbitmq_consumer._publish_to_document_service(
                req.documentId,
                enterprise_id,
                success=True,
            )
        
        return IndexResponse(
            success=success,
            documentId=req.documentId,
            message="Document indexed successfully" if success else "Indexing failed",
        )
    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Search ─────────────────────────────────────────────────────────────────────

@app.post("/search/query", response_model=SearchResponse)
def search(
    req: SearchRequest,
    enterprise_id: str = Depends(get_enterprise_id),
):
    """
    Search for documents using keyword, semantic, or hybrid search.
    
    - **keyword**: Traditional text search (faster, exact matches)
    - **semantic**: Vector similarity search (understanding meaning)
    - **hybrid**: Combines both methods for best results
    """
    filters = {
        "enterprise_id":  enterprise_id,
        "language":      req.filter_language,
        "document_type": req.filter_document_type,
        "category":      req.filter_category,
    }

    try:
        if req.search_type == "keyword":
            logger.info(f"Keyword search: '{req.query}'")
            hits = es_client.keyword_search(req.query, req.top_k, filters)
        elif req.search_type == "semantic":
            logger.info(f"Semantic search: '{req.query}'")
            hits = es_client.semantic_search(req.query, req.top_k, filters)
        else:  # hybrid (default)
            logger.info(f"Hybrid search: '{req.query}'")
            hits = es_client.hybrid_search(req.query, req.top_k, filters)

        return SearchResponse(
            query=req.query,
            total_hits=len(hits),
            search_type=req.search_type,
            results=[SearchHit(**h) for h in hits],
            searched_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Advanced search with more filters ─────────────────────────────────────────

@app.post("/search/advanced")
async def advanced_search(
    query: str,
    top_k: int = Query(10, ge=1, le=100),
    search_type: str = Query("hybrid", regex="^(keyword|semantic|hybrid)$"),
    language: Optional[str] = None,
    document_type: Optional[str] = None,
    category: Optional[str] = None,
    min_confidence: Optional[float] = Query(None, ge=0, le=1),
    enterprise_id: str = Depends(get_enterprise_id),
):
    """
    Advanced search with additional filters and confidence scoring.
    """
    filters = {
        "enterprise_id": enterprise_id,
        "language": language,
        "document_type": document_type,
        "category": category,
    }
    
    # Remove None values
    filters = {k: v for k, v in filters.items() if v is not None}

    try:
        if search_type == "keyword":
            hits = es_client.keyword_search(query, top_k, filters)
        elif search_type == "semantic":
            hits = es_client.semantic_search(query, top_k, filters)
        else:
            hits = es_client.hybrid_search(query, top_k, filters)
        
        # Apply confidence filter if specified
        if min_confidence:
            hits = [h for h in hits if h.get("score", 0) >= min_confidence]
        
        return {
            "query": query,
            "search_type": search_type,
            "total_hits": len(hits),
            "min_confidence": min_confidence,
            "results": hits,
            "searched_at": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"Advanced search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Delete a document from the index ──────────────────────────────────────────

@app.delete("/search/index/{documentId}")
async def delete_document(
    documentId: str,
    enterprise_id: str = Depends(get_enterprise_id),
):
    """
    Delete a document from the search index.
    Also notifies document service about the deletion.
    """
    deleted = es_client.delete_document(documentId, enterprise_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found in index")
    
    # Notify document service about deletion
    try:
        await rabbitmq_consumer._publish_to_document_service(
            documentId,
            enterprise_id,
            success=True, 
            error_msg="Document deleted from search index"
        )
    except Exception as e:
        logger.warning(f"Could not notify document service about deletion: {e}")
    
    return {"success": True, "documentId": documentId, "message": "Document deleted from search index"}


# ── Get index statistics ──────────────────────────────────────────────────────

@app.get("/search/stats")
async def get_index_stats():
    """Get statistics about the search index"""
    try:
        stats = es_client.get_index_stats()
        return {
            "service": "semantic-search",
            "index_name": es_client.index_name,
            "stats": stats,
            "queues": {
                "consumes": "classification_result_queue",
                "publishes": "document.search.indexed"
            }
        }
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
