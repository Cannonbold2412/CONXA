"""Shared on-disk and KV layout for published skill-pack caches.

``publish_routes`` writes these locations on publish; ``skillpack_update_routes``
reads them to serve runtime delta sync. Keeping the path and namespace
conventions in one place ensures the writer and reader can never drift apart.

Also holds the read/write helpers for a release's *immutable* per-version
snapshot (as opposed to ``skillpack_files_ns``, which is the mutable "whatever
is currently live" mirror that ``_build_delta`` serves). ``release_channel.py``
and ``publish_routes.py`` are the only writers of a snapshot; ``release_routes.py``
is the only reader of one that isn't also the writer.
"""

from __future__ import annotations

import base64
import time
from pathlib import Path
from typing import Any

from conxa_core.config import settings
from conxa_core.db import db_get, db_list_kv, db_set


def skill_packs_dir(slug: str) -> Path:
    """On-disk cache directory for a company's published skill pack."""
    return settings.data_dir / "skill-packs" / slug


def skillpack_files_ns(slug: str) -> str:
    """KV namespace holding the durable (Postgres) copy of a pack's files."""
    return f"skillpack_files__{slug}"


def skillpack_versions_ns(slug: str, skill_slug: str) -> str:
    """KV namespace holding one skill's release history, one row per version.

    Keyed by (company slug, skill slug) — every skill has its own independent
    version history (see docs/TRD.md's per-skill publishing architecture).
    Mirrors ``installer_versions_ns`` in ``installer_storage.py`` — no ``:``
    separator, for the same Windows-path-safety reasoning documented there.
    """
    return f"skillpack_versions__{slug}__{skill_slug}"


def skill_pack_release_dir(slug: str, skill_slug: str, version: str) -> Path:
    """On-disk immutable snapshot directory for one skill's published release."""
    return settings.data_dir / "skill-packs" / slug / "skills" / skill_slug / "releases" / version


def skillpack_release_files_ns(slug: str, skill_slug: str, version: str) -> str:
    """KV namespace holding the durable copy of one skill's release files. Never
    overwritten after a publish succeeds — this is what makes rollback possible
    without rebuilding or duplicating anything."""
    return f"skillpack_release_files__{slug}__{skill_slug}__{version}"


def skillpack_known_skills_ns() -> str:
    """KV namespace listing every skill ever published for a company, one row
    per (slug, skill_slug) — keyed like ``skillpack_channels_ns()``.

    Deliberately independent of pack.json's ``skills``/``skill_groups`` union,
    which only updates at Release/Deploy time (see release_routes.py). This
    registry updates at Publish time instead, so Cloud's Skill Packages →
    Group → Workflow navigation can see a skill the moment it's published,
    before anyone has released it — an admin-facing "what exists" index, not
    the runtime-facing "what's currently live" mirror."""
    return "skillpack_known_skills"


def record_known_skill(
    slug: str, skill_slug: str, *, group_id: str = "", group_name: str = "", workflow_name: str = ""
) -> None:
    """Upsert this skill into the company's known-skills registry. Called once
    per publish (never removed — a skill's presence here just means "has been
    published at least once"). Display fields are optional and only ever
    overwrite with a non-empty value, so an older Build Studio that doesn't
    send them yet never blanks out a name a newer one already recorded."""
    key = f"{slug}:{skill_slug}"
    existing = db_get(skillpack_known_skills_ns(), key)
    row = existing if isinstance(existing, dict) else {}
    row["slug"] = slug
    row["skill_slug"] = skill_slug
    if group_id:
        row["group_id"] = group_id
    if group_name:
        row["group_name"] = group_name
    if workflow_name:
        row["workflow_name"] = workflow_name
    row.setdefault("first_published_at", time.time())
    db_set(skillpack_known_skills_ns(), key, row)


def list_known_skills(slug: str) -> list[dict[str, Any]]:
    """Every skill ever published for this company, across all groups.

    Filter on the stored ``slug`` field, not the KV key — the filesystem
    fallback hashes keys, so a ``"{slug}:"`` prefix match would miss every row.
    """
    return [
        row
        for _key, row in db_list_kv(skillpack_known_skills_ns())
        if isinstance(row, dict) and row.get("slug") == slug
    ]


def skillpack_known_groups_ns() -> str:
    """KV namespace listing every Workflow Group Build Studio has synced for a
    company, one row per (slug, group_id). Independent of known-skills: a
    group appears here the moment it is created in Studio, before any
    workflow in it has been published."""
    return "skillpack_known_groups"


def record_known_group(slug: str, group_id: str, group_name: str = "") -> None:
    """Upsert this group into the company's known-groups registry. Name only
    overwrites when non-empty, matching ``record_known_skill``."""
    key = f"{slug}:{group_id}"
    existing = db_get(skillpack_known_groups_ns(), key)
    row = existing if isinstance(existing, dict) else {}
    row["slug"] = slug
    row["group_id"] = group_id
    if group_name:
        row["group_name"] = group_name
    row.setdefault("created_at", time.time())
    db_set(skillpack_known_groups_ns(), key, row)


def list_known_groups(slug: str) -> list[dict[str, Any]]:
    """Every group Studio has synced for this company, including empty ones."""
    return [
        row
        for _key, row in db_list_kv(skillpack_known_groups_ns())
        if isinstance(row, dict) and row.get("slug") == slug
    ]


def skillpack_channels_ns() -> str:
    """KV namespace for the release-channel pointer, one row per slug.

    Not to be confused with ``updates_routes.py``'s dev/stable channel for the
    runtime/app self-updater — a separate concept this module doesn't touch."""
    return "skillpack_channels"


def skillpack_release_events_ns(slug: str, skill_slug: str) -> str:
    """KV namespace for the durable, unbounded per-skill release audit trail —
    see ``release_channel.record_release_event``."""
    return f"skillpack_release_events__{slug}__{skill_slug}"


def write_release_snapshot(slug: str, skill_slug: str, version: str, files: dict[str, bytes]) -> None:
    """Write the immutable, write-once snapshot for one skill's published
    release — disk (fast path) + KV (durable, survives an ephemeral-disk
    restart). Never called twice for the same (slug, skill_slug, version):
    publish's duplicate-version gate is what makes that a safe assumption here.

    ``files`` is that skill's own files only — never includes ``pack.json``,
    which is company-level static config and must never be restored by a
    single skill's rollback (see release_routes.post_release_rollback)."""
    release_dir = skill_pack_release_dir(slug, skill_slug, version)
    release_dir.mkdir(parents=True, exist_ok=True)
    ns = skillpack_release_files_ns(slug, skill_slug, version)
    for rel, raw in files.items():
        target = release_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_bytes(raw)
        tmp.replace(target)
        db_set(ns, rel, {"path": rel, "content_base64": base64.b64encode(raw).decode("ascii")})


def read_release_snapshot(slug: str, skill_slug: str, version: str) -> dict[str, bytes]:
    """{relative_path: raw_bytes} for one skill's immutable published release,
    read from KV (the durable source — disk can be wiped between requests on a
    no-persistent-disk host). Returns {} if the release predates this feature
    (published before a per-skill snapshot existed) or was never published."""
    out: dict[str, bytes] = {}
    for _key, row in db_list_kv(skillpack_release_files_ns(slug, skill_slug, version)):
        if isinstance(row, dict) and row.get("content_base64") and row.get("path"):
            out[str(row["path"])] = base64.b64decode(row["content_base64"])
    return out


def write_mutable_mirror_files(slug: str, files: dict[str, bytes]) -> None:
    """Overwrite the mutable "currently live" mirror (disk + ``skillpack_files_ns``
    KV) that ``_build_delta`` serves. Called by publish (new files) and by
    rollback (a target release's already-immutable files) — this is what
    "activates" a release without the runtime sync path ever needing to know
    about channels or rollback."""
    packs_dir = skill_packs_dir(slug)
    ns = skillpack_files_ns(slug)
    for rel, raw in files.items():
        target = packs_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_bytes(raw)
        tmp.replace(target)
        db_set(ns, rel, {"path": rel, "content_base64": base64.b64encode(raw).decode("ascii")})


def read_pack_json_mirror(slug: str) -> dict[str, Any]:
    """Best-effort read of the current pack.json mirror — disk first, then the
    durable KV copy (disk can be wiped between requests on a no-persistent-disk
    host). Returns {} if neither exists yet (first-ever publish for this slug)."""
    import json

    from conxa_core.db import db_get

    pack_path = skill_packs_dir(slug) / "pack.json"
    if pack_path.is_file():
        try:
            return json.loads(pack_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    stored_pack = db_get(skillpack_files_ns(slug), "pack.json")
    if isinstance(stored_pack, dict) and stored_pack.get("content_base64"):
        try:
            return json.loads(base64.b64decode(stored_pack["content_base64"]).decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            return {}
    return {}


def write_pack_json_mirror(slug: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Merge ``updates`` into the durable pack.json mirror (disk + KV) — the
    single file the runtime's delta-sync (and everything downstream of it)
    reads for company-level metadata. Shared read-merge-write used by both
    publish and rollback. Returns the full merged pack."""
    import json

    packs_dir = skill_packs_dir(slug)
    packs_dir.mkdir(parents=True, exist_ok=True)
    pack_path = packs_dir / "pack.json"
    pack = read_pack_json_mirror(slug)
    pack.update(updates)
    pack_bytes = json.dumps(pack, ensure_ascii=False, indent=2).encode("utf-8")
    tmp = pack_path.with_suffix(".json.tmp")
    tmp.write_bytes(pack_bytes)
    tmp.replace(pack_path)
    db_set(
        skillpack_files_ns(slug),
        "pack.json",
        {"path": "pack.json", "content_base64": base64.b64encode(pack_bytes).decode("ascii")},
    )
    return pack
