from fastapi import APIRouter, Depends, Query, HTTPException, Request
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
    get_all_accounts,
    update_account_sync_time
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
    max_results: int = 20

@router.get("/")
def get_emails(
    account_email: Optional[str] = Query("all", description="Filter by account email or 'all'"),
    category: Optional[str] = Query("all", description="Filter by category or 'all'"),
    q: Optional[str] = Query("", description="Full text search for keywords, employers, competitions"),
    limit: int = Query(200, ge=1, le=500),
    current_acc: Optional[dict] = Depends(get_current_user_account)
):
    """
    Returns cached emails from SQLite database.
    Zero token cost: Reads directly from local DB without calling LLM or Gmail API.
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
    current_acc: Optional[dict] = Depends(get_current_user_account)
):
    """Fetches full email details from SQLite."""
    email_data = get_email_by_id(message_id)
    if not email_data:
        raise HTTPException(status_code=404, detail="Email not found")
    return email_data

@router.post("/sync")
def sync_inbox(
    req: SyncRequest,
    current_acc: Optional[dict] = Depends(get_current_user_account)
):
    """
    Incremental Sync:
    1. Fetches only new emails that aren't already in the database.
    2. Runs Gemini IMMEDIATELY upon fetching to summarize, categorize, and extract events/tasks.
    3. Permanently caches both email and Gemini analysis into SQLite.
    4. Never re-analyzes already stored emails (conserves all tokens).
    """
    accounts_to_sync = []
    if req.account_email and req.account_email != "all":
        acc = get_account(req.account_email)
        if acc:
            accounts_to_sync.append(acc)
    else:
        accounts_to_sync = [get_account(a["email"]) for a in get_all_accounts()]

    if not accounts_to_sync and current_acc:
        accounts_to_sync.append(current_acc)

    if not accounts_to_sync:
        return {"status": "error", "message": "No connected accounts found. Please connect your Gmail account once."}

    synced_new_count = 0
    analyzed_new_count = 0

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
                # Stop if already in DB to avoid unnecessary fetch & token spend
                existing = get_email_by_id(m["id"])
                if existing:
                    continue

                try:
                    detail = svc.get_message_detail(m["id"])
                    
                    # Analyze with Gemini automatically while fetching!
                    analysis = gemini_service.analyze_email(
                        subject=detail.get("subject", ""),
                        sender=detail.get("from", ""),
                        snippet=detail.get("snippet", ""),
                        body=detail.get("body", "") or "",
                        email_date=detail.get("date", "")
                    )
                    
                    # Save both email & Gemini summary into SQLite permanently
                    save_email(detail, acc["email"], analysis=analysis)
                    synced_new_count += 1
                    analyzed_new_count += 1
                except Exception as ex:
                    logger.error(f"Error fetching/analyzing email {m['id']}: {ex}")

            update_account_sync_time(acc["email"])
        except Exception as e:
            logger.error(f"Error syncing account {acc['email']}: {e}")

    return {
        "status": "success",
        "synced_new_emails": synced_new_count,
        "analyzed_emails": analyzed_new_count,
        "message": f"Successfully pulled and AI-analyzed {synced_new_count} new emails. All cached permanently."
    }

@router.post("/{message_id}/labels")
def update_email_labels(
    message_id: str,
    req: LabelUpdateRequest,
    current_acc: Optional[dict] = Depends(get_current_user_account)
):
    """Updates labels on Gmail."""
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
