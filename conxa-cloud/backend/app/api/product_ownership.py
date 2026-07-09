"""Shared slug-ownership and installer-generation helpers.

Extracted out of ``publish_routes`` so ``entitlements`` can read ownership
without importing the publish router module (which itself imports
``entitlements`` for slot gating — a direct import the other way would be
circular).
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import HTTPException

from conxa_core.db import db_get, db_list_kv, db_set

_OWNERS_NS = "publish_owners"

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


def _owner_of(slug: str) -> str | None:
    row = db_get(_OWNERS_NS, slug)
    if isinstance(row, dict):
        return str(row.get("workspace_id") or "") or None
    return None


def _assert_not_owned_by_other(slug: str, workspace_id: str) -> None:
    """Read-only 403 check, split out from ``_assert_owner`` so a caller that
    also needs to entitlement-check a brand-new slug (skill-pack publish) can
    run that check *before* the slug gets claimed — claiming first would make
    every slug look pre-owned by the time the slot-limit check ran."""
    owner = _owner_of(slug)
    if owner and owner != workspace_id:
        raise HTTPException(status_code=403, detail="slug_owned_by_another_workspace")


def _claim_owner(slug: str, workspace_id: str) -> None:
    if not _owner_of(slug):
        db_set(_OWNERS_NS, slug, {"slug": slug, "workspace_id": workspace_id, "claimed_at": time.time()})


def _assert_owner(slug: str, workspace_id: str) -> None:
    """Conflict-check + claim in one call. Fine for callers with no entitlement
    check sandwiched in between (installer upload); skill-pack publish uses
    ``_assert_not_owned_by_other`` + ``_claim_owner`` separately instead."""
    _assert_not_owned_by_other(slug, workspace_id)
    _claim_owner(slug, workspace_id)


def owned_slugs_for_workspace(workspace_id: str) -> list[str]:
    """Every slug this workspace has ever published or uploaded an installer for.

    Used by entitlements to count consumed product/skill-pack slots off the
    single source of truth for "who owns this slug" rather than re-deriving it
    from plugin records or installer meta files scattered on disk.

    Reads the ``slug`` field from each row rather than the key ``db_list_kv``
    returns — the filesystem KV fallback's "key" is a SHA-256 hash of the real
    key (see conxa_core.db._fs_path), not the original string, so the actual
    slug must be carried inside the stored value to survive a list scan.
    """
    slugs: list[str] = []
    for _key, row in db_list_kv(_OWNERS_NS):
        if isinstance(row, dict) and row.get("workspace_id") == workspace_id and row.get("slug"):
            slugs.append(str(row["slug"]))
    return slugs
