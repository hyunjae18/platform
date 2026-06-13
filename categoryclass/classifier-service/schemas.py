from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class LabelScore(BaseModel):
    """Score for a single label"""
    label: str
    score: float

class ClassifyRequest(BaseModel):
    """Request format for classification"""
    documentId: str
    filename: str
    raw_text: str

class ClassifyResponse(BaseModel):
    """Response format for classification"""
    documentId: str
    filename: str
    document_type: str
    document_type_confidence: float
    category: str
    category_confidence: float
    subcategory: Optional[str] = None
    type_scores: List[LabelScore] = []
    category_scores: List[LabelScore] = []
    language_dominant: str
    language_distribution: Dict[str, float]
    classified_at: str