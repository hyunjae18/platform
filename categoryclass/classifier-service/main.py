"""
Classifier Service — RabbitMQ Consumer
Consumes messages from document_text_queue and classifies each document.
Publishes results to both result queue AND document service.
"""

import json
import logging
import threading
import time
from datetime import datetime
import httpx  # ADD this import

import pika
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo import MongoClient

from jose import JWTError, jwt
from security import verify_service_token
from config import settings
from classifier_engine import classifier_engine
from schemas import ClassifyRequest

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)

logger = logging.getLogger("classifier-service")
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

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Classifier Service",
    version="2.0",
)

# ---------------------------------------------------------------------------
# RabbitMQ config
# ---------------------------------------------------------------------------
QUEUE_NAME = "document_text_queue"
EXCHANGE = "document_exchange"
ROUTING_KEY = "document.text"
RESULT_QUEUE = "classification_result_queue"
DOCUMENT_SERVICE_QUEUE = "document.classified"

# NEW: Gateway URL for failure reporting
GATEWAY_URL = settings.gateway_url  # Add this to config


async def report_failure(documentId: str, enterprise_id: str, error_msg: str):
    """Report failure to API Gateway"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{GATEWAY_URL}/api/ocr/failure",
                json={"documentId": documentId, "error_message": error_msg},
                headers={"X-Enterprise-ID": enterprise_id},
            )
    except Exception as e:
        logger.error(f"Failed to report failure to gateway: {e}")


# ===========================================================================
# RabbitMQ Consumer
# ===========================================================================
class RabbitMQConsumer:

    MAX_RECONNECT_DELAY = 60

    def __init__(self):
        self._connection = None
        self._channel = None
        self.consuming = False
        self._stop_event = threading.Event()
        self._doc_service_channel = None

        # MongoDB
        self.mongo_client = MongoClient(settings.mongodb_uri)
        self.db = self.mongo_client["classifier_db"]
        self.collection = self.db["classifications"]

        self.collection.create_index(
            [("enterprise_id", 1), ("documentId", 1)],
            unique=True,
        )
        self.collection.create_index([("enterprise_id", 1), ("processed_at", -1)])

    # ----------------------------------------------------------------------
    # RabbitMQ connection
    # ----------------------------------------------------------------------
    def _build_params(self):
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

    def _connect(self):
        try:
            self._connection = pika.BlockingConnection(self._build_params())
            self._channel = self._connection.channel()

            self._channel.exchange_declare(
                exchange=EXCHANGE,
                exchange_type="topic",
                durable=True,
            )

            self._channel.queue_declare(queue=QUEUE_NAME, durable=True)
            self._channel.queue_bind(
                queue=QUEUE_NAME,
                exchange=EXCHANGE,
                routing_key=ROUTING_KEY,
            )

            self._channel.queue_declare(queue=RESULT_QUEUE, durable=True)
            self._channel.queue_declare(queue=DOCUMENT_SERVICE_QUEUE, durable=True)

            self._channel.basic_qos(prefetch_count=1)

            self._doc_service_connection = pika.BlockingConnection(self._build_params())
            self._doc_service_channel = self._doc_service_connection.channel()
            self._doc_service_channel.queue_declare(queue=DOCUMENT_SERVICE_QUEUE, durable=True)

            logger.info("RabbitMQ connected (consumer + document service publisher)")
            return True

        except Exception as exc:
            logger.error("RabbitMQ connection failed: %s", exc)
            return False

    # ----------------------------------------------------------------------
    # Publish to Document Service
    # ----------------------------------------------------------------------
    def _publish_to_document_service(self, classification_result: dict):
        """Publish classification results directly to document service"""
        try:
            doc_service_payload = {
                "documentId": classification_result["documentId"],
                "enterprise_id": classification_result["enterprise_id"],
                "category": classification_result["category"],
                "categoryConfidence": classification_result["category_confidence"],
                "documentType": classification_result["document_type"],
                "documentTypeConfidence": classification_result["document_type_confidence"],
                "language": classification_result["language"],
                "processedAt": datetime.utcnow().isoformat(),
                "source": "classifier_service"
            }
            
            self._doc_service_channel.basic_publish(
                exchange="",
                routing_key=DOCUMENT_SERVICE_QUEUE,
                body=json.dumps(doc_service_payload),
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    content_type="application/json",
                ),
            )
            
            logger.info(
                " Published to Document Service | documentId=%s | category=%s",
                classification_result["documentId"],
                classification_result["category"]
            )
            
        except Exception as exc:
            logger.error("Failed to publish to document service: %s", exc)

    # ----------------------------------------------------------------------
    # Message handler
    # ----------------------------------------------------------------------
    def _on_message(self, channel, method, _, body: bytes):

        delivery_tag = method.delivery_tag

        try:
            message = json.loads(body)

            # Verify token
            token = message.get("token")
            if not token:
                raise ValueError("Missing service token")

            payload = verify_service_token(token)
            if not payload:
                raise ValueError("Invalid service token")

            service_name = payload.get("service")
            logger.info("Authenticated service: %s", service_name)

            documentId = message["documentId"]
            enterprise_id = message.get("enterprise_id")
            if not enterprise_id:
                raise ValueError("Missing enterprise_id")
            filename = message.get("filename", "")
            text = message.get("raw_text", "")

            logger.info(" Received for classification | documentId=%s", documentId)

            if not text.strip():
                raise ValueError("Empty text")

            # -----------------------------
            # Classification
            # -----------------------------
            req = ClassifyRequest(
                documentId=documentId,
                filename=filename,
                raw_text=text,
            )

            result = classifier_engine.classify(req)

            output = {
                "documentId": result.documentId,
                "enterprise_id": enterprise_id,
                "filename": result.filename,
                "document_type": result.document_type,
                "document_type_confidence": result.document_type_confidence,
                "category": result.category,
                "category_confidence": result.category_confidence,
                "language": result.language_dominant,
                "raw_text": text,
                "confidence_avg": (result.document_type_confidence + result.category_confidence) / 2,
            }

            # Publish result to result queue
            self._publish_result(output)

            # Publish to Document Service
            self._publish_to_document_service(output)

            # Save to MongoDB
            try:
                mongo_doc = {
                    **output,
                    "source_queue": QUEUE_NAME,
                    "processed_at": datetime.utcnow().isoformat()
                }
                self.collection.insert_one(mongo_doc)
                logger.info(" Saved to MongoDB | documentId=%s", documentId)
            except Exception as db_exc:
                logger.error("MongoDB save failed: %s", db_exc)

            channel.basic_ack(delivery_tag=delivery_tag)

        except Exception as exc:
            error_msg = str(exc)
            logger.error("Classification error: %s", error_msg, exc_info=True)
            # Try to extract documentId and enterprise_id from message if possible
            try:
                message = json.loads(body)
                doc_id = message.get("documentId")
                ent_id = message.get("enterprise_id")
                if doc_id and ent_id:
                    import asyncio
                    asyncio.run(report_failure(doc_id, ent_id, f"Classifier: {error_msg}"))
            except:
                pass
            channel.basic_nack(delivery_tag=delivery_tag, requeue=False)

    # ----------------------------------------------------------------------
    # Publish result to result queue
    # ----------------------------------------------------------------------
    def _publish_result(self, result: dict):
        try:
            self._channel.basic_publish(
                exchange="",
                routing_key=RESULT_QUEUE,
                body=json.dumps(result),
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    content_type="application/json",
                ),
            )
            logger.info(" Published to result queue | documentId=%s", result["documentId"])
        except Exception as exc:
            logger.error("Publish to result queue failed: %s", exc)

    # ----------------------------------------------------------------------
    # Consumer loop
    # ----------------------------------------------------------------------
    def run(self):
        delay = 5
        while not self._stop_event.is_set():
            if self._connect():
                delay = 5
                try:
                    self._channel.basic_consume(
                        queue=QUEUE_NAME,
                        on_message_callback=self._on_message,
                        auto_ack=False,
                    )
                    self.consuming = True
                    logger.info(" Listening on queue: %s", QUEUE_NAME)
                    self._channel.start_consuming()
                except Exception as exc:
                    logger.error("Consumer error: %s", exc)
                finally:
                    self.consuming = False
            else:
                logger.warning("Reconnect in %ds", delay)
                time.sleep(delay)
                delay = min(delay * 2, self.MAX_RECONNECT_DELAY)

    def stop(self):
        self._stop_event.set()
        try:
            if self._channel:
                self._channel.stop_consuming()
            if self._doc_service_channel:
                self._doc_service_channel.close()
            if self._connection:
                self._connection.close()
            if self._doc_service_connection:
                self._doc_service_connection.close()
        except Exception as e:
            logger.error("Error during shutdown: %s", e)


consumer = RabbitMQConsumer()


# ===========================================================================
# FastAPI lifecycle
# ===========================================================================
@app.on_event("startup")
async def startup():
    logger.info(" Starting classifier service...")
    classifier_engine.initialize()
    logger.info("Starting RabbitMQ consumer thread...")
    thread = threading.Thread(target=consumer.run, daemon=True)
    thread.start()
    logger.info(" Classifier service started")


@app.on_event("shutdown")
async def shutdown():
    logger.info(" Shutting down classifier service...")
    consumer.stop()
    logger.info(" Classifier service stopped")


# ===========================================================================
# Endpoints
# ===========================================================================
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "classifier",
        "mongo": "connected",
        "rabbitmq_consuming": consumer.consuming,
    }


@app.post("/classify/sync")
async def classify_sync(request: ClassifyRequest):
    try:
        result = classifier_engine.classify(request)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/")
async def root():
    return {"service": "classifier", "version": "2.0"}


@app.get("/classifications/{documentId}")
async def get_classification(
    documentId: str,
    enterprise_id: str = Depends(get_enterprise_id),
):
    result = consumer.collection.find_one(
        {"documentId": documentId, "enterprise_id": enterprise_id},
        {"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Classification not found")
    return result


@app.get("/classifications")
async def list_classifications(
    limit: int = 50,
    skip: int = 0,
    enterprise_id: str = Depends(get_enterprise_id),
):
    filter_doc = {"enterprise_id": enterprise_id}
    results = list(consumer.collection.find(filter_doc, {"_id": 0})
                  .sort("processed_at", -1)
                  .skip(skip)
                  .limit(limit))
    return {
        "total": consumer.collection.count_documents(filter_doc),
        "limit": limit,
        "skip": skip,
        "results": results
    }