"""Platform-tag derivation: visited_hosts captured at recording save time and
surfaced as per-workflow `used_apps` on the group page — the same matcher
(group_store.apps_for_workflow) that build-time required_apps uses, so the
card's chips can never disagree with runtime auth gating.

Covers the "Deploy a Service on Render then Visit frontend on Vercel" case:
one start URL on Render, a mid-recording navigation to Vercel — both apps
must show as tags before the first compile.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from conxa_core.config import settings
from conxa_core.storage import group_store, workflow_store

_PY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "conxa-builder", "python")
sys.path.insert(0, os.path.abspath(_PY_DIR))


@pytest.fixture()
def tmp_data_dir(tmp_path: Path):
    with (
        patch.object(settings, "data_dir", tmp_path),
        patch.object(settings, "database_url", ""),
    ):
        yield tmp_path


# ── extract_visited_hosts (recorder/session.py) ────────────────────────────────


def test_extract_visited_hosts_collects_page_and_tab_hosts():
    from conxa_compile.recorder.session import extract_visited_hosts

    events = [
        {"page": {"url": "https://dashboard.render.com/web/srv-1"}, "tab": None},
        {"page": {"url": "https://dashboard.render.com/web/srv-1/settings"}, "tab": None},
        {"page": {"url": "https://dashboard.render.com/web/srv-1"}, "tab": {"url": "https://vercel.com/new"}},
        {"page": {"url": "https://vercel.app/deployed-site"}, "tab": None},
    ]
    assert extract_visited_hosts(events) == [
        "dashboard.render.com",
        "vercel.app",
        "vercel.com",
    ]


def test_extract_visited_handles_bad_urls_and_empty_events():
    from conxa_compile.recorder.session import extract_visited_hosts

    assert extract_visited_hosts([]) == []
    events = [{"page": {"url": "not a url"}, "tab": {"url": ""}}, {"page": None}]
    assert extract_visited_hosts(events) == []


# ── Workflow.visited_hosts persistence ─────────────────────────────────────────


def test_visited_hosts_roundtrip_and_clear_on_recording_reset(tmp_data_dir):
    group = group_store.create_group("Deploys")
    wf = workflow_store.create_workflow(
        "Deploy Render + visit Vercel",
        "https://dashboard.render.com/web/srv-1",
        group_id=group.id,
    )
    wf.visited_hosts = ["vercel.com", "vercel.app"]
    workflow_store.save_workflow(wf)

    loaded = workflow_store.get_workflow(wf.id)
    assert loaded is not None
    assert loaded.visited_hosts == ["vercel.com", "vercel.app"]

    # A discarded/empty recording must not leave stale hosts feeding tag matching.
    cleared = workflow_store.clear_recording(wf.id)
    assert cleared is not None
    assert cleared.visited_hosts == []


# ── cmd_get_group.used_apps ────────────────────────────────────────────────────


@pytest.fixture()
def backend():
    spec = importlib.util.spec_from_file_location(
        "cbackend_tags", os.path.join(_PY_DIR, "backend.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out: list[dict] = []
    capture = lambda obj: out.append(obj)
    from handlers import protocol as _protocol

    mod._write = capture
    _protocol._write = capture
    return mod.Backend(), out


def test_get_group_used_apps_includes_every_touched_platform(tmp_data_dir, backend):
    b, out = backend
    group = group_store.create_group("Deploys")
    group_store.add_app(
        group.id, "Render",
        "https://dashboard.render.com/login", "https://dashboard.render.com/home",
    )
    group_store.add_app(
        group.id, "Vercel",
        "https://vercel.com/login", "https://vercel.com/{}",
    )
    wf = workflow_store.create_workflow(
        "Deploy a Service on Render then Visit frontend on Vercel",
        "https://dashboard.render.com/web/srv-1",
        "https://dashboard.render.com/",
        group_id=group.id,
    )
    # Recorded mid-flow navigation to Vercel — as if stop_recording had run.
    wf.visited_hosts = ["vercel.com", "vercel.app"]
    workflow_store.save_workflow(wf)

    b.dispatch({"id": "g1", "type": "get_group", "payload": {"group_id": group.id}})
    result = out[-1]
    assert result["type"] == "result"
    workflows = result["result"]["workflows"]
    assert len(workflows) == 1
    used_names = {a["name"] for a in workflows[0]["used_apps"]}
    assert used_names == {"Render", "Vercel"}


def test_get_group_used_apps_excludes_untouched_sibling_apps(tmp_data_dir, backend):
    """A workflow that never navigates to a sibling app must not grow its chip."""
    b, out = backend
    group = group_store.create_group("Deploys")
    group_store.add_app(
        group.id, "Render",
        "https://dashboard.render.com/login", "https://dashboard.render.com/home",
    )
    group_store.add_app(
        group.id, "Billing",
        "https://billing.example.com/login", "https://billing.example.com/home",
    )
    wf = workflow_store.create_workflow(
        "Deploy only",
        "https://dashboard.render.com/web/srv-1",
        group_id=group.id,
    )
    workflow_store.save_workflow(wf)

    b.dispatch({"id": "g2", "type": "get_group", "payload": {"group_id": group.id}})
    workflows = out[-1]["result"]["workflows"]
    used_names = {a["name"] for a in workflows[0]["used_apps"]}
    assert used_names == {"Render"}
