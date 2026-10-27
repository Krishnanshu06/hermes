import sqlite3
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from pathlib import Path
from app.core.config import settings

logger = logging.getLogger(__name__)

USE_POSTGRES = bool(settings.DATABASE_URL and settings.DATABASE_URL.startswith(("postgres://", "postgresql://")))

if USE_POSTGRES:
    import psycopg2
    from psycopg2.extras import RealDictCursor

def get_connection():
    if USE_POSTGRES:
        url = settings.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        # Ensure sslmode=require for cloud Supabase pooler
        if "sslmode=" not in url:
            delimiter = "&" if "?" in url else "?"
            url = f"{url}{delimiter}sslmode=require"
        conn = psycopg2.connect(url, cursor_factory=RealDictCursor)
        return conn
    else:
        conn = sqlite3.connect(settings.DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    try:
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
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                description TEXT DEFAULT '',
                color TEXT DEFAULT '#a1a1aa',
                is_system INTEGER DEFAULT 0
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
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
                is_starred INTEGER DEFAULT 0,
                is_interested INTEGER DEFAULT 0,
                priority TEXT,
                summary TEXT,
                suggested_reply TEXT,
                tasks_json TEXT,
                metadata_json TEXT,
                event_date TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_email);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_event_date ON emails(event_date);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_starred ON emails(is_starred);")
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
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                description TEXT DEFAULT '',
                color TEXT DEFAULT '#a1a1aa',
                is_system INTEGER DEFAULT 0
            )
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
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
                is_starred INTEGER DEFAULT 0,
                is_interested INTEGER DEFAULT 0,
                priority TEXT,
                summary TEXT,
                suggested_reply TEXT,
                tasks_json TEXT,
                metadata_json TEXT,
                event_date TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_email) REFERENCES accounts(email)
            )
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_email)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_event_date ON emails(event_date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_starred ON emails(is_starred)")

        conn.commit()
        conn.close()

        # Seed default categories & retention settings
        seed_defaults()
    except Exception as e:
        logger.error(f"Error initializing DB: {e}")

def seed_defaults():
    # Insert default categories if not present
    default_categories = [
        ("Internship/Job", "Internships & Jobs", "Employer correspondence, interview invitations, tech offers, rejections, recruiter emails, career applications", "#60a5fa", 1),
        ("Competition/Hackathon", "Competitions & Hackathons", "Hackathons, coding contests, Datathons, Devpost challenges, programming tournaments", "#fbbf24", 1),
        ("Event/Academic", "School & Academic", "University courses, professor lectures, campus seminars, academic schedule alerts, workshops", "#c084fc", 1),
        ("Action Required", "Action Required", "Urgent personal to-dos, bills to pay, contracts to sign, critical responses needed", "#f87171", 1),
        ("Promotion/Spam", "Promotions & Trash", "Store marketing, promotional flyers, generic newsletter sales, discounts", "#52525b", 1),
        ("FYI/General", "FYI & General", "Receipts, status updates, notifications that don't need immediate action", "#34d399", 1)
    ]
    
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"

    for cat in default_categories:
        cursor.execute(f"""
        INSERT INTO categories (id, label, description, color, is_system)
        VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
        ON CONFLICT(id) DO NOTHING
        """, cat)

    # Default retention: 30 days
    cursor.execute(f"""
    INSERT INTO settings (key, value)
    VALUES ({ph}, {ph})
    ON CONFLICT(key) DO NOTHING
    """, ("retention_days", "30"))

    conn.commit()
    conn.close()

# Auto-initialize
init_db()

# Account functions
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

# Category & Settings functions
def get_categories() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, label, description, color, is_system FROM categories ORDER BY is_system DESC, label ASC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def upsert_category(cat_id: str, label: str, description: str, color: str):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"""
    INSERT INTO categories (id, label, description, color, is_system)
    VALUES ({ph}, {ph}, {ph}, {ph}, 0)
    ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        description = excluded.description,
        color = excluded.color
    """, (cat_id, label, description, color))
    conn.commit()
    conn.close()

def delete_category(cat_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    # Reassign emails in this category to FYI/General
    cursor.execute(f"UPDATE emails SET category = 'FYI/General' WHERE category = {ph}", (cat_id,))
    cursor.execute(f"DELETE FROM categories WHERE id = {ph} AND is_system = 0", (cat_id,))
    conn.commit()
    conn.close()

def get_setting(key: str, default: str = "") -> str:
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"SELECT value FROM settings WHERE key = {ph}", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default

def set_setting(key: str, value: str):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"""
    INSERT INTO settings (key, value)
    VALUES ({ph}, {ph})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
    """, (key, value))
    conn.commit()
    conn.close()

# Email retention & deletion functions
def purge_old_unstarred_emails() -> int:
    """Deletes emails older than retention_days (default 30) unless starred."""
    try:
        retention_days = int(get_setting("retention_days", "30"))
        if retention_days <= 0:
            return 0  # 0 means never delete
            
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")

        conn = get_connection()
        cursor = conn.cursor()
        ph = "%s" if USE_POSTGRES else "?"

        cursor.execute(f"""
        DELETE FROM emails
        WHERE created_at < {ph} AND is_starred = 0
        """, (cutoff_str,))
        
        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()
        return deleted_count
    except Exception as e:
        logger.error(f"Error purging old emails: {e}")
        return 0

def delete_single_email(email_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"DELETE FROM emails WHERE id = {ph}", (email_id,))
    conn.commit()
    conn.close()

def clear_all_emails():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM emails")
    conn.commit()
    conn.close()

def delete_emails_by_category(category: str):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(f"DELETE FROM emails WHERE category = {ph}", (category,))
    conn.commit()
    conn.close()

def update_email_flags(email_id: str, is_starred: Optional[bool] = None, is_interested: Optional[bool] = None, category: Optional[str] = None):
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"

    updates = []
    params = []

    if is_starred is not None:
        updates.append(f"is_starred = {ph}")
        params.append(1 if is_starred else 0)

    if is_interested is not None:
        updates.append(f"is_interested = {ph}")
        params.append(1 if is_interested else 0)

    if category is not None:
        updates.append(f"category = {ph}")
        params.append(category)

    if not updates:
        conn.close()
        return

    params.append(email_id)
    query = f"UPDATE emails SET {', '.join(updates)} WHERE id = {ph}"
    cursor.execute(query, tuple(params))
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
    meta_j = json.dumps({
        "key_details": analysis.get("key_details", []),
        "important_links": analysis.get("important_links", []),
        "important_dates": analysis.get("important_dates", [])
    }) if analysis else None
    ev_date = analysis.get("event_date") if analysis else None

    query = f"""
    INSERT INTO emails (
        id, account_email, thread_id, subject, sender, recipient,
        date_str, snippet, body, label_ids,
        analyzed, category, priority, summary, suggested_reply, tasks_json, metadata_json, event_date
    ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
    ON CONFLICT(id) DO UPDATE SET
        subject = excluded.subject,
        sender = excluded.sender,
        snippet = excluded.snippet,
        body = excluded.body,
        label_ids = excluded.label_ids,
        analyzed = CASE WHEN excluded.analyzed = 1 THEN 1 ELSE emails.analyzed END,
        category = COALESCE(emails.category, excluded.category),
        priority = COALESCE(excluded.priority, emails.priority),
        summary = COALESCE(excluded.summary, emails.summary),
        suggested_reply = COALESCE(excluded.suggested_reply, emails.suggested_reply),
        tasks_json = COALESCE(excluded.tasks_json, emails.tasks_json),
        metadata_json = COALESCE(excluded.metadata_json, emails.metadata_json),
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
        meta_j,
        ev_date
    )
    cursor.execute(query, params)
    conn.commit()
    conn.close()

def get_cached_emails(
    account_email: Optional[str] = None,
    category: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = 300
) -> List[Dict[str, Any]]:
    # Run maintenance purge on read
    purge_old_unstarred_emails()

    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    
    query = "SELECT * FROM emails WHERE 1=1"
    params = []
    
    if account_email and account_email != "all":
        query += f" AND account_email = {ph}"
        params.append(account_email)
        
    if category and category != "all":
        if category == "Starred":
            query += f" AND is_starred = 1"
        elif category == "Interested":
            query += f" AND is_interested = 1"
        else:
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
        meta = json.loads(d["metadata_json"]) if d.get("metadata_json") else {}
        d["key_details"] = meta.get("key_details", [])
        d["important_links"] = meta.get("important_links", [])
        d["important_dates"] = meta.get("important_dates", [])
        d["labelIds"] = json.loads(d["label_ids"]) if d.get("label_ids") else []
        d["is_starred"] = bool(d.get("is_starred"))
        d["is_interested"] = bool(d.get("is_interested"))
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
    meta = json.loads(d["metadata_json"]) if d.get("metadata_json") else {}
    d["key_details"] = meta.get("key_details", [])
    d["important_links"] = meta.get("important_links", [])
    d["important_dates"] = meta.get("important_dates", [])
    d["labelIds"] = json.loads(d["label_ids"]) if d.get("label_ids") else []
    d["is_starred"] = bool(d.get("is_starred"))
    d["is_interested"] = bool(d.get("is_interested"))
    return d
