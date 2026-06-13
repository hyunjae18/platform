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

        # Unique index
        self._collection.create_index(
            [("enterprise_id", 1), ("documentId", 1)],
            unique=True
        )
        self._collection.create_index([("enterprise_id", 1), ("classified_at", -1)])

        logger.info(
            f"Connected to MongoDB "
            f"(db={settings.mongodb_db}, "
            f"collection={settings.mongodb_collection})"
        )

    # --------------------------------------------------------------
    # Save Classification Result
    # --------------------------------------------------------------
    def save_classification(
        self,
        result
    ) -> bool:

        doc = {

            "documentId":result.documentId,
            "enterprise_id": result.enterprise_id,
            "filename":result.filename,
            "document_type": result.document_type,
            "document_type_confidence":result.document_type_confidence,
            "category":result.category,
            "category_confidence":result.category_confidence,
            "subcategory": result.subcategory,
            "type_scores": result.type_scores,
            "category_scores":result.category_scores,
            "language_dominant": result.language_dominant,
            "language_distribution": result.language_distribution,
            "classified_at":result.classified_at,
        }

        self._collection.insert_one(doc)

        logger.info(
            f"Saved classification result "
            f"{result.documentId}"
        )

        return True

    # --------------------------------------------------------------
    # Get Classification Result
    # --------------------------------------------------------------
    def get_classification(
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
    def get_classification_metadata(
        self,
        documentId: str,
        enterprise_id: str
    ) -> dict | None:

        return self._collection.find_one(
            {"documentId": documentId, "enterprise_id": enterprise_id},
            {
                "_id": 0,
                "summary": 0,
                "type_scores": 0,
                "category_scores": 0,
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
