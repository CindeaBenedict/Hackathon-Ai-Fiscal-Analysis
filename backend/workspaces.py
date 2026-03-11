"""Shared workspaces for collaborative simulation config and results."""
import json
import os
import secrets
import sqlite3
import string
from datetime import datetime
from db_path import resolve_db_path

DB_PATH = resolve_db_path()
WORKSPACES_SCHEMA_VERSION = 2


def _get_conn() -> sqlite3.Connection:
    parent = os.path.dirname(DB_PATH)
    if parent:
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError:
            pass
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _invite_code() -> str:
    """Generate a short uppercase alphanumeric invite code."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


def init_workspaces_db() -> None:
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
            CREATE TABLE IF NOT EXISTS workspaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invite_code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_by_user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(created_by_user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workspace_members (
                workspace_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                joined_at TEXT NOT NULL,
                PRIMARY KEY (workspace_id, user_id),
                FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workspace_state (
                workspace_id INTEGER PRIMARY KEY,
                config_json TEXT,
                results_json TEXT,
                updated_at TEXT NOT NULL,
                updated_by_username TEXT,
                FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
            )
            """
        )
        columns = {
            str(r["name"]) for r in conn.execute("PRAGMA table_info(workspaces)").fetchall()
        }
        if "description" not in columns:
            conn.execute("ALTER TABLE workspaces ADD COLUMN description TEXT")
        now = datetime.utcnow().isoformat()
        conn.execute(
            """
            INSERT INTO schema_versions(component, version, updated_at)
            VALUES ('workspaces', ?, ?)
            ON CONFLICT(component) DO UPDATE SET
                version = excluded.version,
                updated_at = excluded.updated_at
            """,
            (WORKSPACES_SCHEMA_VERSION, now),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO schema_version_history(component, version, applied_at)
            VALUES ('workspaces', ?, ?)
            """,
            (WORKSPACES_SCHEMA_VERSION, now),
        )
        conn.commit()


def create_workspace(user_id: int, name: str = "Shared Workspace", description: str | None = None) -> dict:
    """Create a workspace and add creator as owner. Returns workspace dict with id, invite_code, name."""
    code = _invite_code()
    now = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO workspaces(invite_code, name, description, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (code, name, description or "", user_id, now),
        )
        workspace_id = cur.lastrowid
        conn.execute(
            "INSERT INTO workspace_members(workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
            (workspace_id, user_id, "owner", now),
        )
        conn.commit()
    return {"id": workspace_id, "invite_code": code, "name": name, "description": description or ""}


def join_workspace(user_id: int, invite_code: str) -> dict | None:
    """Add user to workspace by invite code. Returns workspace dict or None if not found/already member."""
    code = invite_code.strip().upper()
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT id, name, description FROM workspaces WHERE invite_code = ?",
            (code,),
        ).fetchone()
        if row is None:
            return None
        workspace_id = int(row["id"])
        name = str(row["name"])
        description = str(row["description"]) if row["description"] else ""
        existing = conn.execute(
            "SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
            (workspace_id, user_id),
        ).fetchone()
        if existing:
            return {"id": workspace_id, "invite_code": code, "name": name, "description": description}
        now = datetime.utcnow().isoformat()
        conn.execute(
            "INSERT INTO workspace_members(workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
            (workspace_id, user_id, "member", now),
        )
        conn.commit()
    return {"id": workspace_id, "invite_code": code, "name": name, "description": description}


def list_workspaces_for_user(user_id: int) -> list[dict]:
    """Return list of workspaces the user is a member of."""
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT w.id, w.invite_code, w.name, w.description
            FROM workspaces w
            JOIN workspace_members m ON m.workspace_id = w.id
            WHERE m.user_id = ?
            ORDER BY w.id
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": int(r["id"]),
            "invite_code": str(r["invite_code"]),
            "name": str(r["name"]),
            "description": str(r["description"]) if r["description"] else "",
        }
        for r in rows
    ]


def is_member(workspace_id: int, user_id: int) -> bool:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
            (workspace_id, user_id),
        ).fetchone()
    return row is not None


def get_workspace(workspace_id: int, user_id: int) -> dict | None:
    """Get workspace by id if user is member. Includes state if any."""
    if not is_member(workspace_id, user_id):
        return None
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT id, invite_code, name, description FROM workspaces WHERE id = ?",
            (workspace_id,),
        ).fetchone()
        if row is None:
            return None
        out = {
            "id": int(row["id"]),
            "invite_code": str(row["invite_code"]),
            "name": str(row["name"]),
            "description": str(row["description"]) if row["description"] else "",
        }
        state_row = conn.execute(
            "SELECT config_json, results_json, updated_at, updated_by_username FROM workspace_state WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()
        if state_row and (state_row["config_json"] or state_row["results_json"]):
            out["state"] = {
                "config": json.loads(state_row["config_json"]) if state_row["config_json"] else None,
                "results": json.loads(state_row["results_json"]) if state_row["results_json"] else None,
                "updated_at": state_row["updated_at"],
                "updated_by": state_row["updated_by_username"],
            }
        else:
            out["state"] = None
    return out


def set_workspace_state(workspace_id: int, user_id: int, username: str, config: dict | None, results: dict | None) -> bool:
    """Update workspace state. Returns True if user is member."""
    if not is_member(workspace_id, user_id):
        return False
    now = datetime.utcnow().isoformat()
    config_json = json.dumps(config) if config else None
    results_json = json.dumps(results) if results else None
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO workspace_state(workspace_id, config_json, results_json, updated_at, updated_by_username)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(workspace_id) DO UPDATE SET
                config_json = excluded.config_json,
                results_json = excluded.results_json,
                updated_at = excluded.updated_at,
                updated_by_username = excluded.updated_by_username
            """,
            (workspace_id, config_json, results_json, now, username),
        )
        conn.commit()
    return True


def get_workspace_members(workspace_id: int, user_id: int) -> list[dict] | None:
    """Return list of {username, role} if caller is member."""
    if not is_member(workspace_id, user_id):
        return None
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT u.username, m.role
            FROM workspace_members m
            JOIN users u ON u.id = m.user_id
            WHERE m.workspace_id = ?
            ORDER BY m.role DESC, u.username
            """,
            (workspace_id,),
        ).fetchall()
    return [{"username": str(r["username"]), "role": str(r["role"])} for r in rows]


def update_workspace_description(workspace_id: int, user_id: int, description: str | None) -> dict | None:
    """Update workspace description. Returns lightweight workspace dict, or None if not member/not found."""
    if not is_member(workspace_id, user_id):
        return None
    with _get_conn() as conn:
        cur = conn.execute(
            "UPDATE workspaces SET description = ? WHERE id = ?",
            (description or "", workspace_id),
        )
        if cur.rowcount <= 0:
            return None
        row = conn.execute(
            "SELECT id, invite_code, name, description FROM workspaces WHERE id = ?",
            (workspace_id,),
        ).fetchone()
        conn.commit()
    if row is None:
        return None
    return {
        "id": int(row["id"]),
        "invite_code": str(row["invite_code"]),
        "name": str(row["name"]),
        "description": str(row["description"]) if row["description"] else "",
    }
