"""Workspace identity constant shared by the storage layer and the SaaS layer.

The local/offline workspace id is referenced both by the workflow store (which
stamps every locally created workflow) and by the cloud SaaS metadata. Keeping it
here lets the storage foundation stay independent of the cloud-only SaaS module.
"""

from __future__ import annotations

import re

LOCAL_WORKSPACE_ID = "wrk_local"


def workspace_dir_slug(workspace_id: str) -> str:
    """Derive a filesystem/URL-safe slug for a workspace_id.

    One workspace has exactly one skill pack and one installer, forever —
    workspace_id is the sole identity key (see CLAUDE.md Key Invariants).
    This is purely a character-safety transform (skill-pack directories and
    bundle slugs must match ``validate_bundle_slug``'s ``[a-z][a-z0-9_]*``),
    not an identity derivation — unlike the old company_slug(), it takes no
    name input and needs no uniqueness arbitration.
    """
    base = re.sub(r"[^a-z0-9]+", "_", workspace_id.lower()).strip("_") or "ws"
    if not base[0].isalpha():
        base = f"ws_{base}"
    return base
