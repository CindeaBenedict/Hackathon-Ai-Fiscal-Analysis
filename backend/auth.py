import hashlib
import os
import secrets
import sqlite3
import sys
from datetime import datetime


DB_PATH = os.getenv("AUTH_DB_PATH", "auth.db")


def _get_conn() -> sqlite3.Connection:
    global DB_PATH
    parent = os.path.dirname(DB_PATH)
    if parent:
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError:
            pass
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    except (sqlite3.OperationalError, OSError) as e:
        fallback = "/tmp/team28_auth.db"
        if os.path.normpath(DB_PATH) != os.path.normpath(fallback):
            print(f"Warning: DB not writable ({e}), using {fallback}", file=sys.stderr)
            DB_PATH = fallback
            return _get_conn()
        raise


def init_auth_db() -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_keys (
                key_name TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.commit()


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
    ).hex()


def register_user(username: str, password: str) -> None:
    salt = secrets.token_hex(16)
    hashed = _hash_password(password, salt)
    with _get_conn() as conn:
        conn.execute(
            "INSERT INTO users(username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
            (username, hashed, salt, datetime.utcnow().isoformat()),
        )
        conn.commit()


def login_user(username: str, password: str) -> str | None:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT id, password_hash, salt FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if row is None:
            return None
        hashed = _hash_password(password, row["salt"])
        if hashed != row["password_hash"]:
            return None

        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions(token, user_id, created_at) VALUES (?, ?, ?)",
            (token, row["id"], datetime.utcnow().isoformat()),
        )
        conn.commit()
        return token


def validate_token(token: str) -> str | None:
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT u.username
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        if row is None:
            return None
        return str(row["username"])


def get_api_key(key_name: str) -> str | None:
    """Get API key from DB (app-configured keys). Returns None if not set."""
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT value FROM api_keys WHERE key_name = ?",
            (key_name,),
        ).fetchone()
        return str(row["value"]).strip() if row and row["value"] else None


def set_api_key(key_name: str, value: str) -> None:
    """Store or clear an API key. Use empty string to remove."""
    with _get_conn() as conn:
        v = value.strip()
        if v:
            conn.execute(
                "INSERT INTO api_keys(key_name, value) VALUES (?, ?) ON CONFLICT(key_name) DO UPDATE SET value = ?",
                (key_name, v, v),
            )
        else:
            conn.execute("DELETE FROM api_keys WHERE key_name = ?", (key_name,))
        conn.commit()
