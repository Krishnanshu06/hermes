from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, emails

app = FastAPI(
    title="Hermes API",
    description="Intelligent AI Email Organizer powered by Google Gemini and Gmail API",
    version="1.0.0"
)

# Enable CORS for frontend interactions
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(emails.router, prefix="/api")

@app.get("/")
def root():
    return {
        "name": "Hermes API",
        "status": "healthy",
        "documentation": "/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "ok"}
