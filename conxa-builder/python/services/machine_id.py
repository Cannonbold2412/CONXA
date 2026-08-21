"""Stable per-machine identifier sent as X-Conxa-Machine on cloud calls that
gate against the plan's machine limit (see docs/PRD.md §11 — the control that
keeps a single-machine free trial from becoming a free Pro seat).

Reads Windows' own MachineGuid, which survives reinstalls of Conxa itself and
even OS reinstalls-in-place, and is never reused across two different physical
or virtual machines. Only the SHA-256 hash ever leaves this machine — the raw
GUID is not something we want to collect or transmit.
"""

from __future__ import annotations

import hashlib
import winreg

_CACHE: str | None = None


def get_machine_id_hash() -> str:
    """Returns a stable, opaque hash for this machine, or "" if it can't be
    read (non-Windows, locked-down registry). An empty result means the
    caller sends no X-Conxa-Machine header and machine-limit enforcement is
    skipped for that request — fails open, matching every other quota check
    in this codebase when the signal is unavailable."""
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            guid = winreg.QueryValueEx(key, "MachineGuid")[0]
        _CACHE = hashlib.sha256(str(guid).encode("utf-8")).hexdigest()
    except OSError:
        _CACHE = ""
    return _CACHE
