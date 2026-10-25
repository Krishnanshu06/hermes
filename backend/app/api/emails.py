from fastapi import APIRouter, Depends, Query, HTTPException, Header
from typing import Optional, List
from app.api.auth import get_current_user_account
from app.services.gmail import GmailService
from app.services.gemini import gemini_service
from app.core.config import settings
from app.core.db import (
    save_email,
    update_email_analysis,
    get_cached_emails,
    get_email_by_id,
    get_account,
    get_all_accounts
)
from pydantic import BaseModel
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/emails", tags=["emails"])

class LabelUpdateRequest(BaseModel):
    add_labels: List[str] = []
    remove_labels: List[str] = []

class SyncRequest(BaseModel):
    account_email: Optional[str] = None
    max_results: int = 25

class AnalyzeRequest(BaseModel):
    access_code: str

def verify_access_code(code: str):
    if code != settings.AI_ACCESS_CODE:
        raise HTTPException(
            status_code=403,
            detail="Invalid Access Code. Enter 'kekuCode' to use Hermes AI features."
        )

@router.get("/")
def get_emails(
    account_email: Optional[str] = Query("all", description="Filter by account email or 'all'"),
    category: Optional[str] = Query("all", description="Filter by category or 'all'"),
    q: Optional[str] = Query("", description="Full text search for keywords, employers, competitions"),
    limit: int = Query(100, ge=1, le=250),
    current_acc: dict = Depends(get_current_user_account)
):
    """
    Returns cached emails from SQLite database. Token efficient: does not re-invoke LLM.
    Supports filtering by connected account (school/personal), category, and keyword search.
    """
    cached = get_cached_emails(
        account_email=account_email,
        category=category,
        search_query=q,
        limit=limit
    )
    return {"emails": cached, "total": len(cached)}

@router.get("/{message_id}")
def get_email_detail(
    message_id: str,
    current_acc: dict = Depends(get_current_user_account)
):
    """Fetches full cached email details from SQLite."""
    email_data = get_email_by_id(message_id)
    if not email_data:
        raise HTTPException(status_code=404, detail="Email not found")
    return email_data

@router.post("/sync")
def sync_inbox(
    req: SyncRequest,
    current_acc: dict = Depends(get_current_user_account)
):
    """
    Fetches latest emails from Gmail API and saves them into the local SQLite DB.
    Does NOT invoke LLM here to preserve tokens.
    """
    # Determine which accounts to sync
    accounts_to_sync = []
    if req.account_email and req.account_email != "all":
        acc = get_account(req.account_email)
        if acc:
            accounts_to_sync.append(acc)
    else:
        accounts_to_sync = [get_account(a["email"]) for a in get_all_accounts()]

    synced_count = 0
    for acc in accounts_to_sync:
        if not acc:
            continue
        try:
            token_info = {
                "access_token": acc["access_token"],
                "refresh_token": acc["refresh_token"],
                "token_uri": acc["token_uri"],
                "scopes": json.loads(acc["scopes"]) if acc["scopes"] else []
            }
            svc = GmailService(token_info)
            messages = svc.list_messages(max_results=req.max_results, query="label:INBOX")
            
            for m in messages:
                # Check if already cached
                existing = get_email_by_id(m["id"])
                if existing:
                    continue
                try:
                    detail = svc.get_message_detail(m["id"])
                    save_email(detail, acc["email"])
                    synced_count += 1
                except Exception as ex:
                    logger.error(f"Error fetching message {m['id']}: {ex}")
        except Exception as e:
            logger.error(f"Error syncing account {acc['email']}: {e}")

    return {
        "status": "success",
        "synced_new_emails": synced_count,
        "message": f"Successfully pulled {synced_count} new emails into database"
    }

@router.post("/{message_id}/analyze")
def analyze_single_email(
    message_id: str,
    req: AnalyzeRequest,
    current_acc: dict = Depends(get_current_user_account)
):
    """Analyzes a single email using Gemini AI. Protected by access code 'kekuCode'."""
    verify_access_code(req.access_code)
    
    email_data = get_email_by_id(message_id)
    if not email_data:
        raise HTTPException(status_code=404, detail="Email not found")
        
    analysis = gemini_service.analyze_email(
        subject=email_data["subject"],
        sender=email_data["sender"],
        snippet=email_data["snippet"],
        body=email_data["body"] or "",
        email_date=email_data["date_str"]
    )
    
    update_email_analysis(message_id, analysis, analysis.get("event_date"))
    updated = get_email_by_id(message_id)
    return {"id": message_id, "analysis": analysis, "email": updated}

@router.post("/batch-organize")
def batch_organize_inbox(
    req: AnalyzeRequest,
    limit: int = Query(15, ge=1, le=50),
    account_email: Optional[str] = Query("all"),
    current_acc: dict = Depends(get_current_user_account)
):
    """
    Processes unanalyzed emails through Gemini AI and permanently saves results to SQLite DB.
    Protected by access code 'kekuCode'.
    """
    verify_access_code(req.access_code)
    
    # Grab unanalyzed emails from database first
    all_emails = get_cached_emails(account_email=account_email, limit=limit)
    unanalyzed = [e for e in all_emails if not e.get("analyzed")]

    # If all are already analyzed, return cached
    if not unanalyzed:
        return {
            "count": len(all_emails),
            "analyzed_now": 0,
            "message": "All emails already analyzed in database (zero tokens consumed)."
        }

    analyzed_count = 0
    for e in unanalyzed[:limit]:
        try:
            analysis = gemini_service.analyze_email(
                subject=e["subject"],
                sender=e["sender"],
                snippet=e["snippet"],
                body=e["body"] or "",
                email_date=e["date_str"]
            )
            update_email_analysis(e["id"], analysis, analysis.get("event_date"))
            analyzed_count += 1
        except Exception as ex:
            logger.error(f"Error analyzing email {e['id']}: {ex}")

    return {
        "count": len(all_emails),
        "analyzed_now": analyzed_count,
        "message": f"Successfully analyzed {analyzed_count} emails with Gemini and cached in SQLite."
    }

@router.post("/{message_id}/labels")
def update_email_labels(
    message_id: str,
    req: LabelUpdateRequest,
    current_acc: dict = Depends(get_current_user_account)
):
    """Updates labels on Gmail and local DB."""
    email_data = get_email_by_id(message_id)
    if not email_data:
        raise HTTPException(status_code=404, detail="Email not found")
        
    acc = get_account(email_data["account_email"])
    if not acc:
        raise HTTPException(status_code=400, detail="Account not found")
        
    token_info = {
        "access_token": acc["access_token"],
        "refresh_token": acc["refresh_token"],
        "token_uri": acc["token_uri"],
        "scopes": json.loads(acc["scopes"]) if acc["scopes"] else []
    }
    svc = GmailService(token_info)
    res = svc.modify_labels(message_id, add_labels=req.add_labels, remove_labels=req.remove_labels)
    return res
