"""Reads + writes for authenticated user accounts.

Accounts are private: there is deliberately NO list-all-users query —
every read is by id, email, or google_sub, and routes only ever act on
the account inside a verified session token. Selected merchants are
stored with id AND name because a user can pick a store we haven't
scraped yet, so there may be no merchants row to join against.

(Supabase's own auth.users / user_preferences tables stay untouched —
this is app-managed auth, migratable to Supabase Auth later.)
"""

import logging

from .connection import get_conn, get_cursor
from .guard import graceful_write

logger = logging.getLogger("flippwatch.db.users")

_DDL = """
CREATE TABLE IF NOT EXISTS app_users (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    postal_code TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auth columns (idempotent — also upgrades the pre-auth table shape)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_google_sub ON app_users (google_sub);

-- Names were UNIQUE in the pre-auth profile system; emails are the
-- identity now, so two users may both be called "Sam".
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_name_key;

CREATE TABLE IF NOT EXISTS user_merchants (
    user_id       INT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    merchant_id   BIGINT NOT NULL,
    merchant_name TEXT NOT NULL,
    PRIMARY KEY (user_id, merchant_id)
);
"""


def ensure_user_tables() -> None:
    """Idempotent — called once at app startup."""
    with get_cursor() as cur:
        cur.execute(_DDL)


def _attach_merchants(cur, user: dict) -> dict:
    cur.execute(
        """
        SELECT merchant_id AS id, merchant_name AS name
        FROM user_merchants
        WHERE user_id = %(id)s
        ORDER BY merchant_name
        """,
        {"id": user["id"]},
    )
    user["merchants"] = cur.fetchall()
    return user


def get_user(user_id: int) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, name, email, postal_code FROM app_users WHERE id = %(id)s",
            {"id": user_id},
        )
        user = cur.fetchone()
        return _attach_merchants(cur, user) if user else None


def get_user_by_email(email: str) -> dict | None:
    """Includes password_hash — for the login check only, never returned
    by a route."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, name, email, postal_code, password_hash
            FROM app_users
            WHERE lower(email) = lower(%(email)s)
            """,
            {"email": email},
        )
        return cur.fetchone()


def get_user_by_google_sub(google_sub: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, name, email, postal_code FROM app_users WHERE google_sub = %(sub)s",
            {"sub": google_sub},
        )
        user = cur.fetchone()
        return _attach_merchants(cur, user) if user else None


@graceful_write
def create_user(
    name: str,
    email: str,
    password_hash: str | None = None,
    google_sub: str | None = None,
    postal_code: str | None = None,
) -> dict | None:
    """Returns the new user, or None if the email is already registered."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO app_users (name, email, password_hash, google_sub, postal_code)
            SELECT %(name)s, %(email)s, %(password_hash)s, %(google_sub)s, %(postal_code)s
            WHERE NOT EXISTS (
                SELECT 1 FROM app_users WHERE lower(email) = lower(%(email)s)
            )
            RETURNING id, name, email, postal_code
            """,
            {
                "name": name,
                "email": email,
                "password_hash": password_hash,
                "google_sub": google_sub,
                "postal_code": postal_code,
            },
        )
        row = cur.fetchone()
        if row is not None:
            row["merchants"] = []
        return row


@graceful_write
def link_google_sub(user_id: int, google_sub: str) -> None:
    """Attach a Google identity to an existing email account (first
    Google sign-in with an address that already signed up by password)."""
    with get_cursor() as cur:
        cur.execute(
            "UPDATE app_users SET google_sub = %(sub)s WHERE id = %(id)s",
            {"sub": google_sub, "id": user_id},
        )


@graceful_write
def update_user(
    user_id: int,
    postal_code: str | None = None,
    merchants: list[dict] | None = None,  # [{"id": 234, "name": "Walmart"}]
) -> dict | None:
    """Update postal code and/or replace the merchant selection
    atomically. Returns the updated user, or None if it doesn't exist."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM app_users WHERE id = %(id)s", {"id": user_id})
            if cur.fetchone() is None:
                return None

            if postal_code is not None:
                cur.execute(
                    "UPDATE app_users SET postal_code = %(pc)s WHERE id = %(id)s",
                    {"pc": postal_code, "id": user_id},
                )

            if merchants is not None:
                cur.execute(
                    "DELETE FROM user_merchants WHERE user_id = %(id)s",
                    {"id": user_id},
                )
                for m in merchants:
                    cur.execute(
                        """
                        INSERT INTO user_merchants (user_id, merchant_id, merchant_name)
                        VALUES (%(uid)s, %(mid)s, %(mname)s)
                        ON CONFLICT DO NOTHING
                        """,
                        {"uid": user_id, "mid": int(m["id"]), "mname": str(m["name"])},
                    )

    return get_user(user_id)
