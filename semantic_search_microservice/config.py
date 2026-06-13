from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # RabbitMQ
    rabbitmq_host: str = "rabbitmq"
    rabbitmq_port: int = 5672
    rabbitmq_user: str = "admin"
    rabbitmq_pass: str = "admin123"
    rabbitmq_queue_search_index: str = "classification_result_queue"

    # Elasticsearch
    elasticsearch_host: str = "http://elasticsearch:9200"
    elasticsearch_index: str = "documents"
    jwt_secret: str = "docmind-secure-jwt-key-2024"
    jwt_algorithm: str = "HS256"

    # Embedding model
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_dim: int = 384

    # Gateway for failure reporting
    gateway_url: str = "http://api-gateway:8001"

    class Config:
        env_file = ".env"


settings = Settings()
