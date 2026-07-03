"""Storage-limit guard for database writes.

Supabase's free tier (500 MB) puts the database into a read-only /
out-of-space state when the quota is hit. Without handling, any scrape
or user-preference write would take the whole API down. Writes wrapped
in @graceful_write instead: log CRITICAL once, record the failure, and
return None — reads keep working, and /health reports "degraded" so an
admin (or uptime monitor) sees it immediately.

SQLSTATE classes handled:
    53xxx  insufficient resources (53100 disk_full, 53400 config limit)
    25006  read_only_sql_transaction (Supabase's over-quota mode)
"""

import functools
import logging
import time

import psycopg2

logger = logging.getLogger("flippwatch.db.guard")

_STORAGE_SQLSTATES_PREFIX = "53"   # insufficient resources class
_READ_ONLY_SQLSTATE = "25006"

# Set on the first storage failure; exposed via storage_status() → /health.
_storage_error: dict | None = None


def _is_storage_error(exc: psycopg2.Error) -> bool:
    code = exc.pgcode or ""
    return code.startswith(_STORAGE_SQLSTATES_PREFIX) or code == _READ_ONLY_SQLSTATE


def _record(fn_name: str, exc: psycopg2.Error) -> None:
    global _storage_error
    first_time = _storage_error is None
    _storage_error = {
        "function": fn_name,
        "sqlstate": exc.pgcode,
        "error": str(exc).strip().split("\n")[0],
        "at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    if first_time:
        logger.critical(
            "DATABASE STORAGE LIMIT HIT (%s in %s): %s — writes are being "
            "dropped gracefully; run the prune job (python -m maintenance.prune) "
            "or upgrade the plan.",
            exc.pgcode, fn_name, _storage_error["error"],
        )
    else:
        logger.error("Write dropped, storage still full: %s (%s)", fn_name, exc.pgcode)


def storage_status() -> dict:
    """For /health: {"ok": bool, "last_error": {...} | None}."""
    return {"ok": _storage_error is None, "last_error": _storage_error}


def clear_storage_error() -> None:
    """Call after a successful prune / plan upgrade check."""
    global _storage_error
    _storage_error = None


def graceful_write(fn):
    """Decorator for write functions. Storage-limit errors are swallowed
    (logged + flagged, returns None); every other error still raises —
    a bug should crash loudly, a full disk shouldn't."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except psycopg2.Error as exc:
            if _is_storage_error(exc):
                _record(fn.__name__, exc)
                return None
            raise

    return wrapper
