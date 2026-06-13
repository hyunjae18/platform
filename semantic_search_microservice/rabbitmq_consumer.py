import json
import logging
import asyncio
import httpx  # ADD

import aio_pika
from aio_pika import IncomingMessage

from config import settings
from es_client import es_client

logger = logging.getLogger(__name__)

QUEUE_NAME = "classification_result_queue"
DOCUMENT_SERVICE_QUEUE = "document.search.indexed"
GATEWAY_URL = settings.gateway_url

async def report_failure(documentId: str, enterprise_id: str, error_msg: str):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{GATEWAY_URL}/api/ocr/failure",
                json={"documentId": documentId, "error_message": error_msg},
                headers={"X-Enterprise-ID": enterprise_id},
            )
    except Exception as e:
        logger.error(f"Failed to report search failure: {e}")

class RabbitMQConsumer:

    def __init__(self):
        self._connection = None
        self._channel = None
        self._queue = None
        self._publish_channel = None

    async def connect(self):
        try:
            self._connection = await aio_pika.connect_robust(
                host=settings.rabbitmq_host,
                port=settings.rabbitmq_port,
                login=settings.rabbitmq_user,
                password=settings.rabbitmq_pass,
            )

            self._channel = await self._connection.channel()
            await self._channel.set_qos(prefetch_count=1)

            self._queue = await self._channel.declare_queue(
                QUEUE_NAME,
                durable=True,
            )
            
            self._publish_channel = await self._connection.channel()
            await self._publish_channel.declare_queue(
                DOCUMENT_SERVICE_QUEUE,
                durable=True,
            )

            await self._queue.consume(self._on_message)

            logger.info("RabbitMQ consumer ready — listening on '%s'", QUEUE_NAME)

        except Exception as exc:
            logger.error("RabbitMQ connect failed: %s", exc)
            raise

    async def _publish_to_document_service(
        self,
        documentId: str,
        enterprise_id: str,
        success: bool,
        error_msg: str = None,
    ):
        try:
            payload = {
                "documentId": documentId,
                "enterprise_id": enterprise_id,
                "searchIndexed": success,
                "indexedAt": None,
                "error": error_msg
            }
            if success:
                from datetime import datetime
                payload["indexedAt"] = datetime.utcnow().isoformat()
            
            await self._publish_channel.default_exchange.publish(
                aio_pika.Message(
                    body=json.dumps(payload).encode(),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=DOCUMENT_SERVICE_QUEUE,
            )
            logger.info(" Published to document service | documentId=%s | success=%s", documentId, success)
        except Exception as exc:
            logger.error("Failed to publish to document service: %s", exc)

    async def _on_message(self, message: IncomingMessage):
        async with message.process(requeue=False):
            documentId = None
            enterprise_id = None
            try:
                payload = json.loads(message.body)

                documentId = payload.get("documentId")
                enterprise_id = payload.get("enterprise_id")
                if not enterprise_id:
                    raise ValueError("Missing enterprise_id")
                logger.info("Received classification result | documentId=%s", documentId)

                doc = {
                    "documentId":   documentId,
                    "enterprise_id": enterprise_id,
                    "filename":      payload.get("filename", ""),
                    "raw_text":      payload.get("raw_text", ""),
                    "language":      payload.get("language", "unknown"),
                    "document_type": payload.get("document_type"),
                    "category":      payload.get("category"),
                    "processed_at":  payload.get("classified_at") or payload.get("processed_at"),
                    "metadata_fields": payload.get("metadata_fields") or payload.get("metadata") or {},
                }

                success = es_client.index_document(doc)
                
                if success:
                    logger.info(" Indexed successfully | documentId=%s", documentId)
                    await self._publish_to_document_service(documentId, enterprise_id, success=True)
                else:
                    logger.warning(" Indexing returned False | documentId=%s", documentId)
                    await self._publish_to_document_service(documentId, enterprise_id, success=False, error_msg="Indexing failed")
                    await report_failure(documentId, enterprise_id, "Search indexing failed")

            except Exception as exc:
                error_msg = str(exc)
                logger.error("Search indexing error: %s", error_msg, exc_info=True)
                if documentId and enterprise_id:
                    await self._publish_to_document_service(documentId, enterprise_id, success=False, error_msg=error_msg)
                    await report_failure(documentId, enterprise_id, f"Search: {error_msg}")

    async def close(self):
        if self._connection:
            await self._connection.close()

rabbitmq_consumer = RabbitMQConsumer()
