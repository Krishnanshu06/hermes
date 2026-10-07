from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
import google.oauth2.credentials
from app.services.gmail import get_oauth_flow, GmailService
from app.core.security import create_access_token, decode_access_token
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory storage for demonstration / local dev session mapping
# For production, replace with Redis or database table
TOKEN_STORAGE = {}

@router.get("/login")
def login():
    """Generates Google OAuth URL and redirects user."""
    flow = get_oauth_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    return {"url": auth_url}

@router.get("/callback")
def oauth_callback(code: str):
    """Handles OAuth redirect callback and issues JWT."""
    try:
        flow = get_oauth_flow()
        flow.fetch_token(code=code)
        credentials = flow.credentials

        token_info = {
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": credentials.scopes
        }

        gmail_svc = GmailService(token_info)
        profile = gmail_svc.get_user_profile()
        email = profile.get("emailAddress", "unknown")

        # Store user's token info in memory
        TOKEN_STORAGE[email] = token_info

        # Create session JWT for frontend
        app_jwt = create_access_token({"sub": email})

        # Redirect user back to frontend dashboard with token
        redirect_url = f"{settings.FRONTEND_URL}/?token={app_jwt}&email={email}"
        return RedirectResponse(url=redirect_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")

def get_current_user_token(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    token = auth_header.split(" ")[1]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    email = payload["sub"]
    if email not in TOKEN_STORAGE:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    
    return TOKEN_STORAGE[email]
