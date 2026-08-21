"""Enterprise BYOK (bring-your-own-key) configuration — Azure OpenAI only.

Owner/admin only. GET never returns the stored key, only whether one is
configured and which endpoint/deployment it points at — see app/services/byok.py.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.deps import current_principal
from app.services.byok import ByokError, delete_key, describe_key, set_azure_openai_key
from app.services.rbac import require_admin

router = APIRouter(prefix="/workspace/llm-key", tags=["byok"])


class SetAzureOpenAIKeyBody(BaseModel):
    endpoint: str = Field(..., min_length=1, max_length=512)
    deployment: str = Field(..., min_length=1, max_length=256)
    api_version: str = Field(default="", max_length=64)
    api_key: str = Field(..., min_length=1, max_length=2048)


def _byok_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ByokError):
        return HTTPException(status_code=exc.status_code, detail=exc.code)
    return HTTPException(status_code=500, detail="byok_error")


@router.get("")
def get_llm_key(request: Request) -> dict[str, Any]:
    principal = current_principal(request)
    require_admin(principal)
    return describe_key(principal)


@router.put("")
def put_llm_key(body: SetAzureOpenAIKeyBody, request: Request) -> dict[str, Any]:
    principal = current_principal(request)
    require_admin(principal)
    try:
        return set_azure_openai_key(
            principal,
            endpoint=body.endpoint,
            deployment=body.deployment,
            api_version=body.api_version,
            api_key=body.api_key,
        )
    except Exception as exc:  # noqa: BLE001
        raise _byok_http_error(exc) from exc


@router.delete("")
def delete_llm_key(request: Request) -> dict[str, bool]:
    principal = current_principal(request)
    require_admin(principal)
    delete_key(principal)
    return {"deleted": True}
