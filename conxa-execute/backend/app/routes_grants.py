"""Claim an Execute seat grant handed out by a Build Studio workspace admin.

Relays to Conxa Cloud's internal bridge (cloud_bridge.claim_grant) rather
than the invitee ever touching the Cloud Dashboard — they're here to use
Conxa Execute, not Build Studio.
"""
from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import cloud_bridge
from .auth import get_current_claims

router = APIRouter()


class ClaimGrantBody(BaseModel):
    grant_id: str = Field(..., min_length=1, max_length=128)


@router.post("/v1/execute-grants/claim")
async def claim_grant(body: ClaimGrantBody, claims: dict[str, Any] = Depends(get_current_claims)) -> dict:
    if not claims["email"]:
        raise HTTPException(status_code=400, detail="clerk_account_has_no_email")
    try:
        return cloud_bridge.claim_grant(grant_id=body.grant_id, user_id=claims["user_id"], email=claims["email"])
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        try:
            detail = exc.response.json().get("detail", detail)
        except ValueError:
            pass
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="cloud_unreachable") from exc
