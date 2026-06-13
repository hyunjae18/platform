import logging

from pymongo import MongoClient
from pymongo.collection import Collection

from config import settings

logger = logging.getLogger(__name__)


class MongoDB:

    def __init__(self):

        self._client: MongoClient | None = None

        self._collection: Collection | None = None

    # --------------------------------------------------------------
    # Connect
    # --------------------------------------------------------------
    def connect(self):

        self._client = MongoClient(
            settings.mongodb_uri
        )

        db = self._client[
            settings.mongodb_db
        ]

        self._collection = db[
            settings.mongodb_collection
        ]

        # unique index
        self._collection.create_index(
            [("enterprise_id", 1), ("documentId", 1)],
            unique=True
        )
        self._collection.create_index(
            [("enterprise_id", 1), ("processed_at", -1)]
        )

        logger.info(
            f"Connected to MongoDB "
            f"(db={settings.mongodb_db}, "
            f"collection={settings.mongodb_collection})"
        )

    # --------------------------------------------------------------
    # Save OCR Document
    # --------------------------------------------------------------
    def save_document(self, ocr_result) -> bool:
        doc = {

          "documentId": ocr_result.documentId,
          "enterprise_id": ocr_result.enterprise_id,
          "filename": ocr_result.filename,
          "content_type": ocr_result.content_type,
          "file_path": ocr_result.file_path,
          "raw_text": ocr_result.raw_text,
          "languages_detected":ocr_result.languages_detected,
          "total_lines": ocr_result.total_lines,
          "lines": [
                {
                    "text": line.text,
                    "confidence": line.confidence,
                }
                for line in ocr_result.lines
            ],
          "processed_at": ocr_result.processed_at,
        }

        self._collection.insert_one(doc)

        logger.info(
            f"Saved OCR document "
            f"{ocr_result.documentId}"
        )

        return True

    # --------------------------------------------------------------
    # Get Full Document
    # --------------------------------------------------------------
    def get_document(
        self,
        documentId: str,
        enterprise_id: str
    ) -> dict | None:

        return self._collection.find_one(
            {"documentId": documentId, "enterprise_id": enterprise_id},
            {"_id": 0}
        )

    # --------------------------------------------------------------
    # Get Metadata Only
    # --------------------------------------------------------------
    def get_document_metadata(
        self,
        documentId: str,
        enterprise_id: str
    ) -> dict | None:

        return self._collection.find_one(
            {"documentId": documentId, "enterprise_id": enterprise_id},
            {
                "_id": 0,
                "raw_text": 0,
            }
        )

    # --------------------------------------------------------------
    # Close
    # --------------------------------------------------------------
    def close(self):

        if self._client:

            self._client.close()

            logger.info(
                "MongoDB connection closed"
            )


mongodb = MongoDB()
