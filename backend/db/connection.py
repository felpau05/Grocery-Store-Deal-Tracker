"""Database connection handling. Only get_conn / get_cursor live here —
no queries, no business logic. See db/__init__.py for the module split.
"""

import logging
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2 import pool

from config import Config

logger = logging.getLogger("flippwatch.db.connection")

_pool: "pool.ThreadedConnectionPool | None" = None


def _get_pool() -> "pool.ThreadedConnectionPool":
    global _pool
    if _pool is None:
        if not Config.DATABASE_URL:
            raise RuntimeError(
                "DATABASE_URL is not set — add it to backend/.env "
                "(see .env.example)."
            )
        _pool = pool.ThreadedConnectionPool(1, 10, dsn=Config.DATABASE_URL)
        logger.info("Database connection pool created")
    return _pool


@contextmanager
def get_conn():
    """Yield a pooled connection for a unit of work.

    Commits on success, rolls back on any exception, always returns
    the connection to the pool. Use get_cursor() for the common
    single-cursor case — reach for this directly only when you need
    several cursors / explicit transaction control.
    """
    conn = _get_pool().getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _get_pool().putconn(conn)


@contextmanager
def get_cursor(dict_cursor: bool = True):
    """Yield a cursor for one query or transaction.

    dict_cursor=True (default) returns rows as dicts (psycopg2 RealDictCursor)
    so callers can do row["name"] instead of row[0].
    """
    with get_conn() as conn:
        cursor_factory = psycopg2.extras.RealDictCursor if dict_cursor else None
        with conn.cursor(cursor_factory=cursor_factory) as cur:
            yield cur