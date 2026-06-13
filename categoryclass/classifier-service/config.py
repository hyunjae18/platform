from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    rabbitmq_host: str = "rabbitmq"
    rabbitmq_port: int = 5672
    rabbitmq_user: str = "admin"
    rabbitmq_pass: str = "admin123"
    classifier_service_url: str = "http://classifier-service:8002"
    ocr_gpu: bool = False
    jwt_secret: str = "docmind-secure-jwt-key-2024"
    jwt_algorithm: str = "HS256"

    # MongoDB
    mongodb_uri: str
    mongodb_db: str
    mongodb_collection: str
    
    jwt_secret: str = "docmind-secure-jwt-key-2024"   
    jwt_algorithm: str = "HS256"
    # Gateway for failure reporting
    gateway_url: str = "http://api-gateway:8001"

    class Config:
        env_file = ".env"
        env_prefix = ""

settings = Settings()
