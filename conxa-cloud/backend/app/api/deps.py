"""Shared FastAPI dependencies and error mappers for the API routers.

Centralizes the request-to-``Principal`` resolution and the entitlement
error-to-HTTP mapping that were previously copy-pasted across routers.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from app.services.entitlements import EntitlementError
from app.services.saas import Principal, ensure_principal, principal_from_request


def current_principal(request: Request) -> Principal:
    """Resolve the caller's ``Principal`` and persist its identity.

    Usable both as a FastAPI dependency (``Depends(current_principal)``) and as
    a plain helper (``current_principal(request)``).
    """
    principal = principal_from_request(request)
    ensure_principal(principal)
    return principal


def entitlement_http_error(exc: Exception) -> HTTPException:
    """Map an entitlements-service failure to its HTTP response.

    ``EntitlementError`` carries an explicit status/code; any other failure is
    reported as a 503 so a transient store outage never leaks a 500.
    """
    if isinstance(exc, EntitlementError):
        return HTTPException(status_code=exc.status_code, detail=exc.code)
    return HTTPException(status_code=503, detail="entitlements_unavailable")
