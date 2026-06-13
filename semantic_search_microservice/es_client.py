import logging
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from elasticsearch import Elasticsearch, NotFoundError
from elasticsearch.helpers import bulk
from config import settings
from embedding_engine import embedding_engine

logger = logging.getLogger(__name__)

# ==================================================================
# INDEX MAPPING – includes all metadata fields
# ==================================================================
INDEX_MAPPING = {
    "mappings": {
        "properties": {
            # Core fields
            "chunk_id":       {"type": "keyword"},
            "documentId":     {"type": "keyword"},
            "enterprise_id":   {"type": "keyword"},
            "filename":       {"type": "keyword"},
            "raw_text":       {"type": "text", "analyzer": "standard"},
            "language":       {"type": "keyword"},
            "document_type":  {"type": "keyword"},
            "category":       {"type": "keyword"},
            "processed_at":   {"type": "date"},          # changed to date for range queries

            # ---- Metadata fields from GLiNER ----
            "person_name":    {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "organization":   {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "date":           {"type": "date"},          # for single extracted date
            "amount":         {"type": "float"},
            "currency":       {"type": "keyword"},
            "address":        {"type": "text"},
            "city":           {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "country":        {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "phone":          {"type": "text"},
            "email":          {"type": "text"},
            "invoice_number": {"type": "keyword"},
            "contract_number":{"type": "keyword"},
            "registration_number": {"type": "keyword"},
            "keywords":       {"type": "text"},          # top keywords from GLiNER

            # Full raw metadata (for debugging/display)
            "metadata":       {"type": "object", "enabled": True},

            # Embedding vector
            "embedding": {
                "type":       "dense_vector",
                "dims":       settings.embedding_dim,
                "index":       True,
                "similarity": "cosine",
                "index_options": {
                    "type": "hnsw",
                    "m": 16,
                    "ef_construction": 100
                }
            }
        }
    }
}


class ESClient:
    def __init__(self):
        self._client: Elasticsearch | None = None

    def connect(self):
        self._client = Elasticsearch(settings.elasticsearch_host)
        logger.info(f"Connected to Elasticsearch at {settings.elasticsearch_host}")
        self._ensure_index()

    def _ensure_index(self):
        idx = settings.elasticsearch_index
        if not self._client.indices.exists(index=idx):
            self._client.indices.create(index=idx, body=INDEX_MAPPING)
            logger.info(f"Created Elasticsearch index '{idx}'")
        else:
            logger.info(f"Elasticsearch index '{idx}' already exists")

    # ──────────────────────────────────────────────────────────────────
    # Text chunking (unchanged)
    # ──────────────────────────────────────────────────────────────────
    def _chunk_text(self, text: str, chunk_size: int = 400, overlap: int = 50) -> list[str]:
        words = text.split()
        chunks = []
        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            if chunk.strip():
                chunks.append(chunk)
        return chunks

    def _first_value(self, *values):
        for value in values:
            if isinstance(value, list) and value:
                return value[0]
            if value not in (None, "", []):
                return value
        return None

    def _normalize_metadata(self, metadata_fields: dict | None) -> dict:
        metadata_fields = metadata_fields or {}
        entities = metadata_fields.get("entities") or {}
        contact = metadata_fields.get("contact_info") or {}
        numbers = metadata_fields.get("document_numbers") or {}
        financial = metadata_fields.get("financial") or {}

        normalized = {
            "person_name": self._first_value(metadata_fields.get("person_name"), entities.get("people")),
            "organization": self._first_value(metadata_fields.get("organization_name"), entities.get("organizations")),
            "date": self._first_value(metadata_fields.get("date"), metadata_fields.get("dates")),
            "amount": self._first_value(metadata_fields.get("amount"), financial.get("amount")),
            "currency": self._first_value(metadata_fields.get("currency"), financial.get("currency")),
            "address": self._first_value(metadata_fields.get("address"), entities.get("places")),
            "city": metadata_fields.get("city"),
            "country": metadata_fields.get("country"),
            "phone": self._first_value(metadata_fields.get("phone"), contact.get("phones")),
            "email": self._first_value(metadata_fields.get("email"), contact.get("emails")),
            "invoice_number": self._first_value(metadata_fields.get("invoice_number"), numbers.get("invoice")),
            "contract_number": self._first_value(metadata_fields.get("contract_number"), numbers.get("contract")),
            "registration_number": self._first_value(metadata_fields.get("registration_number"), numbers.get("registration")),
            "keywords": metadata_fields.get("keywords") or [],
            "metadata": metadata_fields,
        }
        if isinstance(normalized["keywords"], list):
            normalized["keywords"] = " ".join(str(item) for item in normalized["keywords"] if item)
        return {k: v for k, v in normalized.items() if v not in (None, "", [])}

    # ──────────────────────────────────────────────────────────────────
    # INDEXING – includes metadata fields from the incoming doc
    # ──────────────────────────────────────────────────────────────────
    def index_document(self, doc: dict) -> bool:
        raw_text = doc.get("raw_text", "")
        enterprise_id = doc.get("enterprise_id")
        if not raw_text:
            logger.warning(f"Document {doc.get('documentId')} has no text.")
            return False
        if not enterprise_id:
            logger.warning(f"Document {doc.get('documentId')} missing enterprise_id.")
            return False

        text_chunks = self._chunk_text(raw_text)
        actions = []
        logger.info(f"Splitting document {doc['documentId']} into {len(text_chunks)} chunks.")

        # Extract metadata from the doc (if present)
        metadata_fields = doc.get("metadata_fields") or doc.get("metadata") or {}
        normalized_metadata = self._normalize_metadata(metadata_fields)

        try:
            for i, chunk_text in enumerate(text_chunks):
                vector = embedding_engine.embed(chunk_text)

                chunk_body = {
                    "chunk_id":      f"{doc['documentId']}_chunk_{i}",
                    "documentId":    doc["documentId"],
                    "enterprise_id":  enterprise_id,
                    "filename":      doc["filename"],
                    "raw_text":      chunk_text,
                    "language":      doc.get("language", "unknown"),
                    "document_type": doc.get("document_type"),
                    "category":      doc.get("category"),
                    "processed_at":  doc.get("processed_at", datetime.now(timezone.utc).isoformat()),
                    "embedding":     vector,
                    # Metadata fields (flattened)
                    **normalized_metadata,
                }

                # Remove None values to avoid Elasticsearch errors
                chunk_body = {k: v for k, v in chunk_body.items() if v is not None}

                actions.append({
                    "_index": settings.elasticsearch_index,
                    "_id": chunk_body["chunk_id"],
                    "_source": chunk_body
                })

            if actions:
                success, errors = bulk(self._client, actions)
                logger.info(f"Successfully indexed {success} chunks for doc {doc['documentId']}")
                return len(errors) == 0

        except Exception as e:
            logger.error(f"Error during bulk indexing for doc {doc['documentId']}: {str(e)}", exc_info=True)
            return False

        return False

    # ──────────────────────────────────────────────────────────────────
    # UPDATE METADATA – for messages arriving after classification
    # ──────────────────────────────────────────────────────────────────
    def update_metadata(self, documentId: str, enterprise_id: str, metadata_fields: dict) -> bool:
        """
        Update all chunks of a document with new metadata.
        The metadata is merged (existing fields are overwritten by new ones).
        """
        flat_metadata = self._normalize_metadata(metadata_fields)

        if not flat_metadata:
            logger.warning(f"No valid metadata to update for {documentId}")
            return False

        # Use script to merge with existing metadata object
        update_body = {
            "script": {
                "source": """
                    for (entry in params.metadata.entrySet()) {
                        ctx._source[entry.getKey()] = entry.getValue();
                    }
                    if (ctx._source.metadata == null) {
                        ctx._source.metadata = params.metadata;
                    } else {
                        for (entry in params.metadata.entrySet()) {
                            ctx._source.metadata[entry.getKey()] = entry.getValue();
                        }
                    }
                """,
                "params": {
                    "metadata": flat_metadata
                }
            },
            "query": {
                "bool": {
                    "must": [
                        {"term": {"documentId": documentId}},
                        {"term": {"enterprise_id": enterprise_id}},
                    ]
                }
            }
        }

        try:
            response = self._client.update_by_query(
                index=settings.elasticsearch_index,
                body=update_body,
                conflicts="proceed"
            )
            updated = response.get("updated", 0)
            logger.info(f"Updated metadata for {updated} chunks of document {documentId}")
            return updated > 0
        except Exception as e:
            logger.error(f"Failed to update metadata for {documentId}: {e}")
            return False

    def document_exists(self, documentId: str, enterprise_id: str) -> bool:
        try:
            resp = self._client.search(
                index=settings.elasticsearch_index,
                body={
                    "size": 0,
                    "query": {
                        "bool": {
                            "must": [
                                {"term": {"documentId": documentId}},
                                {"term": {"enterprise_id": enterprise_id}},
                            ]
                        }
                    },
                }
            )
            return resp["hits"]["total"]["value"] > 0
        except Exception:
            return False

    # ──────────────────────────────────────────────────────────────────
    # SEARCH METHODS – now metadata‑aware
    # ──────────────────────────────────────────────────────────────────

    def keyword_search(self, query: str, top_k: int, filters: Dict[str, Any]) -> list[dict]:
        """
        Keyword search across raw_text AND all metadata text fields.
        """
        # Build multi-match query over all relevant fields
        multi_match = {
            "query": query,
            "fields": [
                "raw_text^2",           # higher weight
                "person_name^3",
                "organization^3",
                "address^2",
                "city^2",
                "country^2",
                "invoice_number^4",
                "contract_number^4",
                "registration_number^4",
                "keywords",
                "metadata"
            ],
            "type": "best_fields",
            "operator": "or"
        }

        must = [{"multi_match": multi_match}]
        must += self._build_filters(filters)

        body = {
            "size": top_k,
            "query": {"bool": {"must": must}},
            "sort": [{"_score": {"order": "desc"}}]
        }

        resp = self._client.search(index=settings.elasticsearch_index, body=body)
        return self._parse_hits(resp)

    def semantic_search(self, query: str, top_k: int, filters: Dict[str, Any]) -> list[dict]:
        """
        Semantic search uses the embedding of the query against the chunk embeddings.
        Filters are applied as pre-filtering (knn filter).
        """
        try:
            vector = embedding_engine.embed(query)
        except Exception as e:
            logger.error(f"Embedding generation failed: {str(e)}")
            return []

        filter_clauses = self._build_filters(filters)
        knn = {
            "field": "embedding",
            "query_vector": vector,
            "k": top_k,
            "num_candidates": max(top_k * 10, 100),
        }
        if filter_clauses:
            knn["filter"] = {"bool": {"must": filter_clauses}}

        resp = self._client.search(
            index=settings.elasticsearch_index,
            body={"size": top_k, "knn": knn}
        )
        return self._parse_hits(resp)

    def hybrid_search(self, query: str, top_k: int, filters: Dict[str, Any]) -> list[dict]:
        """
        Combines keyword and semantic results using RRF (reciprocal rank fusion).
        """
        kw_hits = self.keyword_search(query, top_k, filters)
        sem_hits = self.semantic_search(query, top_k, filters)

        scores: dict[str, float] = {}
        docs: dict[str, dict] = {}

        for rank, hit in enumerate(kw_hits):
            cid = hit["chunk_id"]
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (rank + 60)
            docs[cid] = hit

        for rank, hit in enumerate(sem_hits):
            cid = hit["chunk_id"]
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (rank + 60)
            docs[cid] = hit

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
        max_score = max((score for _, score in ranked), default=1.0)
        results = []
        for cid, score in ranked:
            doc = docs[cid]
            doc["raw_score"] = round(score, 6)
            doc["score"] = round(score / max_score, 6) if max_score else 0
            results.append(doc)
        return results

    # ──────────────────────────────────────────────────────────────────
    # STRUCTURED METADATA SEARCH – for fine‑grained queries
    # ──────────────────────────────────────────────────────────────────
    def metadata_search(
        self,
        enterprise_id: str,
        query: Optional[str] = None,           # free text (searched across all fields)
        person_name: Optional[str] = None,
        organization: Optional[str] = None,
        date_from: Optional[str] = None,       # ISO date YYYY-MM-DD
        date_to: Optional[str] = None,
        amount_min: Optional[float] = None,
        amount_max: Optional[float] = None,
        currency: Optional[str] = None,
        city: Optional[str] = None,
        country: Optional[str] = None,
        document_type: Optional[str] = None,
        category: Optional[str] = None,
        language: Optional[str] = None,
        invoice_number: Optional[str] = None,
        contract_number: Optional[str] = None,
        top_k: int = 10
    ) -> list[dict]:
        """
        Advanced search using structured metadata filters.
        """
        must = [{"term": {"enterprise_id": enterprise_id}}]

        # Full‑text query (if provided)
        if query:
            must.append({
                "multi_match": {
                    "query": query,
                    "fields": ["raw_text^2", "person_name^3", "organization^3", "address", "city", "country", "keywords", "metadata"],
                    "type": "best_fields"
                }
            })

        # Exact match filters
        exact_fields = {
            "person_name": person_name,
            "organization": organization,
            "currency": currency,
            "city": city,
            "country": country,
            "document_type": document_type,
            "category": category,
            "language": language,
            "invoice_number": invoice_number,
            "contract_number": contract_number,
        }
        for field, value in exact_fields.items():
            if value:
                must.append({"term": {field: value}})

        # Date range
        if date_from or date_to:
            date_range = {}
            if date_from:
                date_range["gte"] = date_from
            if date_to:
                date_range["lte"] = date_to
            must.append({"range": {"date": date_range}})

        # Amount range
        if amount_min is not None or amount_max is not None:
            amount_range = {}
            if amount_min is not None:
                amount_range["gte"] = amount_min
            if amount_max is not None:
                amount_range["lte"] = amount_max
            must.append({"range": {"amount": amount_range}})

        if not must:
            # No filters – return nothing (or all? better to require at least one)
            return []

        body = {
            "size": top_k,
            "query": {"bool": {"must": must}},
            "sort": [{"_score": {"order": "desc"}}]
        }
        resp = self._client.search(index=settings.elasticsearch_index, body=body)
        return self._parse_hits(resp)

    # ──────────────────────────────────────────────────────────────────
    # Helper methods
    # ──────────────────────────────────────────────────────────────────
    def _build_filters(self, filters: Dict[str, Any]) -> list[dict]:
        clauses = []
        if not filters.get("enterprise_id"):
            raise ValueError("Missing enterprise_id filter")
        for field, value in filters.items():
            if value is not None:
                # Support for list values? Not needed for now
                clauses.append({"term": {field: value}})
        return clauses

    def _parse_hits(self, resp) -> list[dict]:
        results = []
        hits = resp["hits"]["hits"]
        max_score = max(((hit["_score"] or 0.0) for hit in hits), default=1.0)
        for hit in hits:
            src = hit["_source"]
            raw_score = hit["_score"] or 0.0
            results.append({
                "chunk_id":      src.get("chunk_id"),
                "documentId":    src.get("documentId"),
                "enterprise_id":  src.get("enterprise_id"),
                "filename":      src.get("filename"),
                "raw_text":      src.get("raw_text", "")[:500],
                "language":      src.get("language"),
                "document_type": src.get("document_type"),
                "category":      src.get("category"),
                "processed_at":  src.get("processed_at"),
                "raw_score":     round(raw_score, 6),
                "score":         round(raw_score / max_score, 6) if max_score else 0,
                # Add metadata fields to result
                "person_name":   src.get("person_name"),
                "organization":  src.get("organization"),
                "date":          src.get("date"),
                "amount":        src.get("amount"),
                "currency":      src.get("currency"),
                "city":          src.get("city"),
                "country":       src.get("country"),
                "invoice_number": src.get("invoice_number"),
                "metadata":      src.get("metadata"),
            })
        return results

    def delete_document(self, documentId: str, enterprise_id: str) -> bool:
        try:
            query = {
                "query": {
                    "bool": {
                        "must": [
                            {"term": {"documentId": documentId}},
                            {"term": {"enterprise_id": enterprise_id}},
                        ]
                    }
                }
            }
            self._client.delete_by_query(index=settings.elasticsearch_index, body=query)
            logger.info(f"Deleted all chunks for document {documentId}")
            return True
        except NotFoundError:
            return False

    def get_index_stats(self) -> dict:
        """Return basic stats about the index."""
        stats = self._client.indices.stats(index=settings.elasticsearch_index)
        idx = settings.elasticsearch_index
        return {
            "document_count": stats["indices"][idx]["total"]["docs"]["count"],
            "store_size_bytes": stats["indices"][idx]["total"]["store"]["size_in_bytes"],
        }


es_client = ESClient()
