import io
import json
import asyncio
import logging
import os

import pika
from pika.exceptions import AMQPConnectionError
import uuid
from datetime import datetime
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

from fastapi import FastAPI, UploadFile, File, Header, HTTPException, Query

from config import settings
from ocr_engine import ocr_engine
from converter import convert_to_images, resolve_mime, ALL_SUPPORTED_MIMES
from security import create_service_token
from mongodb import mongodb
from schemas import OCRResult

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("ocr-service")

app = FastAPI(
    title="OCR Service",
    version="2.0",
)

# ── Queue Names ─────────────────────────────────────────────────────────────
QUEUE_NAME = "document_text_queue"
DOCUMENT_SERVICE_QUEUE = "document.ocr.completed"
EXCHANGE = "document_exchange"
ROUTING_KEY = "document.text"


# ── RabbitMQ Producer (for classifier) ────────────────────────────────────

class RabbitMQProducer:

    def __init__(self):
        self._connection = None
        self._channel    = None
        self.connected   = False

    def _params(self):
        return pika.ConnectionParameters(
            host=settings.rabbitmq_host,
            port=settings.rabbitmq_port,
            credentials=pika.PlainCredentials(
                settings.rabbitmq_user,
                settings.rabbitmq_pass,
            ),
            heartbeat=600,
            blocked_connection_timeout=300,
        )

    def _setup(self):
        self._channel.exchange_declare(
            exchange=EXCHANGE,
            exchange_type="topic",
            durable=True,
        )
        self._channel.queue_declare(
            queue=QUEUE_NAME,
            durable=True,
        )
        self._channel.queue_bind(
            queue=QUEUE_NAME,
            exchange=EXCHANGE,
            routing_key=ROUTING_KEY,
        )

    def connect(self) -> bool:
        try:
            self._connection = pika.BlockingConnection(self._params())
            self._channel    = self._connection.channel()
            self._setup()
            self.connected   = True
            logger.info("RabbitMQ producer (classifier) connected to %s", settings.rabbitmq_host)
            return True
        except Exception as exc:
            logger.error("Producer connection failed: %s", exc)
            self.connected = False
            return False

    def _ensure_connected(self):
        if self._connection is None or self._connection.is_closed:
            if not self.connect():
                raise AMQPConnectionError("Cannot reach RabbitMQ")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
    def _publish_sync(self, payload: dict):
        self._ensure_connected()
        self._channel.basic_publish(
            exchange=EXCHANGE,
            routing_key=ROUTING_KEY,
            body=json.dumps(payload),
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,
                content_type="application/json",
            ),
        )
        logger.info("Published to classifier | documentId=%s", payload["documentId"])

    async def publish(self, payload: dict):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._publish_sync, payload)

    def close(self):
        if self._connection and self._connection.is_open:
            self._connection.close()


# ── RabbitMQ Producer for Document Service ────────────────────────────

class DocumentServiceProducer:

    def __init__(self):
        self._connection = None
        self._channel = None
        self.connected = False

    def _params(self):
        return pika.ConnectionParameters(
            host=settings.rabbitmq_host,
            port=settings.rabbitmq_port,
            credentials=pika.PlainCredentials(
                settings.rabbitmq_user,
                settings.rabbitmq_pass,
            ),
            heartbeat=600,
            blocked_connection_timeout=300,
        )

    def connect(self) -> bool:
        try:
            self._connection = pika.BlockingConnection(self._params())
            self._channel = self._connection.channel()
            self._channel.queue_declare(queue=DOCUMENT_SERVICE_QUEUE, durable=True)
            self.connected = True
            logger.info("Document Service producer connected to %s", settings.rabbitmq_host)
            return True
        except Exception as exc:
            logger.error("Document Service producer connection failed: %s", exc)
            self.connected = False
            return False

    def _ensure_connected(self):
        if self._connection is None or self._connection.is_closed:
            if not self.connect():
                raise AMQPConnectionError("Cannot reach RabbitMQ")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
    def _publish_sync(self, payload: dict):
        self._ensure_connected()
        self._channel.basic_publish(
            exchange='',
            routing_key=DOCUMENT_SERVICE_QUEUE,
            body=json.dumps(payload),
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,
                content_type="application/json",
            ),
        )
        logger.info("📤 Published to Document Service | documentId=%s", payload.get("documentId"))

    async def publish(self, payload: dict):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._publish_sync, payload)

    def close(self):
        if self._connection and self._connection.is_open:
            self._connection.close()


# ── RabbitMQ Producer for Metadata Service ────────────────────────────

class MetadataServiceProducer:

    def __init__(self):
        self._connection = None
        self._channel = None
        self.connected = False
        self.metadata_queue = "metadata.extract.request"

    def _params(self):
        return pika.ConnectionParameters(
            host=settings.rabbitmq_host,
            port=settings.rabbitmq_port,
            credentials=pika.PlainCredentials(
                settings.rabbitmq_user,
                settings.rabbitmq_pass,
            ),
            heartbeat=600,
            blocked_connection_timeout=300,
        )

    def connect(self) -> bool:
        try:
            self._connection = pika.BlockingConnection(self._params())
            self._channel = self._connection.channel()
            self._channel.queue_declare(queue=self.metadata_queue, durable=True)
            self.connected = True
            logger.info("Metadata Service producer connected")
            return True
        except Exception as exc:
            logger.error("Metadata Service producer connection failed: %s", exc)
            self.connected = False
            return False

    def _ensure_connected(self):
        if self._connection is None or self._connection.is_closed:
            if not self.connect():
                raise AMQPConnectionError("Cannot reach RabbitMQ")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
    def _publish_sync(self, payload: dict):
        self._ensure_connected()
        self._channel.basic_publish(
            exchange='',
            routing_key=self.metadata_queue,
            body=json.dumps(payload),
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,
                content_type="application/json",
            ),
        )
        logger.info("Published to Metadata Service | documentId=%s", payload.get("documentId"))

    async def publish(self, payload: dict):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._publish_sync, payload)

    def close(self):
        if self._connection and self._connection.is_open:
            self._connection.close()


# ── Create producer instances ─────────────────────────────────────────────

producer = RabbitMQProducer()
document_service_producer = DocumentServiceProducer()
metadata_producer = MetadataServiceProducer()


# ── Helper for retrying connections ──────────────────────────────────────

async def connect_with_retry(producer, name: str, max_attempts: int = 10):
    """Attempt to connect a producer, retrying with exponential backoff."""
    for attempt in range(1, max_attempts + 1):
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(None, producer.connect)
        if success:
            logger.info(f"✅ {name} connected")
            return True
        wait = min(2 ** attempt, 30)   # 2,4,8,16,30,30...
        logger.warning(
            f"⚠️ {name} connection attempt {attempt}/{max_attempts} failed. "
            f"Retrying in {wait}s..."
        )
        await asyncio.sleep(wait)
    raise Exception(f"❌ Failed to connect {name} after {max_attempts} attempts")

# ── Lifespan events ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    logger.info("Starting OCR Service …")
    loop = asyncio.get_event_loop()

    logger.info("Initializing OCR engine...")
    await loop.run_in_executor(None, ocr_engine.initialize)

    logger.info("Connecting RabbitMQ producers...")
    await connect_with_retry(producer, "Classifier producer")
    await connect_with_retry(document_service_producer, "Document service producer")
    await connect_with_retry(metadata_producer, "Metadata producer")

    logger.info("Connecting MongoDB...")
    await loop.run_in_executor(None, mongodb.connect)

    logger.info("✅ OCR service fully started.")


@app.on_event("shutdown")
async def shutdown():
    logger.info("Shutting down OCR service...")
    producer.close()
    document_service_producer.close()
    metadata_producer.close()
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, mongodb.close)
    logger.info("OCR service shutdown complete.")


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health():
    return {
        "status": "healthy" if producer.connected else "degraded",
        "service": "ocr",
        "engine": "paddleocr-finetuned",
        "rabbitmq_connected": producer.connected,
        "document_service_queue": DOCUMENT_SERVICE_QUEUE,
        "supported_formats": ["JPEG", "PNG", "TIFF", "BMP", "WebP", "GIF",
                               "PDF", "DOCX", "PPTX"],
    }


# ── File validation ───────────────────────────────────────────────────────

def _validate_file(file: UploadFile) -> str:
    resolved = resolve_mime(file.filename or "", file.content_type or "")
    if resolved not in ALL_SUPPORTED_MIMES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                f"Supported formats: JPEG, PNG, TIFF, BMP, WebP, GIF, "
                f"PDF, DOCX, PPTX"
            ),
        )
    return resolved


# ── Main OCR endpoint (UPDATED with quality reports) ─────────────────────

@app.post("/ocr/extract", tags=["OCR"])
async def extract_text(
    file: UploadFile = File(..., description="Image, PDF, DOCX, or PPTX file"),
    enterprise_id: str = Header(..., alias="X-Enterprise-ID"),
    dpi: int = Query(
        default=200, ge=72, le=400,
        description="Rendering DPI for PDF/PPTX pages (72–400). Higher = better quality but slower.",
    ),
    force: bool = Query(
        default=False,
        description="Force OCR processing even if low quality is detected (default: false)"
    ),
):
    """
    Extract text from any supported document.

    Supported input formats:
    - **Images** : JPEG, PNG, TIFF, BMP, WebP, GIF
    - **PDF**    : all pages are OCR'd and merged
    - **DOCX**   : embedded images and text pages extracted
    - **PPTX**   : each slide extracted as an image

    The result is published to RabbitMQ (classifier, document service, metadata)
    and saved to MongoDB.

    **Quality Control:**
    - Returns quality warnings even when processing succeeds
    - Use `force=true` to bypass quality checks
    """
    # ── Validate file type ────────────────────────────────────────────────
    resolved_mime = _validate_file(file)

    # ── Read file bytes ──────────────────────────────────────────────────
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    filename = file.filename or "unknown"

    # ── Save original file to disk ───────────────────────────────────────
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(file_bytes)
    logger.info("Saved upload: %s (%d bytes)", file_path, len(file_bytes))

    # ── Convert document → list of PIL images ────────────────────────────
    try:
        images, resolved_mime = convert_to_images(
            file_bytes=file_bytes,
            filename=filename,
            mime_type=file.content_type,
            dpi=dpi,
        )
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if not images:
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract any images from '{filename}'. "
                   f"The file may be empty, password-protected, or corrupted."
        )

    logger.info("'%s' -> %d page(s) to OCR (mime=%s, force=%s)", filename, len(images), resolved_mime, force)

    # ── OCR each page and merge all lines ────────────────────────────────
    try:
        all_lines = []
        page_counts = []
        all_quality_reports = []  # ← Store quality reports for each page
        quality_warnings = []

        for page_num, pil_image in enumerate(images, start=1):
            # Convert PIL image → PNG bytes for the OCR engine
            buf = io.BytesIO()
            pil_image.save(buf, format="PNG")
            page_bytes = buf.getvalue()

            #  UPDATED: Extract both result and quality report
            page_result, quality_report = await ocr_engine.extract(
                image_bytes=page_bytes,
                filename=f"{filename}_page{page_num}",
                content_type="image/png",
                file_path=file_path,
                enterprise_id=enterprise_id,   
                force_process=force,
            )

            # Store quality report for this page
            all_quality_reports.append({
                "page": page_num,
                "quality": quality_report
            })

            # Collect warnings for response
            if quality_report.get("has_warnings"):
                for warning in quality_report.get("warnings", []):
                    quality_warnings.append(f"Page {page_num}: {warning}")

            # Re-number lines continuously across all pages
            for line in page_result.lines:
                all_lines.append(line)

            page_counts.append(len(page_result.lines))
            logger.info(
                "Page %d/%d: %d lines extracted, warnings: %d",
                page_num, len(images), len(page_result.lines),
                len(quality_report.get("warnings", []))
            )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("OCR extraction failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR processing error: {exc}")

    # ── Build merged OCRResult ───────────────────────────────────────────
    raw_text = "\n".join(line.text for line in all_lines)

    # Calculate average confidence
    avg_confidence = sum(line.confidence for line in all_lines) / len(all_lines) if all_lines else 0

    # Detect languages
    languages_detected = []
    if any("\u0600" <= c <= "\u06FF" for c in raw_text):
        languages_detected.append("ar")
    if any(c.isascii() and c.isalpha() for c in raw_text):
        languages_detected.extend(["fr", "en"])
    languages_detected = list(set(languages_detected))

    # Determine overall quality status
    has_critical_issues = any(
        report["quality"].get("is_critical", False)
        for report in all_quality_reports
    )
    has_warnings = any(
        report["quality"].get("has_warnings", False)
        for report in all_quality_reports
    )

    ocr_result = OCRResult(
        documentId=str(uuid.uuid4()),
        enterprise_id=enterprise_id,
        filename=filename,
        content_type=resolved_mime,
        file_path=file_path,
        languages_detected=languages_detected,
        total_lines=len(all_lines),
        lines=all_lines,
        raw_text=raw_text,
        processed_at=datetime.utcnow().isoformat(),
    )

    logger.info(
        "OCR complete: documentId=%s | pages=%d | total_lines=%d | avg_conf=%.2f | has_warnings=%s",
        ocr_result.documentId, len(images), len(all_lines), avg_confidence,
        has_warnings
    )

    # ── Save to MongoDB ──────────────────────────────────────────────────
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, mongodb.save_document, ocr_result)
        logger.info("Saved to MongoDB: documentId=%s", ocr_result.documentId)
    except Exception as exc:
        logger.error("MongoDB save failed: %s", exc)

    # ── Publish to Document Service Queue ───────────────────────────────
    try:
        doc_service_payload = {
            "documentId": ocr_result.documentId,
            "enterprise_id": enterprise_id,
            "text": ocr_result.raw_text,
            "filename": ocr_result.filename,
            "totalPages": len(images),
            "totalLines": len(all_lines),
            "processedAt": ocr_result.processed_at,
            "confidence": avg_confidence,
            "languages": ocr_result.languages_detected,
            "fileType": resolved_mime,
            "forceProcessed": force,
            "qualityWarnings": quality_warnings if quality_warnings else None,
            "qualityReports": all_quality_reports,  # ← Send full quality reports
        }
        await document_service_producer.publish(doc_service_payload)
        logger.info("Published to Document Service: documentId=%s", ocr_result.documentId)
    except Exception as exc:
        logger.error("Failed to publish to Document Service: %s", exc)

    # ── Publish to Classifier Queue ──────────────────────────────────────
    try:
        token = create_service_token("ocr-service")
        payload = {
            "documentId": ocr_result.documentId,
            "enterprise_id": enterprise_id,
            "filename": ocr_result.filename,
            "raw_text": ocr_result.raw_text,
            "token": token,
            "total_pages": len(images),
            "total_lines": len(all_lines),
        }
        await producer.publish(payload)
        logger.info("Published to classifier: documentId=%s", ocr_result.documentId)
    except Exception as exc:
        logger.error("Classifier publish failed: %s", exc)

    # ── Publish to Metadata Service Queue ────────────────────────────────
    try:
        metadata_token = create_service_token("ocr-service")
        metadata_payload = {
            "documentId": ocr_result.documentId,
            "enterprise_id": enterprise_id,
            "filename": ocr_result.filename,
            "languages": ocr_result.languages_detected,
            "total_lines": len(all_lines),
            "raw_text": ocr_result.raw_text,
            "results": [
                {
                    "text": line.text,
                    "confidence": line.confidence,
                }
                for line in all_lines
            ],
            "processed_at": ocr_result.processed_at,
            "token": metadata_token,
            "forceProcessed": force,
        }
        await metadata_producer.publish(metadata_payload)
        logger.info("Published to Metadata Service: documentId=%s", ocr_result.documentId)
    except Exception as exc:
        logger.error("Metadata publish failed: %s", exc)

    # ── Return result with quality information ────────────────────────────
    response_data = {
        "status": "completed",
        "documentId": ocr_result.documentId,
        "enterprise_id": enterprise_id,
        "filename": ocr_result.filename,
        "raw_text": ocr_result.raw_text,
        "text_length": len(ocr_result.raw_text),
        "total_pages": len(images),
        "total_lines": len(all_lines),
        "confidence": round(avg_confidence, 3),
        "force_processed": force,
        "has_warnings": has_warnings,
        "has_critical_issues": has_critical_issues,
        "quality_warnings": quality_warnings if quality_warnings else None,
        "quality_reports": all_quality_reports,
        "queues": {
            "document_service": DOCUMENT_SERVICE_QUEUE,
            "classifier": QUEUE_NAME,
            "metadata": "metadata.extract.request"
        }
    }

    return response_data


# ── Root ─────────────────────────────────────────────────────────────────

@app.get("/", tags=["Info"])
async def root():
    return {
        "service": "OCR Service",
        "version": "2.0",
        "engine": "PaddleOCR with finetuned Arabic model",
        "queues": {
            "classifier_queue": QUEUE_NAME,
            "document_service_queue": DOCUMENT_SERVICE_QUEUE,
            "metadata_queue": "metadata.extract.request"
        },
        "supported_formats": {
            "images": ["JPEG", "PNG", "TIFF", "BMP", "WebP", "GIF"],
            "documents": ["PDF", "DOCX", "PPTX"],
        },
        "quality_control": {
            "force_parameter": "Use ?force=true to bypass quality checks",
            "returns_warnings": "Quality warnings are returned in response even when processing succeeds"
        }
    }
