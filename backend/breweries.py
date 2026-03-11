"""Breweries: multi-location support, performance metrics, and comparison data."""
import os
import sqlite3
from datetime import datetime
from db_path import resolve_db_path

DB_PATH = resolve_db_path()
BREWERIES_SCHEMA_VERSION = 2


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


def init_breweries_db() -> None:
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
            CREATE TABLE IF NOT EXISTS breweries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                address TEXT,
                description TEXT,
                avg_monthly_revenue REAL NOT NULL DEFAULT 0,
                quality_score REAL NOT NULL DEFAULT 50,
                efficiency_score REAL NOT NULL DEFAULT 50,
                popularity_score REAL NOT NULL DEFAULT 50,
                sustainability_score REAL NOT NULL DEFAULT 50,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        columns = {
            str(r["name"]) for r in conn.execute("PRAGMA table_info(breweries)").fetchall()
        }
        if "description" not in columns:
            conn.execute("ALTER TABLE breweries ADD COLUMN description TEXT")
        if "avg_monthly_revenue" not in columns:
            conn.execute("ALTER TABLE breweries ADD COLUMN avg_monthly_revenue REAL NOT NULL DEFAULT 0")
        if "quality_score" not in columns:
            conn.execute("ALTER TABLE breweries ADD COLUMN quality_score REAL NOT NULL DEFAULT 50")
        if "efficiency_score" not in columns:
            conn.execute("ALTER TABLE breweries ADD COLUMN efficiency_score REAL NOT NULL DEFAULT 50")
        if "popularity_score" not in columns:
            conn.execute("ALTER TABLE breweries ADD COLUMN popularity_score REAL NOT NULL DEFAULT 50")
        if "sustainability_score" not in columns:
            conn.execute("ALTER TABLE breweries ADD COLUMN sustainability_score REAL NOT NULL DEFAULT 50")
        now = datetime.utcnow().isoformat()
        conn.execute(
            """
            INSERT INTO schema_versions(component, version, updated_at)
            VALUES ('breweries', ?, ?)
            ON CONFLICT(component) DO UPDATE SET
                version = excluded.version,
                updated_at = excluded.updated_at
            """,
            (BREWERIES_SCHEMA_VERSION, now),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO schema_version_history(component, version, applied_at)
            VALUES ('breweries', ?, ?)
            """,
            (BREWERIES_SCHEMA_VERSION, now),
        )
        conn.commit()


def create_brewery(
    user_id: int,
    name: str,
    lat: float,
    lng: float,
    address: str | None = None,
    description: str | None = None,
    avg_monthly_revenue: float = 0.0,
    quality_score: float = 50.0,
    efficiency_score: float = 50.0,
    popularity_score: float = 50.0,
    sustainability_score: float = 50.0,
) -> dict:
    """Create a brewery with map location and performance metrics."""
    now = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO breweries(
                user_id, name, lat, lng, address, description,
                avg_monthly_revenue, quality_score, efficiency_score, popularity_score, sustainability_score,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                name.strip() or "Unnamed Brewery",
                lat,
                lng,
                address or "",
                description or "",
                avg_monthly_revenue,
                quality_score,
                efficiency_score,
                popularity_score,
                sustainability_score,
                now,
            ),
        )
        brewery_id = cur.lastrowid
        conn.commit()
    return {
        "id": brewery_id,
        "name": name.strip() or "Unnamed Brewery",
        "lat": lat,
        "lng": lng,
        "address": address or "",
        "description": description or "",
        "avg_monthly_revenue": avg_monthly_revenue,
        "quality_score": quality_score,
        "efficiency_score": efficiency_score,
        "popularity_score": popularity_score,
        "sustainability_score": sustainability_score,
        "created_at": now,
    }


def list_breweries_for_user(user_id: int) -> list[dict]:
    """Return all breweries for the user."""
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, name, lat, lng, address, description,
                   avg_monthly_revenue, quality_score, efficiency_score, popularity_score, sustainability_score,
                   created_at
            FROM breweries
            WHERE user_id = ?
            ORDER BY name, id
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": int(r["id"]),
            "name": str(r["name"]),
            "lat": float(r["lat"]),
            "lng": float(r["lng"]),
            "address": str(r["address"]) if r["address"] else "",
            "description": str(r["description"]) if r["description"] else "",
            "avg_monthly_revenue": float(r["avg_monthly_revenue"]),
            "quality_score": float(r["quality_score"]),
            "efficiency_score": float(r["efficiency_score"]),
            "popularity_score": float(r["popularity_score"]),
            "sustainability_score": float(r["sustainability_score"]),
            "created_at": str(r["created_at"]),
        }
        for r in rows
    ]


def get_brewery(brewery_id: int, user_id: int) -> dict | None:
    """Get a single brewery by id if it belongs to the user."""
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, name, lat, lng, address, description,
                   avg_monthly_revenue, quality_score, efficiency_score, popularity_score, sustainability_score,
                   created_at
            FROM breweries
            WHERE id = ? AND user_id = ?
            """,
            (brewery_id, user_id),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": int(row["id"]),
        "name": str(row["name"]),
        "lat": float(row["lat"]),
        "lng": float(row["lng"]),
        "address": str(row["address"]) if row["address"] else "",
        "description": str(row["description"]) if row["description"] else "",
        "avg_monthly_revenue": float(row["avg_monthly_revenue"]),
        "quality_score": float(row["quality_score"]),
        "efficiency_score": float(row["efficiency_score"]),
        "popularity_score": float(row["popularity_score"]),
        "sustainability_score": float(row["sustainability_score"]),
        "created_at": str(row["created_at"]),
    }


def update_brewery(
    brewery_id: int,
    user_id: int,
    name: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    address: str | None = None,
    description: str | None = None,
    avg_monthly_revenue: float | None = None,
    quality_score: float | None = None,
    efficiency_score: float | None = None,
    popularity_score: float | None = None,
    sustainability_score: float | None = None,
) -> dict | None:
    """Update brewery. Returns updated dict or None if not found."""
    existing = get_brewery(brewery_id, user_id)
    if existing is None:
        return None
    new_name = name.strip() if name is not None else existing["name"]
    new_lat = lat if lat is not None else existing["lat"]
    new_lng = lng if lng is not None else existing["lng"]
    new_address = address if address is not None else existing["address"]
    new_description = description if description is not None else existing["description"]
    new_avg_monthly_revenue = (
        avg_monthly_revenue if avg_monthly_revenue is not None else existing["avg_monthly_revenue"]
    )
    new_quality_score = quality_score if quality_score is not None else existing["quality_score"]
    new_efficiency_score = efficiency_score if efficiency_score is not None else existing["efficiency_score"]
    new_popularity_score = popularity_score if popularity_score is not None else existing["popularity_score"]
    new_sustainability_score = (
        sustainability_score if sustainability_score is not None else existing["sustainability_score"]
    )
    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE breweries
            SET name = ?, lat = ?, lng = ?, address = ?, description = ?,
                avg_monthly_revenue = ?, quality_score = ?, efficiency_score = ?, popularity_score = ?, sustainability_score = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                new_name or "Unnamed Brewery",
                new_lat,
                new_lng,
                new_address or "",
                new_description or "",
                new_avg_monthly_revenue,
                new_quality_score,
                new_efficiency_score,
                new_popularity_score,
                new_sustainability_score,
                brewery_id,
                user_id,
            ),
        )
        conn.commit()
    return {
        "id": brewery_id,
        "name": new_name or "Unnamed Brewery",
        "lat": new_lat,
        "lng": new_lng,
        "address": new_address or "",
        "description": new_description or "",
        "avg_monthly_revenue": new_avg_monthly_revenue,
        "quality_score": new_quality_score,
        "efficiency_score": new_efficiency_score,
        "popularity_score": new_popularity_score,
        "sustainability_score": new_sustainability_score,
        "created_at": existing["created_at"],
    }


def delete_brewery(brewery_id: int, user_id: int) -> bool:
    """Delete brewery if it belongs to the user. Returns True if deleted."""
    with _get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM breweries WHERE id = ? AND user_id = ?",
            (brewery_id, user_id),
        )
        conn.commit()
    return cur.rowcount > 0
