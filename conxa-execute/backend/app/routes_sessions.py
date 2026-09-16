"""Backend-synced chat sessions — the cross-device sync target for the
Electron app's local session storage (see conxa-execute/app/vendor/opencode/
storage/storage.js). Not the primary store: BYOK mode never calls this route
(chat requests go straight from the device to your own model endpoint, never
through this backend), and even in Top-up/Subscription/workspace-pool mode the
Electron app's local storage is read/written on every turn — this API is
only what it pushes to afterward for cross-device sync. There is currently no
read path from the Electron app (no "restore from another device" UI yet),
so only the write (`PUT`) is exposed; list/get/create/delete existed
previously with no caller anywhere in the app and were removed.

Dev/filesystem fallback (no SKILL_DATABASE_URL) reuses kv_store under a
per-user namespace via db_get/db_set, same convention as wallet.py.
Production always has a real Postgres engine, using the dedicated
execute_chat_session table (see db_schema.py) for its ordered-by-recency list.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from conxa_core.db import db_get, db_set, get_engine

from .auth import get_current_user

router = APIRouter(prefix="/v1/sessions")

_FS_NAMESPACE_PREFIX = "execute_chat_session"


class SessionUpdate(BaseModel):
    messages: list[dict[str, Any]]
    title: str | None = None


def _fs_namespace(user_id: str) -> str:
    return f"{_FS_NAMESPACE_PREFIX}:{user_id}"


@router.put("/{session_id}")
async def update_session(session_id: str, body: SessionUpdate, user_id: str = Depends(get_current_user)) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    engine = get_engine()
    if engine is None:
        ns = _fs_namespace(user_id)
        record = db_get(ns, session_id)
        if not record:
            raise HTTPException(status_code=404, detail="session_not_found")
        record["messages"] = body.messages
        if body.title is not None:
            record["title"] = body.title
        record["updated_at"] = now
        db_set(ns, session_id, record)
        return record

    with engine.connect() as conn:
        result = conn.execute(
            text("""
                UPDATE execute_chat_session
                SET messages = CAST(:messages AS jsonb),
                    title = COALESCE(:title, title),
                    updated_at = now()
                WHERE id = CAST(:id AS uuid) AND user_id = :user_id
            """),
            {"id": session_id, "user_id": user_id, "messages": json.dumps(body.messages), "title": body.title},
        )
        if result.rowcount == 0:
            conn.rollback()
            raise HTTPException(status_code=404, detail="session_not_found")
        conn.commit()
        row = conn.execute(
            text("""
                SELECT id, title, messages, created_at, updated_at FROM execute_chat_session
                WHERE id = CAST(:id AS uuid) AND user_id = :user_id
            """),
            {"id": session_id, "user_id": user_id},
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="session_not_found")
    return {
        "id": str(row[0]),
        "title": row[1],
        "messages": row[2],
        "created_at": row[3].isoformat(),
        "updated_at": row[4].isoformat(),
    }
