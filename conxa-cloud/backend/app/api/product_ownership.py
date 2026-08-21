"""Installer-generation helpers.

Consolidated in this module for clear separation of concerns.
"""

from __future__ import annotations

from fastapi import HTTPException

# Conxa-owned installer "platform generation" allow-list. Frozen into each
# installer's pack.json at build time — never reassigned remotely for an
# already-installed runtime. Legacy (nothing baked in) behaves as "v1" via the
# unversioned routes kept permanently alongside these.
SUPPORTED_INSTALLER_GENERATIONS = ("v1", "v2")


def validate_installer_version(value: str) -> str:
    v = str(value or "").strip()
    if v not in SUPPORTED_INSTALLER_GENERATIONS:
        raise HTTPException(status_code=400, detail="unsupported_installer_version")
    return v
