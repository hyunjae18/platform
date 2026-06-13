import asyncio
import logging
import uvicorn
from fastapi import FastAPI
from metadata_consumer import MetadataConsumer
from api import app as fastapi_app  # Import the FastAPI app from api.py

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_http_server():
    """Run FastAPI with uvicorn on port 8004"""
    config = uvicorn.Config(
        fastapi_app,
        host="0.0.0.0",
        port=8004,
        log_level="info"
    )
    server = uvicorn.Server(config)
    await server.serve()

async def run_consumer():
    """Run the RabbitMQ metadata consumer"""
    consumer = MetadataConsumer()
    await consumer.connect()
    logger.info("Metadata service started, waiting for messages...")
    try:
        await asyncio.Future()  # run forever
    finally:
        await consumer.close()

async def main():
    # Run both tasks concurrently
    await asyncio.gather(
        run_http_server(),
        run_consumer()
    )

if __name__ == "__main__":
    asyncio.run(main())