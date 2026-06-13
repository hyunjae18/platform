import asyncio
import json
import logging
import httpx
import aio_pika
from aio_pika import IncomingMessage
from config import settings

logger = logging.getLogger(__name__)

METADATA_INPUT_QUEUE = "metadata.extract.request"
METADATA_OUTPUT_QUEUE = "classification_result_queue"
GATEWAY_URL = settings.gateway_url
# The internal API URL (FastAPI running on same container)
METADATA_API_URL = "http://localhost:8004/extract"

async def report_failure(documentId: str, enterprise_id: str, error_msg: str):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{GATEWAY_URL}/api/ocr/failure",
                json={"documentId": documentId, "error_message": error_msg},
                headers={"X-Enterprise-ID": enterprise_id},
            )
    except Exception as e:
        logger.error(f"Failed to report metadata failure: {e}")

class MetadataConsumer:
    def __init__(self):
        self._connection = None
        self._channel = None
        self._publish_channel = None

    async def connect(self):
        self._connection = await aio_pika.connect_robust(
            host=settings.rabbitmq_host,
            port=settings.rabbitmq_port,
            login=settings.rabbitmq_user,
            password=settings.rabbitmq_pass,
        )
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=1)
        self._publish_channel = await self._connection.channel()

        input_queue = await self._channel.declare_queue(METADATA_INPUT_QUEUE, durable=True)
        await self._publish_channel.declare_queue(METADATA_OUTPUT_QUEUE, durable=True)

        await input_queue.consume(self._on_message)
        logger.info("Metadata consumer listening on '%s'", METADATA_INPUT_QUEUE)

    async def _call_metadata_api(self, text: str, doc_id: str, retries: int = 5, delay: float = 2.0):
        """Call the local FastAPI /extract endpoint with retries."""
        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(
                        METADATA_API_URL,
                        json={"text": text, "docId": doc_id}
                    )
                    response.raise_for_status()
                    return response.json()
            except (httpx.ConnectError, httpx.TimeoutException) as e:
                logger.warning(f"API not ready (attempt {attempt+1}/{retries}): {e}")
                if attempt < retries - 1:
                    await asyncio.sleep(delay)
                else:
                    raise
        raise RuntimeError(f"Could not connect to {METADATA_API_URL} after {retries} attempts")

    async def _on_message(self, message: IncomingMessage):
        async with message.process(requeue=False):
            try:
                payload = json.loads(message.body)
                document_id = payload.get("documentId")
                enterprise_id = payload.get("enterprise_id")
                if not enterprise_id:
                    raise ValueError("Missing enterprise_id")
                raw_text = payload.get("raw_text", "")
                logger.info("Received metadata request for doc %s", document_id)

                # Call the local FastAPI endpoint to extract metadata (with retry)
                frontend_metadata = await self._call_metadata_api(raw_text, document_id)

                document_type = frontend_metadata.get("category", "uncategorized")
                language = "unknown"  # You can extend API to return language
                metadata_fields = frontend_metadata

                output_payload = {
                    "documentId": document_id,
                    "enterprise_id": enterprise_id,
                    "filename": payload.get("filename", "unknown"),
                    "raw_text": raw_text,
                    "language": language,
                    "document_type": document_type,
                    "category": document_type,
                    "classified_at": payload.get("processed_at"),
                    "source": "metadata",
                    "metadata_fields": metadata_fields
                }

                await self._publish_channel.default_exchange.publish(
                    aio_pika.Message(
                        body=json.dumps(output_payload).encode(),
                        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    ),
                    routing_key=METADATA_OUTPUT_QUEUE,
                )
                logger.info("Published metadata result for %s", document_id)

            except Exception as exc:
                error_msg = str(exc)
                logger.error("Metadata processing failed: %s", error_msg, exc_info=True)
                if 'document_id' in locals() and 'enterprise_id' in locals():
                    await report_failure(document_id, enterprise_id, f"Metadata: {error_msg}")

    async def close(self):
        if self._connection:
            await self._connection.close()