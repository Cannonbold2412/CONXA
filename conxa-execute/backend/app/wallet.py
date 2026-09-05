"""Token wallet: one integer balance per Execute Key, keyed by key_hash.

Reuses conxa_core.db's generic kv_store table (namespace "execute_wallet")
directly via SQL rather than its db_get/db_set helpers, so credit/debit can
be a single atomic statement — a plain row UPDATE already serializes
concurrent debits under Postgres; a single numeric balance doesn't need the
advisory-lock reservation machinery conxa-cloud's multi-dimensional
entitlements use.
"""
from __future__ import annotations

from sqlalchemy import text

from conxa_core.db import db_get, db_set, get_engine

_NAMESPACE = "execute_wallet"


def get_balance(key_hash: str) -> int:
    row = db_get(_NAMESPACE, key_hash)
    return int(row["tokens_balance"]) if row else 0


def credit(key_hash: str, amount: int) -> int:
    """Add ``amount`` tokens to the wallet, creating it if needed. Returns the new balance."""
    engine = get_engine()
    if engine is None:
        # ponytail: filesystem dev mode is check-then-write, racy under concurrent
        # requests — fine for single-process local dev, never for production
        # (production always sets SKILL_DATABASE_URL, which uses the atomic path below).
        balance = get_balance(key_hash) + amount
        db_set(_NAMESPACE, key_hash, {"tokens_balance": balance})
        return balance
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                INSERT INTO kv_store (namespace, key, data)
                VALUES (:ns, :key, jsonb_build_object('tokens_balance', CAST(:amount AS bigint)))
                ON CONFLICT (namespace, key) DO UPDATE
                SET data = jsonb_set(
                        kv_store.data, '{tokens_balance}',
                        to_jsonb(COALESCE((kv_store.data->>'tokens_balance')::bigint, 0) + CAST(:amount AS bigint))
                    ),
                    updated_at = now()
                RETURNING data->>'tokens_balance'
            """),
            {"ns": _NAMESPACE, "key": key_hash, "amount": amount},
        ).fetchone()
        conn.commit()
        return int(row[0])


def debit_if_available(key_hash: str, amount: int) -> int:
    """Subtract up to ``amount`` tokens, floored at 0. Returns the new balance.

    Never raises on insufficient funds — callers gate on get_balance() > 0
    before making the upstream call; this just settles the actual cost after.
    """
    engine = get_engine()
    if engine is None:
        balance = max(0, get_balance(key_hash) - amount)
        db_set(_NAMESPACE, key_hash, {"tokens_balance": balance})
        return balance
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                UPDATE kv_store
                SET data = jsonb_set(
                        data, '{tokens_balance}',
                        to_jsonb(GREATEST(0, (data->>'tokens_balance')::bigint - CAST(:amount AS bigint)))
                    ),
                    updated_at = now()
                WHERE namespace = :ns AND key = :key_hash
                RETURNING data->>'tokens_balance'
            """),
            {"ns": _NAMESPACE, "key_hash": key_hash, "amount": amount},
        ).fetchone()
        conn.commit()
        return int(row[0]) if row else 0


if __name__ == "__main__":
    import uuid

    test_key = f"selfcheck_{uuid.uuid4().hex}"
    assert get_balance(test_key) == 0
    assert credit(test_key, 100) == 100
    assert credit(test_key, 50) == 150
    assert debit_if_available(test_key, 40) == 110
    assert debit_if_available(test_key, 1000) == 0  # floors at 0, never negative
    assert get_balance(test_key) == 0
    print("wallet.py self-check passed")
