import sqlite3
import json
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
from app.core.config import settings

logger = logging.getLogger(__name__)

# Check if PostgreSQL connection URL (e.g. Supabase) is provided
USE_POSTGRES = bool(settings.DATABASE_URL and settings.DATABASE_URL.startswith(("postgres://", "postgresql://")))

if USE_POSTGRES:
    import psycopg2
    from psycopg2.extras import RealDictCursor

def get_connection():
    if USE_POSTGRES:
        # Normalize postgres:// to postgresql:// if needed
        url = settings.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        conn = psycopg2.connect(url, cursor_factory=RealDictCursor)
        return conn
    else:
        conn = sqlite3.connect(settings.DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    if USE_POSTGRES:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            email TEXT PRIMARY KEY,
            name TEXT,
            picture TEXT,
            access_token TEXT,
            refresh_token TEXT,
            token_uri TEXT,
            scopes TEXT,
            last_history_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_synced TIMESTAMP
        );
        """)
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS emails (
            id TEXT PRIMARY KEY,
            account_email TEXT NOT NULL REFERENCES accounts(email) ON DELETE CASCADE,
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_email);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_event_date ON emails(event_date);")
    else:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            email TEXT PRIMARY KEY,
            name TEXT,
            picture TEXT,
            access_token TEXT,
            refresh_token TEXT,
            token_uri TEXT,
            scopes TEXT,
            last_history_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_synced TIMESTAMP
        )
        """)
        
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
        
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_email)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_event_date ON emails(event_date)")
        
    conn.commit()
    conn.close()

init_db()

def upsert_account(email: str, name: str, picture: str, token_info: dict):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    
    query = f"""
    INSERT INTO accounts (email, name, picture, access_token, refresh_token, token_uri, scopes, last_synced)
    VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        picture = excluded.picture,
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, accounts.refresh_token),
        token_uri = excluded.token_uri,
        scopes = excluded.scopes,
        last_synced = CURRENT_TIMESTAMP
    """
    params = (
        email,
        name,
        picture,
        token_info.get("access_token"),
        token_info.get("refresh_token"),
        token_info.get("token_uri"),
        json.dumps(token_info.get("scopes", []))
    )
    cursor.execute(query, params)
    conn.commit()
    conn.close()

def update_account_sync_time(email: str):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"UPDATE accounts SET last_synced = CURRENT_TIMESTAMP WHERE email = {ph}", (email,))
    conn.commit()
    conn.close()

def get_all_accounts() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT email, name, picture, created_at, last_synced FROM accounts ORDER BY created_at ASC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def get_account(email: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"SELECT * FROM accounts WHERE email = {ph}", (email,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_account(email: str):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"DELETE FROM emails WHERE account_email = {ph}", (email,))
    cursor.execute(f"DELETE FROM accounts WHERE email = {ph}", (email,))
    conn.commit()
    conn.close()

def save_email(email_data: dict, account_email: str, analysis: Optional[dict] = None):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    
    analyzed_val = 1 if analysis else 0
    cat = analysis.get("category") if analysis else None
    prio = analysis.get("priority") if analysis else None
    summ = analysis.get("summary") if analysis else None
    sug_reply = analysis.get("suggested_reply") if analysis else None
    tasks_j = json.dumps(analysis.get("tasks", [])) if analysis else None
    ev_date = analysis.get("event_date") if analysis else None

    query = f"""
    INSERT INTO emails (
        id, account_email, thread_id, subject, sender, recipient,
        date_str, snippet, body, label_ids,
        analyzed, category, priority, summary, suggested_reply, tasks_json, event_date
    ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
    ON CONFLICT(id) DO UPDATE SET
        subject = excluded.subject,
        sender = excluded.sender,
        snippet = excluded.snippet,
        body = excluded.body,
        label_ids = excluded.label_ids,
        analyzed = CASE WHEN excluded.analyzed = 1 THEN 1 ELSE emails.analyzed END,
        category = COALESCE(excluded.category, emails.category),
        priority = COALESCE(excluded.priority, emails.priority),
        summary = COALESCE(excluded.summary, emails.summary),
        suggested_reply = COALESCE(excluded.suggested_reply, emails.suggested_reply),
        tasks_json = COALESCE(excluded.tasks_json, emails.tasks_json),
        event_date = COALESCE(excluded.event_date, emails.event_date)
    """
    params = (
        email_data["id"],
        account_email,
        email_data.get("threadId"),
        email_data.get("subject", ""),
        email_data.get("from", ""),
        email_data.get("to", ""),
        email_data.get("date", ""),
        email_data.get("snippet", ""),
        email_data.get("body", ""),
        json.dumps(email_data.get("labelIds", [])),
        analyzed_val,
        cat,
        prio,
        summ,
        sug_reply,
        tasks_j,
        ev_date
    )
    cursor.execute(query, params)
    conn.commit()
    conn.close()

def get_cached_emails(
    account_email: Optional[str] = None,
    category: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = 200
) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    
    query = "SELECT * FROM emails WHERE 1=1"
    params = []
    
    if account_email and account_email != "all":
        query += f" AND account_email = {ph}"
        params.append(account_email)
        
    if category and category != "all":
        query += f" AND category = {ph}"
        params.append(category)
        
    if search_query and search_query.strip():
        sq = f"%{search_query.strip()}%"
        like_op = "ILIKE" if USE_POSTGRES else "LIKE"
        query += f" AND (subject {like_op} {ph} OR sender {like_op} {ph} OR snippet {like_op} {ph} OR body {like_op} {ph} OR summary {like_op} {ph} OR tasks_json {like_op} {ph})"
        params.extend([sq, sq, sq, sq, sq, sq])
        
    query += f" ORDER BY created_at DESC LIMIT {ph}"
    params.append(limit)
    
    cursor.execute(query, tuple(params))
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
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"SELECT * FROM emails WHERE id = {ph}", (email_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["tasks"] = json.loads(d["tasks_json"]) if d.get("tasks_json") else []
    d["labelIds"] = json.loads(d["label_ids"]) if d.get("label_ids") else []
    return d
