"""Clerk JWT verification and the get_current_user() dependency.

A small, standalone copy of conxa-cloud/backend/app/api/security.py's
verify_clerk_jwt — not imported from there, since conxa-execute is a
separately deployed service with no dependency on conxa-cloud's backend
package. Replaces the old opaque Execute Key: the Clerk user id (`sub`) is
now the identity every wallet/entitlement lookup keys off.
"""
from __future__ import annotations

from typing import Any

from fastapi import Header, HTTPException

from conxa_core.config import settings


def verify_clerk_jwt(token: str) -> dict[str, Any]:
    if not settings.clerk_issuer or not settings.clerk_jwks_url:
        raise HTTPException(status_code=500, detail="clerk_auth_not_configured")
    try:
        import jwt
        from jwt import PyJWKClient
    except Exception as exc:  # pragma: no cover - exercised only in auth deployments
        raise HTTPException(status_code=500, detail="pyjwt_dependency_missing") from exc

    try:
        signing_key = PyJWKClient(settings.clerk_jwks_url).get_signing_key_from_jwt(token)
        options = {"verify_aud": bool(settings.clerk_audience)}
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.clerk_audience or None,
            issuer=settings.clerk_issuer,
            options=options,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="invalid_clerk_token") from exc

    azp_values = settings.clerk_authorized_party_values
    if azp_values and payload.get("azp") not in azp_values:
        raise HTTPException(status_code=403, detail="invalid_authorized_party")
    return dict(payload)


def get_current_user(authorization: str = Header(default="")) -> str:
    """FastAPI dependency: verify the bearer Clerk JWT, return the user id (`sub`)."""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing_bearer_token")
    claims = verify_clerk_jwt(authorization[7:].strip())
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid_clerk_token")
    return user_id
