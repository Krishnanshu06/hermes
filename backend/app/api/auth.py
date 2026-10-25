from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
import google.oauth2.credentials
from app.services.gmail import get_oauth_flow, GmailService
from app.core.security import create_access_token, decode_access_token
from app.core.config import settings
from app.core.db import upsert_account, get_all_accounts, get_account, delete_account

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/login")
def login():
    """Generates Google OAuth URL with prompt=select_account so user can easily add personal or school account."""
    flow = get_oauth_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="select_account"
    )
    return {"url": auth_url}

@router.get("/callback")
def oauth_callback(code: str):
    """Handles OAuth redirect callback, stores multi-account details into SQLite, and returns JWT."""
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
