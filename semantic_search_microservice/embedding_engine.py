import logging
from sentence_transformers import SentenceTransformer
from config import settings

logger = logging.getLogger(__name__)


class EmbeddingEngine:
    def __init__(self):
        self._model = None

    def initialize(self):
        logger.info(f"Loading embedding model: {settings.embedding_model} ...")
        self._model = SentenceTransformer(settings.embedding_model)
        logger.info("Embedding model loaded.")

    def embed(self, text: str) -> list[float]:
        if self._model is None:
            raise RuntimeError("Embedding model not initialized. Call initialize() first.")
        vector = self._model.encode(text, normalize_embeddings=True)
        return vector.tolist()


embedding_engine = EmbeddingEngine()
