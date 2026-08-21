"""group_auth_status must derive readiness from stored fields alone — no
browser probe on the read path. See FIX.md: a probe used to run on every
Group Page open and could wedge the whole backend."""

from __future__ import annotations

import os
import sys
import time
from types import SimpleNamespace

_PY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "conxa-builder", "python")
sys.path.insert(0, os.path.abspath(_PY_DIR))

from conxa_core.models.workflow import GroupApp  # noqa: E402
from handlers.groups import group_auth_status  # noqa: E402


def _group(*apps: GroupApp) -> SimpleNamespace:
    return SimpleNamespace(id="grp", apps=list(apps))


def test_missing_app_has_no_captured_at() -> None:
    group = _group(GroupApp(id="a", name="A", login_url="https://x.test/login"))

    status = group_auth_status(group)

    assert status["apps"][0]["state"] == "missing"
    assert status["ready"] is False
    assert status["first_missing_app_id"] == "a"


def test_captured_app_with_no_error_is_ready() -> None:
    group = _group(
        GroupApp(id="a", name="A", login_url="https://x.test/login", captured_at=1.0, storage_state_path="s.json")
    )

    status = group_auth_status(group)

    assert status["apps"][0]["state"] == "ready"
    assert status["ready"] is True
    assert status["apps_authenticated"] == 1


def test_captured_app_with_last_error_is_expired() -> None:
    """This is how the recording gate's bounded probe (check_app_session_sync,
    called from cmd_start_recording) now surfaces a stale session — by writing
    last_error — rather than group_auth_status launching its own browser."""
    group = _group(
        GroupApp(
            id="a",
            name="A",
            login_url="https://x.test/login",
            captured_at=1.0,
            storage_state_path="s.json",
            last_error="Session expired — sign in again.",
        )
    )

    status = group_auth_status(group)

    assert status["apps"][0]["state"] == "expired"
    assert status["ready"] is False
    assert status["first_missing_app_id"] == "a"


def test_ready_app_with_no_checked_at_is_unverified() -> None:
    """A session file existing (state == "ready") is not the same claim as "a probe
    recently confirmed it works" — see group_auth_status's docstring. Never probed
    since capture must read as unverified, not silently trusted."""
    group = _group(
        GroupApp(id="a", name="A", login_url="https://x.test/login", captured_at=1.0, storage_state_path="s.json")
    )

    status = group_auth_status(group)

    assert status["apps"][0]["state"] == "ready"
    assert status["apps"][0]["verified"] is False


def test_ready_app_with_fresh_checked_at_is_verified() -> None:
    group = _group(
        GroupApp(
            id="a", name="A", login_url="https://x.test/login",
            captured_at=1.0, storage_state_path="s.json", checked_at=time.time(),
        )
    )

    status = group_auth_status(group)

    assert status["apps"][0]["verified"] is True


def test_ready_app_with_stale_checked_at_is_unverified() -> None:
    group = _group(
        GroupApp(
            id="a", name="A", login_url="https://x.test/login",
            captured_at=1.0, storage_state_path="s.json", checked_at=time.time() - 3600,
        )
    )

    status = group_auth_status(group)

    assert status["apps"][0]["verified"] is False
