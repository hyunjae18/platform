from jose import jwt, JWTError
from datetime import datetime, timedelta
from config import settings   # import the settings instance

def create_service_token(service_name: str) -> str:
    """
    Create a JWT token for inter‑service authentication.
    The token includes a 'service' claim (expected by classifier).
    """
    payload = {
        "service": service_name,          # classifier expects "service", not "sub"
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

def verify_service_token(token: str):
    """Verify a service token and return its payload, or None if invalid."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError:
        return None