"""Release-channel pointer + release-lifecycle audit trail for skill-pack releases.

V1 has exactly one channel, "stable" — a pointer from a company slug to the
published version its runtimes should converge on. Moving the pointer (publish
or rollback) is the entire "activation" act; no artifact is ever copied,
rebuilt, or mutated when it moves. See ``publish_routes.py`` and
``release_routes.py`` for the only two callers that move it.

Not to be confused with ``updates_routes.py``'s dev/stable channel for the
runtime/app self-updater — a separate, pre-existing concept this module does
not touch or read.
"""

from __future__ import annotations

import time
from typing import Any

from conxa_core.db import db_get, db_set

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


def get_channels(slug: str) -> dict[str, Any]:
    row = db_get(skillpack_channels_ns(), slug)
    return row if isinstance(row, dict) else {}


def get_stable_version(slug: str) -> str | None:
    """The version the stable channel currently points at, or None if this slug
    has never completed a publish under the channel model (pre-migration slugs,
    or a slug with no publishes yet)."""
    stable = get_channels(slug).get(STABLE)
    if isinstance(stable, dict) and stable.get("version"):
        return str(stable["version"])
    return None


def set_stable_version(
    slug: str,
    version: str,
    *,
    set_by: str,
    reason: str,
    from_version: str | None,
) -> dict[str, Any]:
    """Move the stable pointer. The single act of "activating" a release —
    called at the end of a successful publish (§5 of the release-system plan)
    and at the end of a rollback. Never called for a publish/rollback attempt
    that hasn't already durably persisted its artifact."""
    row = get_channels(slug)
    row["slug"] = slug
    row[STABLE] = {
        "version": version,
        "set_at": time.time(),
        "set_by": set_by,
        "reason": reason,
        "from_version": from_version,
    }
    db_set(skillpack_channels_ns(), slug, row)
    return row[STABLE]


def record_release_event(
    principal: Principal,
    slug: str,
    action: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Append a release-lifecycle event to this slug's durable, unbounded event
    log, and mirror it into the existing (global, 500-entry ring buffer) audit
    log so the dashboard's Audit page keeps working with no changes. This is
    the same event recorded twice for two different retention/query needs, not
    two audit systems — see plan §6."""
    event = {
        "id": f"rel_{int(time.time() * 1_000_000)}",
        "workspace_id": principal.workspace_id,
        "user_id": principal.user_id,
        "action": action,
        "resource_type": "skill_pack_release",
        "resource_id": slug,
        "metadata": metadata or {},
        "created_at": time.time(),
    }
    from conxa_core.db import db_append

    db_append(skillpack_release_events_ns(slug), "events", [event])
    add_audit_event(
        principal, action, resource_type="skill_pack_release", resource_id=slug, metadata=metadata or {}
    )
    return event


def list_release_events(slug: str) -> list[dict[str, Any]]:
    """Newest-first release-lifecycle events for this slug. Unbounded — unlike
    ``saas.audit_events_for``, nothing here ever gets evicted by another
    workspace's activity."""
    rows = db_get(skillpack_release_events_ns(slug), "events")
    events = [e for e in (rows if isinstance(rows, list) else []) if isinstance(e, dict)]
    events.sort(key=lambda e: float(e.get("created_at") or 0), reverse=True)
    return events
