"""Workspace identity constant shared by the storage layer and the SaaS layer.

The local/offline workspace id is referenced both by the workflow store (which
stamps every locally created workflow) and by the cloud SaaS metadata. Keeping it
here lets the storage foundation stay independent of the cloud-only SaaS module.
"""

from __future__ import annotations

import re

LOCAL_WORKSPACE_ID = "wrk_local"


def company_slug(workspace_id: str, company_name: str) -> str:
    """Derive the stable company slug used for skill-pack/installer paths.

    Company identity is a property of the workspace, not of any individual
    workflow — every workflow in a workspace shares one skill package and one
    installer, so this must not vary per-workflow.
    """
    base = re.sub(r"[^a-z0-9]+", "-", company_name.lower()).strip("-") or "company"
    suffix = re.sub(r"[^a-z0-9]+", "", workspace_id.lower())[:8] or "local"
    return f"{base}-{suffix}"
