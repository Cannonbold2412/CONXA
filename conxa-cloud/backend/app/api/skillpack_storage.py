"""Shared on-disk and KV layout for published skill-pack caches.

``publish_routes`` writes these locations on publish; ``skillpack_update_routes``
reads them to serve runtime delta sync. Keeping the path and namespace
conventions in one place ensures the writer and reader can never drift apart.
"""

from __future__ import annotations

from pathlib import Path

from conxa_core.config import settings


def skill_packs_dir(slug: str) -> Path:
    """On-disk cache directory for a company's published skill pack."""
    return settings.data_dir / "skill-packs" / slug


def skillpack_files_ns(slug: str) -> str:
    """KV namespace holding the durable (Postgres) copy of a pack's files."""
    return f"skillpack_files__{slug}"
