"""Release-channel pointer + release-lifecycle audit trail for skill-pack releases.

V1 has exactly one channel, "stable" — a pointer from one (company slug, skill
slug) pair to the published version that skill's runtimes should converge on.
Every skill has its own independent pointer, version history, and event log —
publishing or rolling back one skill never moves another's. Moving the pointer
(publish or rollback) is the entire "activation" act; no artifact is ever
copied, rebuilt, or mutated when it moves. See ``publish_routes.py`` and
``release_routes.py`` for the only two callers that move it.

Not to be confused with ``updates_routes.py``'s dev/stable channel for the
runtime/app self-updater — a separate, pre-existing concept this module does
not touch or read.
"""

from __future__ import annotations

import time
from typing import Any

from conxa_core.db import db_append, db_get, db_set

from app.api.skillpack_storage import skillpack_channels_ns, skillpack_release_events_ns
from app.services.saas import Principal, add_audit_event

STABLE = "stable"

# Release-lifecycle event actions — see docstring on record_release_event.
EVT_VERSION_CREATED = "skill_version_created"
EVT_PUBLISH_STARTED = "skill_publish_started"
EVT_PUBLISH_SUCCEEDED = "skill_publish_succeeded"
EVT_PUBLISH_FAILED = "skill_publish_failed"
EVT_CHANNEL_CHANGED = "stable_channel_changed"
EVT_ROLLBACK_STARTED = "rollback_started"
EVT_ROLLBACK_COMPLETED = "rollback_completed"
# A "ready" (published, not yet activated) version being explicitly Released/
# Deployed by a Cloud admin — see release_routes.post_release_release. This is
# the only other action (besides rollback) that ever calls set_stable_version.
EVT_RELEASE_STARTED = "release_started"
EVT_RELEASE_SUCCEEDED = "release_succeeded"
EVT_RELEASE_FAILED = "release_failed"


def _channel_row_key(slug: str, skill_slug: str) -> str:
    return f"{slug}:{skill_slug}"


def get_channels(slug: str, skill_slug: str) -> dict[str, Any]:
    row = db_get(skillpack_channels_ns(), _channel_row_key(slug, skill_slug))
    return row if isinstance(row, dict) else {}


def get_stable_version(slug: str, skill_slug: str) -> str | None:
    """The version this skill's stable channel currently points at, or None if
    this skill has never completed a publish (a brand-new skill, or one with
    no publishes yet)."""
    stable = get_channels(slug, skill_slug).get(STABLE)
    if isinstance(stable, dict) and stable.get("version"):
        return str(stable["version"])
    return None


def set_stable_version(
    slug: str,
    skill_slug: str,
    version: str,
    *,
    set_by: str,
    reason: str,
    from_version: str | None,
) -> dict[str, Any]:
    """Move one skill's stable pointer. The single act of "activating" a
    release — called at the end of a successful publish (§5 of the
    release-system plan) and at the end of a rollback. Never called for a
    publish/rollback attempt that hasn't already durably persisted its
    artifact. Scoped to (slug, skill_slug) — moving one skill's pointer never
    touches any other skill's channel."""
    row = get_channels(slug, skill_slug)
    row["slug"] = slug
    row["skill_slug"] = skill_slug
    row[STABLE] = {
        "version": version,
        "set_at": time.time(),
        "set_by": set_by,
        "reason": reason,
        "from_version": from_version,
    }
    db_set(skillpack_channels_ns(), _channel_row_key(slug, skill_slug), row)
    return row[STABLE]


def record_release_event(
    principal: Principal,
    slug: str,
    skill_slug: str,
    action: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Append a release-lifecycle event to this skill's durable, unbounded
    event log, and mirror it into the existing (global, 500-entry ring buffer)
    audit log so the dashboard's Audit page keeps working with no changes. This
    is the same event recorded twice for two different retention/query needs,
    not two audit systems — see plan §6."""
    event = {
        "id": f"rel_{int(time.time() * 1_000_000)}",
        "workspace_id": principal.workspace_id,
        "user_id": principal.user_id,
        "action": action,
        "resource_type": "skill_pack_release",
        "resource_id": slug,
        "skill_slug": skill_slug,
        "metadata": metadata or {},
        "created_at": time.time(),
    }
    db_append(skillpack_release_events_ns(slug, skill_slug), "events", [event])
    add_audit_event(
        principal, action, resource_type="skill_pack_release", resource_id=slug, metadata=metadata or {}
    )
    return event


def list_release_events(slug: str, skill_slug: str) -> list[dict[str, Any]]:
    """Newest-first release-lifecycle events for this skill. Unbounded — unlike
    ``saas.audit_events_for``, nothing here ever gets evicted by another
    workspace's or another skill's activity."""
    rows = db_get(skillpack_release_events_ns(slug, skill_slug), "events")
    events = [e for e in (rows if isinstance(rows, list) else []) if isinstance(e, dict)]
    events.sort(key=lambda e: float(e.get("created_at") or 0), reverse=True)
    return events
