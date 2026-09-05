"""FastAPI entrypoint for the conxa-execute cloud backend.

Provides a metered, Conxa-managed chat proxy plus token-pack billing as an
alternative to BYOK for the conxa-execute desktop app. Managed chat is an
alternative, not a replacement — the Electron app keeps working unmodified
with any OpenAI-compatible baseURL/apiKey, BYOK included.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from conxa_core.config import settings
from conxa_core.db import healthcheck, init_db, using_database

from app.db_schema import init_execute_schema
from app.routes_checkout import router as checkout_router
from app.routes_proxy import router as proxy_router
from app.routes_sessions import router as sessions_router


def _validate_production_config() -> None:
    """Fail fast in production rather than booting a half-configured service."""
    if not settings.auth_required:
        return
    missing: list[str] = []
    if not settings.database_url:
        missing.append("SKILL_DATABASE_URL (filesystem fallback is not allowed in production)")
    if not settings.api_base_url:
        missing.append("SKILL_API_BASE_URL (used to build the Cashfree return_url)")
    if not (settings.cashfree_app_id and settings.cashfree_secret_key and settings.cashfree_webhook_secret):
        missing.append("CASHFREE_APP_ID / CASHFREE_SECRET_KEY / CASHFREE_WEBHOOK_SECRET")
    if not (settings.clerk_issuer and settings.clerk_jwks_url):
        missing.append("SKILL_CLERK_ISSUER / SKILL_CLERK_JWKS_URL")
    if missing:
        raise RuntimeError(
            "Refusing to start: SKILL_AUTH_REQUIRED=true but these are unset: " + ", ".join(missing)
        )


@asynccontextmanager
async def _lifespan(app: FastAPI):
    _validate_production_config()
    init_db()
    init_execute_schema()
    yield


app = FastAPI(title="CONXA", version="0.1.0", lifespan=_lifespan)
app.include_router(checkout_router)
app.include_router(proxy_router)
app.include_router(sessions_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "conxa_execute"}


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness: the process is up. Does not touch dependencies."""
    return {"status": "ok"}


@app.get("/readyz")
def readyz() -> JSONResponse:
    """Readiness: dependencies (DB) are reachable; used to gate deploys."""
    try:
        healthcheck()
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "database": "down", "error": str(exc)[:200]},
        )
    return JSONResponse(content={"status": "ready", "database": "up" if using_database() else "filesystem"})
