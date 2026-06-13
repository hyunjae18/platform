"""
Qdrant Vector Store for Document Metadata
Provides similarity search, exact-match payload filtering, and metadata persistence.
"""

import os
import json
import hashlib
import random
from datetime import datetime
from typing import Dict, Any, List, Optional

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, PayloadSchemaType, Filter, FieldCondition, MatchValue

DEFAULT_VECTOR_SIZE = 384


class QdrantStore:
    def __init__(
        self,
        host: str = os.getenv("QDRANT_HOST", "qdrant"),
        port: int = int(os.getenv("QDRANT_PORT", "6333")),
        collection: str = os.getenv("QDRANT_COLLECTION", "document_metadata"),
        vector_size: int = int(os.getenv("VECTOR_SIZE", str(DEFAULT_VECTOR_SIZE)))
    ):
        self.client = QdrantClient(host=host, port=port)
        self.collection = collection
        self.vector_size = vector_size
        self._ensure_collection()

    def _ensure_collection(self):
        """Creates the collection and establishes keyword indexes for structured data."""
        if not self.client.collection_exists(self.collection):
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE)
            )
            print(f"[QDRANT] Created collection: {self.collection}")

            # Create Payload Indexes for exact-match lookups on the new identifiers
            indexes_to_create = [
                "metadata.identifiers.passport",
                "metadata.identifiers.national_id",
                "metadata.identifiers.purchase_order",
                "metadata.identifiers.invoice_number"
            ]
            
            for field in indexes_to_create:
                try:
                    self.client.create_payload_index(
                        collection_name=self.collection,
                        field_name=field,
                        field_schema=PayloadSchemaType.KEYWORD
                    )
                    print(f"[QDRANT] Created exact-match index for {field}")
                except Exception as e:
                    print(f"[QDRANT] Failed to create index for {field}: {e}")

    def _make_id(self, doc_id: str) -> str:
        return hashlib.md5(doc_id.encode("utf-8")).hexdigest()

    def _make_vector(self, text: str) -> List[float]:
        # PLACEHOLDER: deterministic pseudo-vector from text hash.
        # PRODUCTION: replace with sentence-transformers embeddings.
        seed = int(hashlib.md5(text.encode("utf-8")).hexdigest(), 16)
        rng = random.Random(seed)
        return [rng.random() for _ in range(self.vector_size)]

    def store(self, doc_id: str, metadata: Dict[str, Any], text: Optional[str] = None):
        """Store document metadata and vector in Qdrant."""
        point_id = self._make_id(doc_id)
        vector = self._make_vector(text or json.dumps(metadata, sort_keys=True))
        
        point = PointStruct(
            id=point_id,
            vector=vector,
            payload={
                "doc_id": doc_id,
                "metadata": metadata,  # The identifiers dictionary is naturally nested here
                "indexed_at": datetime.utcnow().isoformat()
            }
        )
        self.client.upsert(collection_name=self.collection, points=[point])

    def search_similar(
        self, doc_id: str, text: Optional[str] = None, limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Search for visually/semantically similar documents by vector."""
        vector = self._make_vector(text or doc_id)
        results = self.client.search(
            collection_name=self.collection,
            query_vector=vector,
            limit=limit + 1  # +1 to filter self
        )
        self_id = self._make_id(doc_id)
        filtered = [r for r in results if r.id != self_id]
        return [
            {
                "doc_id": r.payload.get("doc_id"),
                "score": r.score,
                "metadata": r.payload.get("metadata")
            }
            for r in filtered[:limit]
        ]

    def search_by_identifier(self, identifier_type: str, identifier_value: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Instant exact-match search bypassing the vector embeddings.
        Example: search_by_identifier("passport", "AB1234567")
        """
        valid_types = {"passport", "national_id", "purchase_order", "invoice_number"}
        if identifier_type not in valid_types:
            raise ValueError(f"Invalid identifier_type. Must be one of {valid_types}")
            
        field_name = f"metadata.identifiers.{identifier_type}"
        
        results = self.client.scroll(
            collection_name=self.collection,
            scroll_filter=Filter(
                must=[
                    FieldCondition(
                        key=field_name,
                        match=MatchValue(value=identifier_value)
                    )
                ]
            ),
            limit=limit
        )
        
        records = results[0]  # scroll returns a tuple (records, next_page_offset)
        return [
            {
                "doc_id": r.payload.get("doc_id"),
                "metadata": r.payload.get("metadata")
            }
            for r in records
        ]

    def delete(self, doc_id: str):
        """Delete a document from Qdrant."""
        point_id = self._make_id(doc_id)
        self.client.delete(
            collection_name=self.collection,
            points_selector=[point_id]
        )