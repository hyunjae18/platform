import uuid
import numpy as np
import logging
import io
import cv2
import re
import os
import httpx

from PIL import Image
from typing import Optional, List, Tuple
from datetime import datetime, timezone
from paddleocr import PaddleOCR

from schemas import OCRLine, OCRResult
from config import settings

logger = logging.getLogger(__name__)

MIN_CONFIDENCE = 0.30

QUALITY_CONFIG = {
    "min_avg_confidence": 0.3,
    "min_text_length": 5,
    "min_lines": 1,
    "max_garbage_ratio": 0.5,
}

# ---------- Region detection (simple CV2 method) ----------
def get_boxes_simple(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3))
    dilated = cv2.dilate(thresh, kernel, iterations=1)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    H, W = image.shape[:2]
    boxes = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w < 30 or h < 10:
            continue
        if w > W * 0.95:
            continue
        if h > 80:
            continue
        padding = 5
        x1 = max(0, x - padding)
        y1 = max(0, y - padding)
        x2 = min(W, x + w + padding)
        y2 = min(H, y + h + padding)
        boxes.append((x1, y1, x2, y2))
    
    boxes.sort(key=lambda b: (b[1], b[0]))
    return boxes

def recognize_region(image, bbox, engine):
    x1, y1, x2, y2 = bbox
    crop = image[y1:y2, x1:x2]
    if crop.size == 0 or crop.shape[0] < 5 or crop.shape[1] < 10:
        return "", 0.0
    try:
        result = engine.ocr(crop, det=False, rec=True)
        if result and result[0]:
            if isinstance(result[0], list) and len(result[0]) > 0:
                rec_result = result[0][0]
                if isinstance(rec_result, (list, tuple)) and len(rec_result) >= 2:
                    text = str(rec_result[0]).strip()
                    conf = float(rec_result[1]) if len(rec_result) > 1 else 0.5
                    if text:
                        return text, conf
        return "", 0.0
    except Exception as e:
        logger.warning(f"Region recognition error: {e}")
        return "", 0.0

# ---------- Main OCR Engine ----------
class OCREngine:
    _instance: Optional["OCREngine"] = None
    _ocr_model: Optional[PaddleOCR] = None

    def __new__(cls) -> "OCREngine":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def initialize(self) -> None:
        if self._ocr_model is None:
            logger.info("=" * 60)
            logger.info("Loading finetuned PaddleOCR model...")
            model_dir = "/app/arabic_rec"
            self._ocr_model = PaddleOCR(
                lang='ar',
                rec_model_dir=model_dir,
                det_model_dir=None,
                cls_model_dir=None,
                use_angle_cls=False,
                show_log=False,
                use_gpu=False
            )
            logger.info("Model loaded successfully!")

    def _image_from_bytes(self, data: bytes) -> np.ndarray:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

    def _check_quality(self, lines: List[OCRLine], raw_text: str, avg_confidence: float) -> Tuple[bool, dict]:
        issues = []
        if avg_confidence < QUALITY_CONFIG["min_avg_confidence"]:
            issues.append(f"Low confidence ({avg_confidence:.2f})")
        text_length = len(raw_text.strip())
        if text_length < QUALITY_CONFIG["min_text_length"]:
            issues.append(f"Too little text ({text_length} chars)")
        num_lines = len(lines)
        if num_lines < QUALITY_CONFIG["min_lines"]:
            issues.append(f"Too few lines ({num_lines})")
        quality_report = {
            "has_warnings": len(issues) > 0,
            "is_critical": avg_confidence < 0.2,
            "warnings": issues,
            "stats": {
                "avg_confidence": round(avg_confidence, 3),
                "text_length": text_length,
                "num_lines": num_lines,
            },
            "suggestions": ["Try using a clearer image"] if issues else []
        }
        return len(issues) == 0, quality_report

    def _detect_languages(self, text: str) -> List[str]:
        languages = set()
        if any("\u0600" <= c <= "\u06FF" for c in text):
            languages.add("ar")
        if any(c.isascii() and c.isalpha() for c in text):
            languages.add("fr")
            languages.add("en")
        return list(languages)

    async def extract(
        self,
        image_bytes: bytes,
        filename: str,
        content_type: str,
        file_path: str,
        enterprise_id: str,           # <-- FIXED: added parameter
        force_process: bool = False,
    ) -> Tuple[OCRResult, dict]:
        if self._ocr_model is None:
            raise RuntimeError("OCREngine not initialized")

        logger.info(f"Running OCR on '{filename}'...")

        try:
            image_array = self._image_from_bytes(image_bytes)

            h, w = image_array.shape[:2]
            max_size = 1280
            if max(h, w) > max_size:
                scale = max_size / max(h, w)
                new_w, new_h = int(w * scale), int(h * scale)
                image_array = cv2.resize(image_array, (new_w, new_h))
                logger.debug(f"Resized from {w}x{h} to {new_w}x{new_h}")

            boxes = get_boxes_simple(image_array)
            logger.info(f"Detected {len(boxes)} regions")

            lines = []
            raw_text_lines = []
            confidences = []

            for (x1, y1, x2, y2) in boxes:
                text, conf = recognize_region(image_array, (x1, y1, x2, y2), self._ocr_model)
                if text and conf >= MIN_CONFIDENCE:
                    lines.append(OCRLine(text=text, confidence=round(conf, 2)))
                    raw_text_lines.append(text)
                    confidences.append(conf)

            raw_text = "\n".join(raw_text_lines)
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

            is_high_quality, quality_report = self._check_quality(lines, raw_text, avg_confidence)

            languages_detected = self._detect_languages(raw_text)

            result_obj = OCRResult(
                documentId=str(uuid.uuid4()),
                enterprise_id=enterprise_id,      # <-- FIXED: passed here
                filename=filename,
                content_type=content_type,
                file_path=file_path,
                raw_text=raw_text,
                languages_detected=languages_detected,
                total_lines=len(lines),
                lines=lines,
                processed_at=datetime.now(timezone.utc).isoformat(),
            )

            logger.info(f"OCR complete: {len(lines)} lines, avg_conf={avg_confidence:.2f}")
            return result_obj, quality_report

        except Exception as e:
            logger.error(f"OCR processing failed for {filename}: {e}", exc_info=True)
            raise

ocr_engine = OCREngine()