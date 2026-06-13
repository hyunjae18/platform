from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    rabbitmq_host: str = "rabbitmq"
    rabbitmq_port: int = 5672
    rabbitmq_user: str = "admin"
    rabbitmq_pass: str = "admin123"
    rabbitmq_queue_metadata: str = "metadata_queue"
    rabbitmq_queue_classifier: str = "classifier_queue"   
    classifier_service_url: str = "http://classifier-service:8002"
    ocr_gpu: bool = False

    # MongoDB
    mongodb_uri: str
    mongodb_db: str
    mongodb_collection: str

    # JWT shared secret with classifier
    jwt_secret: str = "docmind-secure-jwt-key-2024"   # must match classifier's secret
    jwt_algorithm: str = "HS256"

    class Config:
        env_file = ".env"

settings = Settings()
