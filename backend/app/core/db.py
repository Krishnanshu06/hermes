import sqlite3
import json
from typing import List, Dict, Any, Optional
from pathlib import Path
from app.core.config import settings

def get_db():
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Accounts table (supports multiple Gmail accounts, personal and school)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS accounts (
        email TEXT PRIMARY KEY,
        name TEXT,
        picture TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_uri TEXT,
        scopes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_synced TIMESTAMP
    )
    """)
    
    # Emails cache & metadata table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        account_email TEXT NOT NULL,
        thread_id TEXT,
        subject TEXT,
        sender TEXT,
        recipient TEXT,
        date_str TEXT,
        snippet TEXT,
        body TEXT,
        label_ids TEXT,
        analyzed INTEGER DEFAULT 0,
        category TEXT,
        priority TEXT,
        summary TEXT,
        suggested_reply TEXT,
        tasks_json TEXT,
        event_date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_email) REFERENCES accounts(email)
    )
    """)
    
    # Index for fast search across accounts, subjects, senders, snippets, categories
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_email)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_event_date ON emails(event_date)")
    
    conn.commit()
    conn.close()

# Auto-initialize DB schema upon module import
init_db()

# Database Helper Functions

def upsert_account(email: str, name: str, picture: str, token_info: dict):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO accounts (email, name, picture, access_token, refresh_token, token_uri, scopes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        picture = excluded.picture,
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, accounts.refresh_token),
        token_uri = excluded.token_uri,
        scopes = excluded.scopes
    """, (
        email,
        name,
        picture,
        token_info.get("access_token"),
        token_info.get("refresh_token"),
        token_info.get("token_uri"),
        json.dumps(token_info.get("scopes", []))
    ))
    conn.commit()
    conn.close()

def get_all_accounts() -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT email, name, picture, created_at, last_synced FROM accounts ORDER BY created_at ASC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def get_account(email: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM accounts WHERE email = ?", (email,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_account(email: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM emails WHERE account_email = ?", (email,))
    cursor.execute("DELETE FROM accounts WHERE email = ?", (email,))
    conn.commit()
    conn.close()

def save_email(email_data: dict, account_email: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO emails (
        id, account_email, thread_id, subject, sender, recipient,
        date_str, snippet, body, label_ids
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        subject = excluded.subject,
        sender = excluded.sender,
        snippet = excluded.snippet,
        body = excluded.body,
        label_ids = excluded.label_ids
    """, (
        email_data["id"],
        account_email,
        email_data.get("threadId"),
        email_data.get("subject", ""),
        email_data.get("from", ""),
        email_data.get("to", ""),
        email_data.get("date", ""),
        email_data.get("snippet", ""),
        email_data.get("body", ""),
        json.dumps(email_data.get("labelIds", []))
    ))
    conn.commit()
    conn.close()

def update_email_analysis(email_id: str, analysis: dict, event_date: Optional[str] = None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE emails SET
        analyzed = 1,
        category = ?,
        priority = ?,
        summary = ?,
        suggested_reply = ?,
        tasks_json = ?,
        event_date = ?
    WHERE id = ?
    """, (
        analysis.get("category"),
        analysis.get("priority"),
        analysis.get("summary"),
        analysis.get("suggested_reply"),
        json.dumps(analysis.get("tasks", [])),
        event_date or analysis.get("event_date"),
        email_id
    ))
    conn.commit()
    conn.close()

def get_cached_emails(
    account_email: Optional[str] = None,
    category: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    
    query = "SELECT * FROM emails WHERE 1=1"
    params = []
    
    if account_email and account_email != "all":
        query += " AND account_email = ?"
        params.append(account_email)
        
    if category and category != "all":
        query += " AND category = ?"
        params.append(category)
        
    if search_query and search_query.strip():
        sq = f"%{search_query.strip()}%"
        query += " AND (subject LIKE ? OR sender LIKE ? OR snippet LIKE ? OR body LIKE ? OR summary LIKE ? OR tasks_json LIKE ?)"
        params.extend([sq, sq, sq, sq, sq, sq])
        
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    result = []
    for r in rows:
        d = dict(r)
        d["tasks"] = json.loads(d["tasks_json"]) if d.get("tasks_json") else []
        d["labelIds"] = json.loads(d["label_ids"]) if d.get("label_ids") else []
        result.append(d)
        
    conn.close()
    return result

def get_email_by_id(email_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM emails WHERE id = ?", (email_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["tasks"] = json.loads(d["tasks_json"]) if d.get("tasks_json") else []
    d["labelIds"] = json.loads(d["label_ids"]) if d.get("label_ids") else []
    return d
