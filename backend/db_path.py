"""Shared DB path and legacy migration helpers."""
import os
import shutil
import sys


BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.getenv("APP_DATA_DIR", os.path.join(BACKEND_DIR, "data"))


def resolve_db_path() -> str:
    """Resolve a stable default DB path unless overridden by AUTH_DB_PATH."""
    return os.getenv("AUTH_DB_PATH", os.path.join(DEFAULT_DATA_DIR, "auth.db"))


def _ensure_parent(path: str) -> None:
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def migrate_legacy_db_if_needed(target_path: str) -> str | None:
    """
    One-time migration from legacy SQLite locations to stable target path.
    Returns source path if migrated, else None.
    """
    if os.path.isfile(target_path):
        return None

    candidates = [
        os.path.join(os.getcwd(), "auth.db"),
        os.path.join(BACKEND_DIR, "auth.db"),
        os.path.join(os.path.dirname(BACKEND_DIR), "auth.db"),
    ]
    seen: set[str] = set()
    normalized_target = os.path.normpath(target_path)

    for candidate in candidates:
        norm_candidate = os.path.normpath(candidate)
        if norm_candidate in seen or norm_candidate == normalized_target:
            continue
        seen.add(norm_candidate)
        if not os.path.isfile(candidate):
            continue
        try:
            _ensure_parent(target_path)
            shutil.copy2(candidate, target_path)
            print(
                f"Migrated legacy DB from {candidate} to {target_path}",
                file=sys.stderr,
                flush=True,
            )
            return candidate
        except Exception as exc:
            print(
                f"Warning: failed to migrate DB from {candidate} to {target_path}: {exc}",
                file=sys.stderr,
                flush=True,
            )
    return None
