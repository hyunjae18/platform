from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class OCRLine(BaseModel):
    text: str
    confidence: Optional[float] = None

class OCRResult(BaseModel):
    documentId: str
    enterprise_id: str
    filename: str
    content_type: str
    file_path: str
    raw_text: str
    languages_detected: List[str]
    total_lines: int
    lines: List[OCRLine]
    processed_at: str
    quality_metrics: Optional[Dict[str, Any]] = None

class ClassifyRequest(BaseModel):
    documentId: str
    filename: str
    raw_text: str


class LabelScore(BaseModel):
    label: str
    score: float


class ClassifyResponse(BaseModel):
    documentId: str
    filename: str

    document_type: str
    document_type_confidence: float

    category: str
    category_confidence: float

    subcategory: Optional[str] = None

    type_scores: List[LabelScore]
    category_scores: List[LabelScore]

    language_dominant: str
    language_distribution: Dict[str, float]

    summary: str
    classified_at: str

class MetadataLine(BaseModel):
    text: str
    confidence: Optional[float] = None


class MetadataRequest(BaseModel):
    documentId: str
    filename: str

    languages: List[str]

    total_lines: int

    results: List[MetadataLine]

    processed_at: str

    token: str
    

class OCRResponse(BaseModel):
    status: str
    documentId: str
    filename: str
    extracted_text_length: int
    extracted_text_preview: str
    classification: Optional[Dict[str, Any]] = None
