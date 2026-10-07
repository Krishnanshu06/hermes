from pydantic_settings import BaseSettings
from typing import Optional
import os
from pathlib import Path

# Load from project root .env if running from root or backend/
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent

class Settings(BaseSettings):
    GEMINI_API_KEY: str = ""
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"
    
    JWT_SECRET: str = "super_secret_jwt_key_default"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"

    class Config:
        env_file = [
            str(ROOT_DIR / ".env"),
            str(Path(__file__).resolve().parent.parent.parent / ".env"),
            ".env"
        ]
        extra = "ignore"

settings = Settings()
