from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    rabbitmq_host: str = "rabbitmq"
    rabbitmq_port: int = 5672
    rabbitmq_user: str = "admin"
    rabbitmq_pass: str = "admin123"
    
    # GLiNER model
    gliner_model: str = "urchade/gliner_multi-v2.1"
    device: str = "cpu"
    
    # Optional: MongoDB for storing extraction results
    mongodb_uri: str = ""
    mongodb_db: str = "metadata_db"
    mongodb_collection: str = "extractions"

    # Gateway for failure reporting
    gateway_url: str = "http://api-gateway:8001"

    class Config:
        env_file = ".env"

settings = Settings()
