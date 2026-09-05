"""Tables conxa-execute needs beyond the generic kv_store.

kv_store (packages/conxa-core/conxa_core/db.py) has no secondary index, so it
can't answer "this user's most-recently-updated sessions" efficiently — that
alone is why this file exists. A subscription is a single row per user
(get-by-user_id, never listed/ordered), so it stays on kv_store exactly like
wallet.py's balance (see app/subscription.py) — no dedicated table needed
there. This table's creation follows the same convention as
conxa_core.db.init_db()'s kv_store: a raw CREATE TABLE IF NOT EXISTS, no
ORM/migration framework. No-op in filesystem dev mode (no
SKILL_DATABASE_URL) — same convention as init_db().
"""
from __future__ import annotations

from sqlalchemy import text

from conxa_core.db import get_engine


def init_execute_schema() -> None:
    engine = get_engine()
    if engine is None:
        return
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS execute_chat_session (
                id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id    TEXT        NOT NULL,
                title      TEXT        NOT NULL DEFAULT 'New chat',
                messages   JSONB       NOT NULL DEFAULT '[]',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_execute_chat_session_user
            ON execute_chat_session (user_id, updated_at DESC)
        """))
        conn.commit()
