"""Shared machine-registration helper for the two Build Studio chokepoints
that gate all real work: the LLM proxy and compile-credit reservation.

Build Studio sends ``X-Conxa-Machine`` (a SHA-256 hash of the Windows
``MachineGuid``, never the raw ID) alongside the existing ``X-Conxa-Client``
header. Older Studio builds that predate this header simply don't register a
machine — enforcement stays a no-op for them rather than breaking the request,
since ``entitlements_enforce_machines`` is the real on/off switch anyway.
"""

from __future__ import annotations

from fastapi import Request

from app.services.entitlements import ensure_machine_slot
from app.services.saas import Principal


def register_request_machine(request: Request, principal: Principal) -> None:
    """Raises EntitlementError("machine_limit_exceeded") if this is a new
    device beyond the plan's machine limit. Callers are expected to catch it
    via entitlement_http_error, same as every other entitlement gate."""
    machine_hash = request.headers.get("x-conxa-machine", "").strip()
    if not machine_hash:
        return
    ip = request.client.host if request.client else ""
    ensure_machine_slot(principal, machine_hash, ip)
