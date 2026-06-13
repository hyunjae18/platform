from jose import jwt, JWTError
from datetime import datetime, timedelta
from config import settings   # <-- import settings

SECRET_KEY = settings.jwt_secret   # use the same secret as classifier config
ALGORITHM = settings.jwt_algorithm

def create_service_token(service_name: str):
    payload = {
        "sub": service_name,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_service_token(token: str):
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        return payload
    except JWTError:
        return None