from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from typing import Dict, Any, List, Optional
import base64
import email
from app.core.config import settings

SCOPES = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels"
]

def get_oauth_flow() -> Flow:
    client_config = {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI]
        }
    }
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI
    )
    return flow

class GmailService:
    def __init__(self, token_info: dict):
        self.credentials = Credentials(
            token=token_info.get("access_token"),
            refresh_token=token_info.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            scopes=SCOPES
        )
        self.service = build("gmail", "v1", credentials=self.credentials)

    def get_user_profile(self) -> Dict[str, Any]:
        return self.service.users().getProfile(userId="me").execute()

    def list_messages(self, max_results: int = 30, query: str = "") -> List[Dict[str, Any]]:
        results = self.service.users().messages().list(
            userId="me", maxResults=max_results, q=query
        ).execute()
        return results.get("messages", [])

    def get_message_detail(self, message_id: str) -> Dict[str, Any]:
        msg = self.service.users().messages().get(
            userId="me", id=message_id, format="full"
        ).execute()
        
        payload = msg.get("payload", {})
        headers = payload.get("headers", [])
        
        header_dict = {h["name"].lower(): h["value"] for h in headers}
        subject = header_dict.get("subject", "No Subject")
        sender = header_dict.get("from", "Unknown Sender")
        to = header_dict.get("to", "")
        date = header_dict.get("date", "")

        body = self._extract_body(payload)

        return {
            "id": msg["id"],
            "threadId": msg.get("threadId"),
            "subject": subject,
            "from": sender,
            "to": to,
            "date": date,
            "snippet": msg.get("snippet", ""),
            "body": body,
            "labelIds": msg.get("labelIds", [])
        }

    def _extract_body(self, payload: dict) -> str:
        body = ""
        if "parts" in payload:
            for part in payload["parts"]:
                mime_type = part.get("mimeType", "")
                data = part.get("body", {}).get("data")
                if data:
                    text = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
                    if mime_type == "text/plain":
                        return text
                    elif mime_type == "text/html" and not body:
                        body = text
                if "parts" in part:
                    sub = self._extract_body(part)
                    if sub:
                        return sub
        elif "body" in payload and payload["body"].get("data"):
            data = payload["body"]["data"]
            body = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
            
        return body

    def list_labels(self) -> List[Dict[str, Any]]:
        res = self.service.users().labels().list(userId="me").execute()
        return res.get("labels", [])

    def create_label(self, label_name: str) -> Dict[str, Any]:
        labels = self.list_labels()
        for l in labels:
            if l["name"].lower() == label_name.lower():
                return l
        body = {
            "name": label_name,
            "labelListVisibility": "labelShow",
            "messageListVisibility": "show"
        }
        return self.service.users().labels().create(userId="me", body=body).execute()

    def modify_labels(self, message_id: str, add_labels: List[str] = None, remove_labels: List[str] = None) -> Dict[str, Any]:
        body = {
            "addLabelIds": add_labels or [],
            "removeLabelIds": remove_labels or []
        }
        return self.service.users().messages().modify(userId="me", id=message_id, body=body).execute()
