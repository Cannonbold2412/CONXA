"""Backend-synced chat sessions — the cross-device sync target for the
Electron app's local session storage (see conxa-execute/app/vendor/opencode/
storage/storage.js). Not the primary store: BYOK mode never calls these
routes at all (no account), and even in Top-up/Subscription mode the
Electron app's local storage is read/written on every turn — this API is
what it pushes to afterward, and what a second device pulls from.

Dev/filesystem fallback (no SKILL_DATABASE_URL) reuses kv_store under a
per-user namespace via db_get/db_set/db_delete/db_list_kv, same convention as
wallet.py. Production always has a real Postgres engine, using the dedicated
execute_chat_session table (see db_schema.py) for its ordered-by-recency list.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from conxa_core.db import db_delete, db_get, db_list_kv, db_set, get_engine

from .auth import get_current_user

router = APIRouter(prefix="/v1/sessions")

_FS_NAMESPACE_PREFIX = "execute_chat_session"


class SessionUpdate(BaseModel):
    messages: list[dict[str, Any]]
    title: str | None = None


def _fs_namespace(user_id: str) -> str:
    return f"{_FS_NAMESPACE_PREFIX}:{user_id}"


@router.post("")
async def create_session(user_id: str = Depends(get_current_user)) -> dict:
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    record = {"id": session_id, "title": "New chat", "messages": [], "created_at": now, "updated_at": now}
    engine = get_engine()
    if engine is None:
        db_set(_fs_namespace(user_id), session_id, record)
        return record
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO execute_chat_session (id, user_id, title, messages)
                VALUES (CAST(:id AS uuid), :user_id, 'New chat', '[]'::jsonb)
            """),
            {"id": session_id, "user_id": user_id},
        )
        conn.commit()
    return record


@router.get("")
async def list_sessions(user_id: str = Depends(get_current_user)) -> list[dict]:
    engine = get_engine()
    if engine is None:
        return [
            {"id": v["id"], "title": v["title"], "updated_at": v["updated_at"]}
            for _key, v in db_list_kv(_fs_namespace(user_id))
        ]
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, title, updated_at FROM execute_chat_session
                WHERE user_id = :user_id ORDER BY updated_at DESC
            """),
            {"user_id": user_id},
        ).fetchall()
    return [{"id": str(r[0]), "title": r[1], "updated_at": r[2].isoformat()} for r in rows]


@router.get("/{session_id}")
async def get_session(session_id: str, user_id: str = Depends(get_current_user)) -> dict:
    engine = get_engine()
    if engine is None:
        record = db_get(_fs_namespace(user_id), session_id)
        if not record:
            raise HTTPException(status_code=404, detail="session_not_found")
        return record
    with engine.connect() as conn:
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
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="session_not_found")
    return await get_session(session_id, user_id)


@router.delete("/{session_id}")
async def delete_session(session_id: str, user_id: str = Depends(get_current_user)) -> dict:
    engine = get_engine()
    if engine is None:
        db_delete(_fs_namespace(user_id), session_id)
        return {"deleted": True}
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM execute_chat_session WHERE id = CAST(:id AS uuid) AND user_id = :user_id"),
            {"id": session_id, "user_id": user_id},
        )
        conn.commit()
    return {"deleted": True}
