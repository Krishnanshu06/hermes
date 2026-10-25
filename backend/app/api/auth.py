import requests
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
import google.oauth2.credentials
from app.services.gmail import get_oauth_flow, GmailService, SCOPES
from app.core.security import create_access_token, decode_access_token
from app.core.config import settings
from app.core.db import upsert_account, get_all_accounts, get_account, delete_account
from urllib.parse import urlencode

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/login")
def login():
    """Generates standard Google OAuth 2.0 authorization URL."""
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "select_account",
        "include_granted_scopes": "true"
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return {"url": auth_url}

@router.get("/callback")
def oauth_callback(code: str):
    """Exchanges authorization code directly via Google token endpoint without PKCE verifier mismatch."""
    try:
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code"
        }
        resp = requests.post(token_url, data=data)
        token_data = resp.json()

        if "error" in token_data:
            raise Exception(f"{token_data.get('error')}: {token_data.get('error_description')}")

        token_info = {
            "access_token": token_data.get("access_token"),
            "refresh_token": token_data.get("refresh_token"),
            "token_uri": token_url,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "scopes": token_data.get("scope", "").split(" ")
        }

        gmail_svc = GmailService(token_info)
        profile = gmail_svc.get_user_profile()
        email = profile.get("emailAddress", "unknown")

        # Save to SQLite database
        upsert_account(
            email=email,
            name=email.split("@")[0],
            picture="",
            token_info=token_info
        )

        # Issue user JWT token
        app_jwt = create_access_token({"sub": email})

        # Redirect user back to frontend dashboard
        redirect_url = f"{settings.FRONTEND_URL}/?token={app_jwt}&email={email}"
        return RedirectResponse(url=redirect_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")

@router.get("/accounts")
def list_accounts():
    """Returns all connected Gmail accounts (personal, school, etc.)."""
    return {"accounts": get_all_accounts()}

@router.delete("/accounts/{email}")
def remove_account(email: str):
    """Disconnects and removes an email account and its cached emails."""
    delete_account(email)
    return {"status": "deleted", "email": email}

def get_current_user_account(request: Request) -> dict:
    """Verifies Authorization Bearer JWT and retrieves account from DB."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    token = auth_header.split(" ")[1]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    email = payload["sub"]
    account = get_account(email)
    if not account:
        # Fallback to the first available connected account in DB
        all_accs = get_all_accounts()
        if all_accs:
            account = get_account(all_accs[0]["email"])
    
    if not account:
        raise HTTPException(status_code=401, detail="No active account session. Please connect your Gmail.")
        
    return account
