import logging
import re
from typing import Optional, Dict, List
from datetime import datetime, timezone

import os
import torch
from transformers import pipeline
from langdetect import detect, DetectorFactory
from langdetect.lang_detect_exception import LangDetectException

from schemas import ClassifyRequest, ClassifyResponse, LabelScore

logger = logging.getLogger(__name__)

DetectorFactory.seed = 42

LANGUAGE_NAMES = {
    "ar": "Arabic",
    "fr": "French",
    "en": "English",
}

# Complete mapping from predicted document_type (model output) to business category
LABEL_TO_CATEGORY = {
    "Commercial": "commercial",
    "Report": "report",
    "Medical": "medical",
    "Educational": "educational",
    "Official": "official",
    "Identity": "identity",
    "Financial": "financial",
    "Administrative": "administrative",
    "Legal": "legal",
    "Resume": "hr",
    "Certificate": "educational",
    "Invoice": "financial",
    "Contract": "legal",
    "Student Record": "educational",
    "Form": "administrative",
}

# Inverse mapping for category scores (if needed)
CATEGORY_LABELS = list(set(LABEL_TO_CATEGORY.values()))


class ClassifierEngine:
    _instance: Optional["ClassifierEngine"] = None
    _pipeline = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def initialize(self) -> None:
        if self._pipeline is None:
            logger.info("Loading trained classifier model...")
            device_env = os.getenv("DEVICE", "cpu")
            use_cuda = device_env == "cuda" and torch.cuda.is_available()
            device_index = 0 if use_cuda else -1
            self._pipeline = pipeline(
                "text-classification",
                model="./model",
                tokenizer="./model",
                device=device_index,
            )
            logger.info("Classifier model loaded successfully.")

    def _detect_languages(self, text: str) -> tuple[str, Dict[str, float]]:
        """Detect language distribution based on character analysis."""
        arabic_chars = sum(1 for ch in text if "\u0600" <= ch <= "\u06FF")
        french_chars = sum(1 for ch in text.lower() if ch in "àâçéèêëîïôùûüÿœæ")
        english_chars = sum(1 for ch in text if ch.isascii() and ch.isalpha())

        total = arabic_chars + french_chars + english_chars
        if total == 0:
            return "unknown", {"unknown": 100.0}

        ar_percent = round((arabic_chars / total) * 100, 2)
        fr_percent = round((french_chars / total) * 100, 2)
        en_percent = round((english_chars / total) * 100, 2)

        distribution = {"ar": ar_percent, "fr": fr_percent, "en": en_percent}
        dominant = max(distribution, key=distribution.get)
        return dominant, distribution

    def _preprocess(self, text: str, max_chars: int = 2000) -> str:
        """Clean and truncate text for classification."""
        text = re.sub(r"\s+", " ", text).strip()
        return text[:max_chars]

    def _rule_based_override(self, text: str, filename: str = "") -> tuple[Optional[str], Optional[str], float]:
        lower = f"{filename} {text}".lower()
        rules = [
            ("Resume", "hr", 96.0, ["professional summary", "work history", "skills", "education"]),
            ("Certificate", "educational", 96.0, ["certificate", "certificat", "attestation", "شهادة"]),
            ("Student Record", "educational", 94.0, ["student", "university", "universite", "جامعة", "رقم التسجيل"]),
            ("Invoice", "financial", 94.0, ["invoice", "facture", "total", "amount due", "tva"]),
            ("Contract", "legal", 93.0, ["contract", "agreement", "terms and conditions", "signature"]),
            ("Identity", "identity", 92.0, ["passport", "national id", "identity card", "birth date"]),
            ("Medical", "medical", 90.0, ["patient", "diagnosis", "prescription", "hospital"]),
            ("Form", "administrative", 88.0, ["form", "application", "request", "registration"]),
        ]
        for document_type, category, confidence, signals in rules:
            hits = sum(1 for signal in signals if signal in lower)
            if hits >= 2 or (document_type == "Certificate" and any(signal in lower for signal in signals)):
                return document_type, category, confidence
        return None, None, 0.0

    def _get_category_scores(self, type_scores: List[LabelScore]) -> List[LabelScore]:
        """Aggregate document_type scores into category scores."""
        category_map: Dict[str, float] = {}
        for ts in type_scores:
            category = LABEL_TO_CATEGORY.get(ts.label, "general")
            category_map[category] = max(category_map.get(category, 0), ts.score)
        # Normalize to sum 1.0 if needed? Keep as raw max scores.
        return [LabelScore(label=cat, score=score) for cat, score in category_map.items()]

    def classify(self, request: ClassifyRequest) -> ClassifyResponse:
        if self._pipeline is None:
            raise RuntimeError("ClassifierEngine not initialized.")

        text = self._preprocess(request.raw_text)

        override_type, override_category, override_confidence = self._rule_based_override(request.raw_text, request.filename)

        # Run prediction
        prediction = self._pipeline(text)[0]
        predicted_label = prediction["label"]
        confidence = round(prediction["score"] * 100, 2)

        if override_type and (confidence < 92 or predicted_label in {"LABEL_0", "Uncategorized", "General"}):
            predicted_label = override_type
            confidence = override_confidence

        # Map to category
        category = override_category or LABEL_TO_CATEGORY.get(predicted_label, "general")
        category_confidence = confidence  # same as document_type confidence

        # Build type_scores (only top label for simplicity)
        type_scores = [LabelScore(label=predicted_label, score=confidence)]

        # Language detection
        dominant_lang, lang_distribution = self._detect_languages(request.raw_text)

        return ClassifyResponse(
            documentId=request.documentId,
            filename=request.filename,
            document_type=predicted_label,
            document_type_confidence=confidence,
            category=category,
            category_confidence=category_confidence,
            subcategory=None,
            type_scores=type_scores,
            category_scores=self._get_category_scores(type_scores),
            language_dominant=dominant_lang,
            language_distribution=lang_distribution,
            classified_at=datetime.now(timezone.utc).isoformat(),
        )


classifier_engine = ClassifierEngine()
