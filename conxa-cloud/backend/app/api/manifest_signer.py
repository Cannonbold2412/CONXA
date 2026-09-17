"""Re-exports app.services.manifest_signing for existing callers of this module
path (updates_routes.py, the test suite). The implementation lives in the
services layer — see that module's docstring for why."""
from __future__ import annotations

from app.services.manifest_signing import (
    generate_keypair_pem,
    load_signing_key,
    sign_manifest,
    verify_manifest,
)

__all__ = ["generate_keypair_pem", "load_signing_key", "sign_manifest", "verify_manifest"]
