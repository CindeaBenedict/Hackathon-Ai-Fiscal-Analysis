"""Suppliers: sources for bottles, caps, ingredients, water, and fuel."""
import os
import sqlite3
from datetime import datetime
from db_path import resolve_db_path

DB_PATH = resolve_db_path()
SUPPLIERS_SCHEMA_VERSION = 1


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


def init_suppliers_db() -> None:
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
            CREATE TABLE IF NOT EXISTS suppliers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                address TEXT,
                unit_price REAL NOT NULL DEFAULT 0,
                shipping_cost_per_km REAL NOT NULL DEFAULT 0,
                lead_time_days INTEGER NOT NULL DEFAULT 3,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        now = datetime.utcnow().isoformat()
        conn.execute(
            """
            INSERT INTO schema_versions(component, version, updated_at)
            VALUES ('suppliers', ?, ?)
            ON CONFLICT(component) DO UPDATE SET
                version = excluded.version,
                updated_at = excluded.updated_at
            """,
            (SUPPLIERS_SCHEMA_VERSION, now),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO schema_version_history(component, version, applied_at)
            VALUES ('suppliers', ?, ?)
            """,
            (SUPPLIERS_SCHEMA_VERSION, now),
        )
        conn.commit()


def create_supplier(
    user_id: int,
    name: str,
    category: str,
    lat: float,
    lng: float,
    address: str | None = None,
    unit_price: float = 0.0,
    shipping_cost_per_km: float = 0.0,
    lead_time_days: int = 3,
) -> dict:
    now = datetime.utcnow().isoformat()
    with _get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO suppliers(
                user_id, name, category, lat, lng, address,
                unit_price, shipping_cost_per_km, lead_time_days, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                name.strip() or "Unnamed Supplier",
                category.strip().lower() or "other",
                lat,
                lng,
                address or "",
                unit_price,
                shipping_cost_per_km,
                lead_time_days,
                now,
            ),
        )
        supplier_id = cur.lastrowid
        conn.commit()
    return {
        "id": supplier_id,
        "name": name.strip() or "Unnamed Supplier",
        "category": category.strip().lower() or "other",
        "lat": lat,
        "lng": lng,
        "address": address or "",
        "unit_price": unit_price,
        "shipping_cost_per_km": shipping_cost_per_km,
        "lead_time_days": lead_time_days,
        "created_at": now,
    }


def list_suppliers_for_user(user_id: int) -> list[dict]:
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, name, category, lat, lng, address, unit_price, shipping_cost_per_km, lead_time_days, created_at
            FROM suppliers
            WHERE user_id = ?
            ORDER BY category, name, id
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": int(r["id"]),
            "name": str(r["name"]),
            "category": str(r["category"]),
            "lat": float(r["lat"]),
            "lng": float(r["lng"]),
            "address": str(r["address"]) if r["address"] else "",
            "unit_price": float(r["unit_price"]),
            "shipping_cost_per_km": float(r["shipping_cost_per_km"]),
            "lead_time_days": int(r["lead_time_days"]),
            "created_at": str(r["created_at"]),
        }
        for r in rows
    ]


def get_supplier(supplier_id: int, user_id: int) -> dict | None:
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, name, category, lat, lng, address, unit_price, shipping_cost_per_km, lead_time_days, created_at
            FROM suppliers
            WHERE id = ? AND user_id = ?
            """,
            (supplier_id, user_id),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": int(row["id"]),
        "name": str(row["name"]),
        "category": str(row["category"]),
        "lat": float(row["lat"]),
        "lng": float(row["lng"]),
        "address": str(row["address"]) if row["address"] else "",
        "unit_price": float(row["unit_price"]),
        "shipping_cost_per_km": float(row["shipping_cost_per_km"]),
        "lead_time_days": int(row["lead_time_days"]),
        "created_at": str(row["created_at"]),
    }


def update_supplier(
    supplier_id: int,
    user_id: int,
    name: str | None = None,
    category: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    address: str | None = None,
    unit_price: float | None = None,
    shipping_cost_per_km: float | None = None,
    lead_time_days: int | None = None,
) -> dict | None:
    existing = get_supplier(supplier_id, user_id)
    if existing is None:
        return None
    new_name = name.strip() if name is not None else existing["name"]
    new_category = (category.strip().lower() if category is not None else existing["category"]) or "other"
    new_lat = lat if lat is not None else existing["lat"]
    new_lng = lng if lng is not None else existing["lng"]
    new_address = address if address is not None else existing["address"]
    new_unit_price = unit_price if unit_price is not None else existing["unit_price"]
    new_ship = shipping_cost_per_km if shipping_cost_per_km is not None else existing["shipping_cost_per_km"]
    new_lead = lead_time_days if lead_time_days is not None else existing["lead_time_days"]
    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE suppliers
            SET name = ?, category = ?, lat = ?, lng = ?, address = ?,
                unit_price = ?, shipping_cost_per_km = ?, lead_time_days = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                new_name or "Unnamed Supplier",
                new_category,
                new_lat,
                new_lng,
                new_address or "",
                new_unit_price,
                new_ship,
                new_lead,
                supplier_id,
                user_id,
            ),
        )
        conn.commit()
    return {
        "id": supplier_id,
        "name": new_name or "Unnamed Supplier",
        "category": new_category,
        "lat": new_lat,
        "lng": new_lng,
        "address": new_address or "",
        "unit_price": new_unit_price,
        "shipping_cost_per_km": new_ship,
        "lead_time_days": new_lead,
        "created_at": existing["created_at"],
    }


def delete_supplier(supplier_id: int, user_id: int) -> bool:
    with _get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM suppliers WHERE id = ? AND user_id = ?",
            (supplier_id, user_id),
        )
        conn.commit()
    return cur.rowcount > 0
