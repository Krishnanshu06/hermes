from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List
from app.api.auth import get_current_user_token
from app.services.gmail import GmailService
from app.services.gemini import gemini_service
from pydantic import BaseModel

router = APIRouter(prefix="/emails", tags=["emails"])

class LabelUpdateRequest(BaseModel):
    add_labels: List[str] = []
    remove_labels: List[str] = []

@router.get("/")
def get_emails(
    max_results: int = Query(15, ge=1, le=50),
    q: Optional[str] = "",
    token_info: dict = Depends(get_current_user_token)
):
    gmail_svc = GmailService(token_info)
    messages = gmail_svc.list_messages(max_results=max_results, query=q)
    
    detailed_emails = []
    for m in messages:
        try:
            detail = gmail_svc.get_message_detail(m["id"])
            detailed_emails.append(detail)
        except Exception as e:
            continue
            
    return {"emails": detailed_emails}

@router.get("/{message_id}")
def get_email(
    message_id: str,
    token_info: dict = Depends(get_current_user_token)
):
    gmail_svc = GmailService(token_info)
    detail = gmail_svc.get_message_detail(message_id)
    return detail

@router.post("/{message_id}/analyze")
def analyze_single_email(
    message_id: str,
    token_info: dict = Depends(get_current_user_token)
):
    gmail_svc = GmailService(token_info)
    email = gmail_svc.get_message_detail(message_id)
    
    analysis = gemini_service.analyze_email(
        subject=email["subject"],
        sender=email["from"],
        snippet=email["snippet"],
        body=email["body"]
    )
    return {"id": message_id, "analysis": analysis}

@router.post("/batch-organize")
def batch_organize_inbox(
    max_results: int = Query(10, ge=1, le=25),
    apply_labels_to_gmail: bool = False,
    token_info: dict = Depends(get_current_user_token)
):
    gmail_svc = GmailService(token_info)
    messages = gmail_svc.list_messages(max_results=max_results, query="label:INBOX")
    
    results = []
    for m in messages:
        try:
            email = gmail_svc.get_message_detail(m["id"])
            analysis = gemini_service.analyze_email(
                subject=email["subject"],
                sender=email["from"],
                snippet=email["snippet"],
                body=email["body"]
            )
            
            # Optional: auto-apply category label to Gmail
            if apply_labels_to_gmail and analysis.get("category"):
                label_obj = gmail_svc.create_label(f"Hermes/{analysis['category']}")
                gmail_svc.modify_labels(m["id"], add_labels=[label_obj["id"]])

            results.append({
                "email": email,
                "analysis": analysis
            })
        except Exception as e:
            continue
            
    return {"count": len(results), "items": results}

@router.post("/{message_id}/labels")
def update_email_labels(
    message_id: str,
    req: LabelUpdateRequest,
    token_info: dict = Depends(get_current_user_token)
):
    gmail_svc = GmailService(token_info)
    res = gmail_svc.modify_labels(message_id, add_labels=req.add_labels, remove_labels=req.remove_labels)
    return res
