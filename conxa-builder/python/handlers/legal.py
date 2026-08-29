"""Terms & Privacy acceptance — the Studio side of PROD-17.

Acceptance is recorded in the cloud against the signed-in user, not on this
machine, so it can be produced as evidence later. Both commands go through
``Backend._cloud_json``, which already attaches the Clerk bearer token and the
``X-Conxa-Machine`` hash; a cloud failure surfaces as a ``_CommandError`` and
the renderer keeps the user on the gate (fail-closed by design).
"""

from __future__ import annotations

from typing import Any

from handlers.protocol import _CommandError


class LegalMixin:
    def cmd_legal_status(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        current = self._cloud_json("/api/v1/legal/current")
        acceptance = self._cloud_json("/api/v1/legal/acceptance")
        return {
            "version": current.get("version") or "",
            "documents": current.get("documents") or [],
            "accepted": bool(acceptance.get("accepted")),
            "accepted_at": acceptance.get("accepted_at"),
        }

    def cmd_legal_accept(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        version = str(payload.get("version") or "").strip()
        hashes = payload.get("document_hashes")
        if not version or not isinstance(hashes, dict) or not hashes:
            raise _CommandError("invalid_input", "Missing the legal version or document hashes.")
        return self._cloud_json(
            "/api/v1/legal/acceptance",
            method="POST",
            body={
                "version": version,
                "document_hashes": {str(k): str(v) for k, v in hashes.items()},
                "app_version": str(payload.get("app_version") or "")[:64],
            },
        )
