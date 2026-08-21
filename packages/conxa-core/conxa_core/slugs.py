"""Shared slug length limits for cloud publish and local bundle paths."""

from __future__ import annotations

MAX_SLUG_LEN = 64


def fit_slug(base: str, suffix: str, sep: str, max_len: int = MAX_SLUG_LEN) -> str:
    """Join ``base``, ``sep``, and ``suffix`` with ``base`` truncated so the total fits."""
    if not suffix:
        return base[:max_len]
    room = max_len - len(sep) - len(suffix)
    if room < 1:
        return suffix[:max_len]
    trimmed = base[:room]
    if sep == "-":
        trimmed = trimmed.rstrip("-")
    elif sep == "_":
        trimmed = trimmed.rstrip("_")
    if not trimmed:
        return suffix[:max_len]
    return f"{trimmed}{sep}{suffix}"
