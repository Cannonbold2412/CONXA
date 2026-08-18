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
from pathlib import Path
from typing import Any

from conxa_core.config import settings
from conxa_core.db import db_list_kv, db_set


def skill_packs_dir(slug: str) -> Path:
    """On-disk cache directory for a company's published skill pack."""
    return settings.data_dir / "skill-packs" / slug


def skillpack_files_ns(slug: str) -> str:
    """KV namespace holding the durable (Postgres) copy of a pack's files."""
    return f"skillpack_files__{slug}"


def skillpack_versions_ns(slug: str) -> str:
    """KV namespace holding skill-pack release history, one row per version.

    Mirrors ``installer_versions_ns`` in ``installer_storage.py`` — no ``:``
    separator, for the same Windows-path-safety reasoning documented there.
    """
    return f"skillpack_versions__{slug}"


def skill_pack_release_dir(slug: str, version: str) -> Path:
    """On-disk immutable snapshot directory for one published release."""
    return settings.data_dir / "skill-packs" / slug / "releases" / version


def skillpack_release_files_ns(slug: str, version: str) -> str:
    """KV namespace holding the durable copy of one release's files. Never
    overwritten after a publish succeeds — this is what makes rollback possible
    without rebuilding or duplicating anything."""
    return f"skillpack_release_files__{slug}__{version}"


def skillpack_channels_ns() -> str:
    """KV namespace for the release-channel pointer, one row per slug.

    Not to be confused with ``updates_routes.py``'s dev/stable channel for the
    runtime/app self-updater — a separate concept this module doesn't touch."""
    return "skillpack_channels"


def skillpack_release_events_ns(slug: str) -> str:
    """KV namespace for the durable, unbounded per-slug release audit trail —
    see ``release_channel.record_release_event``."""
    return f"skillpack_release_events__{slug}"


def write_release_snapshot(slug: str, version: str, files: dict[str, bytes]) -> None:
    """Write the immutable, write-once snapshot for a published release —
    disk (fast path) + KV (durable, survives an ephemeral-disk restart).
    Never called twice for the same (slug, version): publish's duplicate-version
    gate is what makes that a safe assumption here."""
    release_dir = skill_pack_release_dir(slug, version)
    release_dir.mkdir(parents=True, exist_ok=True)
    ns = skillpack_release_files_ns(slug, version)
    for rel, raw in files.items():
        target = release_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_bytes(raw)
        tmp.replace(target)
        db_set(ns, rel, {"path": rel, "content_base64": base64.b64encode(raw).decode("ascii")})


def read_release_snapshot(slug: str, version: str) -> dict[str, bytes]:
    """{relative_path: raw_bytes} for an immutable published release, read from
    KV (the durable source — disk can be wiped between requests on a
    no-persistent-disk host). Returns {} if the release predates this feature
    (published before a per-version snapshot existed) or was never published."""
    out: dict[str, bytes] = {}
    for _key, row in db_list_kv(skillpack_release_files_ns(slug, version)):
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
