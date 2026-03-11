import hashlib
import os
import secrets
import sqlite3
import sys
from datetime import datetime, timedelta
import re
from db_path import migrate_legacy_db_if_needed, resolve_db_path


DB_PATH = resolve_db_path()
SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "720"))
RESET_TOKEN_TTL_MINUTES = int(os.getenv("RESET_TOKEN_TTL_MINUTES", "30"))
AUTH_SCHEMA_VERSION = 3
ALLOW_EPHEMERAL_DB_FALLBACK = os.getenv("ALLOW_EPHEMERAL_DB_FALLBACK", "0").strip().lower() in {"1", "true", "yes"}


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
        if ALLOW_EPHEMERAL_DB_FALLBACK:
            fallback = "/tmp/team28_auth.db"
            if os.path.normpath(DB_PATH) != os.path.normpath(fallback):
                print(
                    f"Warning: DB not writable ({e}), using ephemeral fallback {fallback}",
                    file=sys.stderr,
                )
                DB_PATH = fallback
                return _get_conn()
        print(
            f"Fatal DB error for {DB_PATH}: {e}. "
            "Refusing ephemeral fallback to avoid data loss. "
            "Set AUTH_DB_PATH to persistent storage (or set ALLOW_EPHEMERAL_DB_FALLBACK=1 explicitly).",
            file=sys.stderr,
        )
        raise


def init_auth_db() -> None:
    migrate_legacy_db_if_needed(DB_PATH)
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_versions (
                component TEXT PRIMARY KEY,
                version INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_version_history (
                component TEXT NOT NULL,
                version INTEGER NOT NULL,
                applied_at TEXT NOT NULL,
                PRIMARY KEY(component, version)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        user_cols = {
            str(r["name"]) for r in conn.execute("PRAGMA table_info(users)").fetchall()
        }
        if "email" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
            ON users(email)
            WHERE email IS NOT NULL AND email <> ''
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT,
                revoked_at TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        session_cols = {
            str(r["name"]) for r in conn.execute("PRAGMA table_info(sessions)").fetchall()
        }
        if "expires_at" not in session_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN expires_at TEXT")
        if "revoked_at" not in session_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN revoked_at TEXT")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_keys (
                key_name TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS password_resets (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        now = datetime.utcnow().isoformat()
        conn.execute(
            """
            INSERT INTO schema_versions(component, version, updated_at)
            VALUES ('auth', ?, ?)
            ON CONFLICT(component) DO UPDATE SET
                version = excluded.version,
                updated_at = excluded.updated_at
            """,
            (AUTH_SCHEMA_VERSION, now),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO schema_version_history(component, version, applied_at)
            VALUES ('auth', ?, ?)
            """,
            (AUTH_SCHEMA_VERSION, now),
        )
        conn.commit()


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
    ).hex()


def _is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


def validate_password_strength(password: str) -> str | None:
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Z]", password):
        return "Password must include at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password must include at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return "Password must include at least one number."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must include at least one special character."
    return None


def register_user(username: str, password: str, email: str | None = None) -> None:
    email_value = (email or "").strip().lower()
    if email_value and not _is_valid_email(email_value):
        raise ValueError("Invalid email format.")
    password_error = validate_password_strength(password)
    if password_error:
        raise ValueError(password_error)
    salt = secrets.token_hex(16)
    hashed = _hash_password(password, salt)
    with _get_conn() as conn:
        conn.execute(
            "INSERT INTO users(username, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
            (username, email_value or None, hashed, salt, datetime.utcnow().isoformat()),
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
        now = datetime.utcnow()
        expires_at = (now + timedelta(hours=SESSION_TTL_HOURS)).isoformat()
        conn.execute(
            "INSERT INTO sessions(token, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
            (token, row["id"], now.isoformat(), expires_at),
        )
        # Cleanup old expired/revoked sessions for this user.
        conn.execute(
            """
            DELETE FROM sessions
            WHERE user_id = ?
              AND (
                (expires_at IS NOT NULL AND expires_at <= ?)
                OR revoked_at IS NOT NULL
              )
            """,
            (row["id"], now.isoformat()),
        )
        conn.commit()
        return token


def validate_token(token: str) -> str | None:
    now_iso = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT u.username
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
              AND (s.revoked_at IS NULL)
              AND (s.expires_at IS NULL OR s.expires_at > ?)
            """,
            (token, now_iso),
        ).fetchone()
        if row is None:
            return None
        return str(row["username"])


def get_user_from_token(token: str) -> tuple[int | None, str | None]:
    """Return (user_id, username) for the given session token, or (None, None)."""
    now_iso = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.username
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
              AND (s.revoked_at IS NULL)
              AND (s.expires_at IS NULL OR s.expires_at > ?)
            """,
            (token, now_iso),
        ).fetchone()
        if row is None:
            return (None, None)
        return (int(row["id"]), str(row["username"]))


def logout_user(token: str) -> None:
    """Revoke a session token."""
    with _get_conn() as conn:
        conn.execute(
            "UPDATE sessions SET revoked_at = ? WHERE token = ?",
            (datetime.utcnow().isoformat(), token),
        )
        conn.commit()


def create_password_reset(username: str | None = None, email: str | None = None) -> tuple[str | None, int]:
    username_value = (username or "").strip()
    email_value = (email or "").strip().lower()
    if not username_value and not email_value:
        return (None, RESET_TOKEN_TTL_MINUTES)

    with _get_conn() as conn:
        clauses = []
        params: list[object] = []
        if username_value:
            clauses.append("username = ?")
            params.append(username_value)
        if email_value:
            clauses.append("email = ?")
            params.append(email_value)
        row = conn.execute(
            f"SELECT id FROM users WHERE {' OR '.join(clauses)} LIMIT 1",
            tuple(params),
        ).fetchone()
        if row is None:
            return (None, RESET_TOKEN_TTL_MINUTES)
        user_id = int(row["id"])
        now = datetime.utcnow()
        expires_at = (now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)).isoformat()
        token = secrets.token_urlsafe(24)
        conn.execute(
            """
            INSERT INTO password_resets(token, user_id, created_at, expires_at, used_at)
            VALUES (?, ?, ?, ?, NULL)
            """,
            (token, user_id, now.isoformat(), expires_at),
        )
        conn.execute(
            """
            DELETE FROM password_resets
            WHERE user_id = ?
              AND (used_at IS NOT NULL OR expires_at <= ?)
            """,
            (user_id, now.isoformat()),
        )
        conn.commit()
        return (token, RESET_TOKEN_TTL_MINUTES)


def reset_password_with_token(reset_token: str, new_password: str) -> bool:
    password_error = validate_password_strength(new_password)
    if password_error:
        raise ValueError(password_error)
    now_iso = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT token, user_id
            FROM password_resets
            WHERE token = ?
              AND used_at IS NULL
              AND expires_at > ?
            """,
            (reset_token, now_iso),
        ).fetchone()
        if row is None:
            return False
        user_id = int(row["user_id"])
        salt = secrets.token_hex(16)
        hashed = _hash_password(new_password, salt)
        conn.execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
            (hashed, salt, user_id),
        )
        conn.execute(
            "UPDATE password_resets SET used_at = ? WHERE token = ?",
            (now_iso, reset_token),
        )
        conn.execute(
            "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
            (now_iso, user_id),
        )
        conn.commit()
    return True


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
