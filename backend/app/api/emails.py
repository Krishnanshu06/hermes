from fastapi import APIRouter, Depends, Query, HTTPException, Request
from typing import Optional, List
from app.api.auth import get_current_user_account
from app.services.gmail import GmailService
from app.services.gemini import gemini_service
from app.core.config import settings
from app.core.db import (
    save_email,
    get_cached_emails,
    get_email_by_id,
    get_account,
    get_all_accounts,
    update_account_sync_time,
    get_categories,
    upsert_category,
    delete_category,
    get_setting,
    set_setting,
    delete_single_email,
    delete_emails_by_category,
    update_email_flags,
    purge_old_unstarred_emails
)
from pydantic import BaseModel
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/emails", tags=["emails"])

class SyncRequest(BaseModel):
    account_email: Optional[str] = None
    max_results: int = 25

class CategoryPayload(BaseModel):
    id: str
    label: str
    description: Optional[str] = ""
    color: Optional[str] = "#a1a1aa"

class SettingsPayload(BaseModel):
    retention_days: int

class UpdateFlagsPayload(BaseModel):
    is_starred: Optional[bool] = None
    is_interested: Optional[bool] = None
    category: Optional[str] = None

@router.get("/")
def get_emails(
    account_email: Optional[str] = Query("all"),
    category: Optional[str] = Query("all"),
    q: Optional[str] = Query(""),
    limit: int = Query(300, ge=1, le=500),
    current_acc: Optional[dict] = Depends(get_current_user_account)
):
    """Returns cached emails from Supabase/SQLite."""
    cached = get_cached_emails(
        account_email=account_email,
        category=category,
        search_query=q,
        limit=limit
    )
    return {"emails": cached, "total": len(cached)}

@router.get("/categories")
def list_categories():
    """Lists all user & system categories."""
    return {"categories": get_categories()}

@router.post("/categories")
def create_or_edit_category(payload: CategoryPayload):
    """Creates or updates a custom category with prompt description and subtle color."""
    upsert_category(
        cat_id=payload.id,
        label=payload.label,
        description=payload.description or "",
        color=payload.color or "#a1a1aa"
    )
    return {"status": "ok", "categories": get_categories()}

@router.delete("/categories/{cat_id}")
def remove_category(cat_id: str):
    """Deletes category and reassigns its emails to FYI/General."""
    delete_category(cat_id)
    return {"status": "deleted", "categories": get_categories()}

@router.get("/settings")
def get_app_settings():
    """Retrieves retention days and app configuration."""
    retention_days = int(get_setting("retention_days", "30"))
    return {"retention_days": retention_days}

@router.post("/settings")
def update_app_settings(payload: SettingsPayload):
    """Updates retention days (e.g. auto delete unstarred emails after X days)."""
    set_setting("retention_days", str(payload.retention_days))
    purged = purge_old_unstarred_emails()
    return {"status": "ok", "retention_days": payload.retention_days, "purged_emails": purged}

@router.delete("/category/{category_name}")
def delete_all_emails_in_category(category_name: str):
    """Deletes all emails in a category."""
    delete_emails_by_category(category_name)
    return {"status": "deleted", "category": category_name}

@router.delete("/{message_id}")
def delete_one_email(message_id: str):
    """Deletes a single email from Hermes permanently."""
    delete_single_email(message_id)
    return {"status": "deleted", "id": message_id}

@router.patch("/{message_id}/flags")
def update_flags(message_id: str, payload: UpdateFlagsPayload):
    """Reassigns category, stars, or sets interested status."""
    update_email_flags(
        email_id=message_id,
        is_starred=payload.is_starred,
        is_interested=payload.is_interested,
        category=payload.category
    )
    updated = get_email_by_id(message_id)
    return {"status": "updated", "email": updated}

@router.post("/sync")
def sync_inbox(
    req: SyncRequest,
    current_acc: Optional[dict] = Depends(get_current_user_account)
):
    """Incremental fetch & auto-Gemini summarize directly into database."""
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
                existing = get_email_by_id(m["id"])
                if existing:
                    continue

                try:
                    detail = svc.get_message_detail(m["id"])
                    analysis = gemini_service.analyze_email(
                        subject=detail.get("subject", ""),
                        sender=detail.get("from", ""),
                        snippet=detail.get("snippet", ""),
                        body=detail.get("body", "") or "",
                        email_date=detail.get("date", "")
                    )
                    save_email(detail, acc["email"], analysis=analysis)
                    synced_new_count += 1
                except Exception as ex:
                    logger.error(f"Error fetching/analyzing email {m['id']}: {ex}")

            update_account_sync_time(acc["email"])
        except Exception as e:
            logger.error(f"Error syncing account {acc['email']}: {e}")

    purge_old_unstarred_emails()

    return {
        "status": "success",
        "synced_new_emails": synced_new_count,
        "message": f"Successfully synced and categorized {synced_new_count} new emails."
    }
