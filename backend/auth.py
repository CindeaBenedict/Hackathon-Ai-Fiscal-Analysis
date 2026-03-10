import hashlib
import os
import secrets
import sqlite3
from datetime import datetime


DB_PATH = os.getenv("AUTH_DB_PATH", "auth.db")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
