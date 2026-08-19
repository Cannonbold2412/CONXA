"""Release-system tests: immutable versions, the publish/release split, the
stable channel pointer, rollback, release-lifecycle audit events, and
deterministic diff — all scoped per skill (see the per-skill publishing
architecture: 1 Workflow = 1 Skill = 1 Skill Package = 1 independent version
history = 1 independent release).

Publish and Release/Deploy are two separate transactions (docs/App-Flow.md):
publish (`_publish` below) uploads an immutable, versioned artifact and
leaves it "ready" — it never moves the stable channel or touches anything a
runtime's delta sync reads. Release (`_release` below) is the only thing that
does: a Cloud-only, admin-gated action that activates a "ready" version.
Tests that only care about the end state after activation use
`_publish_and_release`; tests about the split itself call `_publish` and
`_release` separately.

Covers the 15 backend cases from the release-system plan, plus per-skill
isolation cases proving one skill's publish/test/rollback never touches
another's. Follows the existing TestClient + monkeypatch(settings.data_dir,
tmp_path) pattern used throughout this test suite (see
test_llm_proxy_and_publish.py).
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from conxa_core.config import settings
from conxa_core.db import db_get
from app.main import app
from app.api import publish_routes, release_routes
from app.services import release_channel, release_diff

client = TestClient(app)


def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def _files(marker: str, *, extra: dict[str, str] | None = None) -> list[dict]:
    """A minimal but varying artifact for one skill's own files — never
    includes pack.json (that's company-level static config, excluded from
    per-skill snapshots — see skillpack_storage.write_release_snapshot)."""
    out = [{"path": "execution.json", "content_base64": _b64(f'[{{"marker":"{marker}"}}]')}]
    if extra:
        for path, content in extra.items():
            out.append({"path": path, "content_base64": _b64(content)})
    return out


def _publish(
    slug: str,
    skill_slug: str,
    version: str,
    marker: str,
    *,
    group_id: str = "_default",
    extra: dict[str, str] | None = None,
):
    """Upload only — leaves the version "ready", never moves the stable
    channel. See release_routes.post_release_release for activation."""
    return client.post(
        "/api/v1/workflows/publish",
        json={
            "slug": slug,
            "skill_slug": skill_slug,
            "group_id": group_id,
            "display_name": slug.title(),
            "skill_pack_version": version,
            "release_notes": f"release {version}",
            "files": _files(marker, extra=extra),
        },
    )


def _release(slug: str, skill_slug: str, version: str):
    """Activate an already-"ready" version — the only thing that moves the
    stable channel and makes it runtime-visible."""
    return client.post(f"/api/v1/workflows/v2/{slug}/releases/{version}/release?skill_slug={skill_slug}")


def _publish_and_release(
    slug: str,
    skill_slug: str,
    version: str,
    marker: str,
    *,
    group_id: str = "_default",
    extra: dict[str, str] | None = None,
):
    """Convenience for tests that only care about the state after a version
    is live — publish immediately followed by release."""
    p = _publish(slug, skill_slug, version, marker, group_id=group_id, extra=extra)
    assert p.status_code == 200, p.text
    r = _release(slug, skill_slug, version)
    assert r.status_code == 200, r.text
    return r


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")


# ---------------------------------------------------------------------------
# 0: the publish/release split itself
# ---------------------------------------------------------------------------

def test_publish_alone_leaves_the_version_ready_and_never_moves_stable():
    r = _publish("acme-split1", "deploy", "1.0.0", "v1")
    assert r.status_code == 200, r.text
    assert release_channel.get_stable_version("acme-split1", "deploy") is None
    row = db_get(publish_routes.skillpack_versions_ns("acme-split1", "deploy"), "1.0.0")
    assert row["status"] == "ready"


def test_release_activates_a_ready_version():
    _publish("acme-split2", "deploy", "1.0.0", "v1")
    r = _release("acme-split2", "deploy", "1.0.0")
    assert r.status_code == 200, r.text
    assert release_channel.get_stable_version("acme-split2", "deploy") == "1.0.0"
    row = db_get(publish_routes.skillpack_versions_ns("acme-split2", "deploy"), "1.0.0")
    assert row["status"] == "published"
    assert row["is_latest"] is True


def test_release_requires_a_ready_version():
    _publish_and_release("acme-split3", "deploy", "1.0.0", "v1")
    # Already "published" — cannot be released again.
    r = _release("acme-split3", "deploy", "1.0.0")
    assert r.status_code == 400
    assert r.json()["detail"] == "release_not_ready"

    r2 = _release("acme-split3", "deploy", "9.9.9")
    assert r2.status_code == 404


# ---------------------------------------------------------------------------
# 1-2: immutable versions
# ---------------------------------------------------------------------------

def test_first_publish_creates_1_0_0_and_becomes_stable_once_released():
    r = _publish_and_release("acme-rel", "deploy", "1.0.0", "v1")
    assert r.status_code == 200, r.text
    assert release_channel.get_stable_version("acme-rel", "deploy") == "1.0.0"


def test_second_publish_creates_a_new_immutable_version():
    _publish_and_release("acme-rel2", "deploy", "1.0.0", "v1")
    r = _publish_and_release("acme-rel2", "deploy", "1.1.0", "v2")
    assert r.status_code == 200, r.text
    assert release_channel.get_stable_version("acme-rel2", "deploy") == "1.1.0"

    versions = client.get(
        "/api/v1/workflows/v2/acme-rel2/skill-packs/versions?skill_slug=deploy"
    ).json()["versions"]
    assert {v["version"] for v in versions} == {"1.0.0", "1.1.0"}


def test_published_version_cannot_be_overwritten():
    _publish_and_release("acme-rel3", "deploy", "1.0.0", "v1")
    r = client.post(
        "/api/v1/workflows/publish",
        json={
            "slug": "acme-rel3",
            "skill_slug": "deploy",
            "skill_pack_version": "1.0.0",
            "files": _files("different-content"),
        },
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "skill_pack_version_exists"


def test_ready_version_can_be_republished_before_release():
    """Retrying the same version number is safe as long as it was never
    activated — this is what makes a crashed/interrupted publish retryable."""
    _publish("acme-rel3b", "deploy", "1.0.0", "v1")
    r = _publish("acme-rel3b", "deploy", "1.0.0", "v1-retry")
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# 3-4: transactional release
# ---------------------------------------------------------------------------

def test_failed_release_does_not_change_stable(monkeypatch):
    _publish_and_release("acme-rel4", "deploy", "1.0.0", "v1")
    assert release_channel.get_stable_version("acme-rel4", "deploy") == "1.0.0"
    _publish("acme-rel4", "deploy", "1.1.0", "v2")

    def _boom(*_a, **_kw):
        raise RuntimeError("disk full")

    monkeypatch.setattr(release_routes, "write_mutable_mirror_files", _boom)
    unraising_client = TestClient(app, raise_server_exceptions=False)
    r = unraising_client.post("/api/v1/workflows/v2/acme-rel4/releases/1.1.0/release?skill_slug=deploy")
    assert r.status_code == 500

    # Stable is untouched, and the attempted version is left "ready" (safe to retry).
    assert release_channel.get_stable_version("acme-rel4", "deploy") == "1.0.0"
    row = db_get(publish_routes.skillpack_versions_ns("acme-rel4", "deploy"), "1.1.0")
    assert row["status"] == "ready"

    events = release_channel.list_release_events("acme-rel4", "deploy")
    actions = [e["action"] for e in events]
    assert "release_failed" in actions
    assert "stable_channel_changed" not in actions or actions.index("release_failed") < actions.index(
        "stable_channel_changed"
    )


def test_successful_release_and_retry_after_failure_succeeds(monkeypatch):
    from app.api.skillpack_storage import write_mutable_mirror_files as _real_write_mutable_mirror_files

    _publish_and_release("acme-rel5", "deploy", "1.0.0", "v1")
    _publish("acme-rel5", "deploy", "1.1.0", "v2")

    def _boom(*_a, **_kw):
        raise RuntimeError("disk full")

    monkeypatch.setattr(release_routes, "write_mutable_mirror_files", _boom)
    unraising_client = TestClient(app, raise_server_exceptions=False)
    failed = unraising_client.post("/api/v1/workflows/v2/acme-rel5/releases/1.1.0/release?skill_slug=deploy")
    assert failed.status_code == 500
    assert release_channel.get_stable_version("acme-rel5", "deploy") == "1.0.0"

    # Restore the patched attribute directly rather than monkeypatch.undo() —
    # undo() reverts every patch made through this test's (function-scoped,
    # shared-by-name) monkeypatch fixture, including the autouse _isolate
    # fixture's settings.data_dir/database_url patches.
    monkeypatch.setattr(release_routes, "write_mutable_mirror_files", _real_write_mutable_mirror_files)
    retried = _release("acme-rel5", "deploy", "1.1.0")
    assert retried.status_code == 200, retried.text
    assert release_channel.get_stable_version("acme-rel5", "deploy") == "1.1.0"


# ---------------------------------------------------------------------------
# 5-7: rollback
# ---------------------------------------------------------------------------

def test_rollback_changes_stable_pointer_without_mutating_old_versions():
    _publish_and_release("acme-rel6", "deploy", "1.0.0", "v1")
    _publish_and_release("acme-rel6", "deploy", "1.1.0", "v2")
    assert release_channel.get_stable_version("acme-rel6", "deploy") == "1.1.0"

    before = db_get(publish_routes.skillpack_versions_ns("acme-rel6", "deploy"), "1.1.0")

    r = client.post("/api/v1/workflows/v2/acme-rel6/releases/1.0.0/rollback?skill_slug=deploy")
    assert r.status_code == 200, r.text
    assert release_channel.get_stable_version("acme-rel6", "deploy") == "1.0.0"

    after = db_get(publish_routes.skillpack_versions_ns("acme-rel6", "deploy"), "1.1.0")
    assert after["artifact_sha256"] == before["artifact_sha256"]
    assert after["status"] == "published"  # untouched, not deleted or reverted

    # The rolled-back-from version becomes superseded (derived: not the channel target).
    assert after["is_latest"] is False
    rolled_to = db_get(publish_routes.skillpack_versions_ns("acme-rel6", "deploy"), "1.0.0")
    assert rolled_to["is_latest"] is True


def test_rollback_to_unavailable_release_is_rejected():
    _publish_and_release("acme-rel7", "deploy", "1.0.0", "v1")
    r = client.post("/api/v1/workflows/v2/acme-rel7/releases/9.9.9/rollback?skill_slug=deploy")
    assert r.status_code == 404


def test_rollback_when_already_stable_is_a_clean_no_op_rejection():
    _publish_and_release("acme-rel8", "deploy", "1.0.0", "v1")
    r = client.post("/api/v1/workflows/v2/acme-rel8/releases/1.0.0/rollback?skill_slug=deploy")
    assert r.status_code == 400
    assert r.json()["detail"] == "already_stable"


def test_rollback_rejects_a_version_that_was_never_released():
    _publish_and_release("acme-rel8b", "deploy", "1.0.0", "v1")
    _publish("acme-rel8b", "deploy", "1.1.0", "v2")  # ready, never released
    r = client.post("/api/v1/workflows/v2/acme-rel8b/releases/1.1.0/rollback?skill_slug=deploy")
    assert r.status_code == 400
    assert r.json()["detail"] == "release_not_published"


# ---------------------------------------------------------------------------
# 8-9: RBAC
# ---------------------------------------------------------------------------

def test_unauthorized_user_cannot_publish(monkeypatch):
    monkeypatch.setattr(settings, "api_proxy_shared_secret", "proxy-secret")
    r = client.post(
        "/api/v1/workflows/publish",
        json={"slug": "acme-rel9", "skill_slug": "deploy", "skill_pack_version": "1.0.0", "files": _files("v1")},
        headers={
            "x-conxa-proxy-secret": "proxy-secret",
            "x-conxa-user-id": "user_norole",
            "x-conxa-org-id": "org_norole",
        },
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "admin role required"


def test_unauthorized_user_cannot_release(monkeypatch):
    _publish("acme-rel9b", "deploy", "1.0.0", "v1")
    monkeypatch.setattr(settings, "api_proxy_shared_secret", "proxy-secret")
    r = client.post(
        "/api/v1/workflows/v2/acme-rel9b/releases/1.0.0/release?skill_slug=deploy",
        headers={
            "x-conxa-proxy-secret": "proxy-secret",
            "x-conxa-user-id": "user_norole",
            "x-conxa-org-id": "org_norole",
        },
    )
    assert r.status_code == 403
    assert release_channel.get_stable_version("acme-rel9b", "deploy") is None  # unaffected


def test_unauthorized_user_cannot_rollback(monkeypatch):
    _publish_and_release("acme-rel10", "deploy", "1.0.0", "v1")
    _publish_and_release("acme-rel10", "deploy", "1.1.0", "v2")

    monkeypatch.setattr(settings, "api_proxy_shared_secret", "proxy-secret")
    r = client.post(
        "/api/v1/workflows/v2/acme-rel10/releases/1.0.0/rollback?skill_slug=deploy",
        headers={
            "x-conxa-proxy-secret": "proxy-secret",
            "x-conxa-user-id": "user_norole",
            "x-conxa-org-id": "org_norole",
        },
    )
    assert r.status_code == 403
    assert release_channel.get_stable_version("acme-rel10", "deploy") == "1.1.0"  # unaffected


# ---------------------------------------------------------------------------
# 10-11: audit
# ---------------------------------------------------------------------------

def test_audit_event_created_for_publish_and_release():
    _publish("acme-rel11", "deploy", "1.0.0", "v1")
    published_events = client.get(
        "/api/v1/workflows/v2/acme-rel11/releases/events?skill_slug=deploy"
    ).json()["events"]
    published_actions = [e["action"] for e in published_events]
    assert "skill_publish_succeeded" in published_actions
    assert "stable_channel_changed" not in published_actions  # publish never activates

    _release("acme-rel11", "deploy", "1.0.0")
    released_events = client.get(
        "/api/v1/workflows/v2/acme-rel11/releases/events?skill_slug=deploy"
    ).json()["events"]
    released_actions = [e["action"] for e in released_events]
    assert "release_succeeded" in released_actions
    assert "stable_channel_changed" in released_actions


def test_audit_event_created_for_rollback():
    _publish_and_release("acme-rel12", "deploy", "1.0.0", "v1")
    _publish_and_release("acme-rel12", "deploy", "1.1.0", "v2")
    client.post("/api/v1/workflows/v2/acme-rel12/releases/1.0.0/rollback?skill_slug=deploy")

    events = client.get("/api/v1/workflows/v2/acme-rel12/releases/events?skill_slug=deploy").json()["events"]
    actions = [e["action"] for e in events]
    assert "rollback_started" in actions
    assert "rollback_completed" in actions


# ---------------------------------------------------------------------------
# 12: artifact integrity
# ---------------------------------------------------------------------------

def test_artifact_sha256_is_validated():
    import hashlib

    _publish("acme-rel13", "deploy", "1.0.0", "v1")
    detail = client.get("/api/v1/workflows/v2/acme-rel13/releases/1.0.0?skill_slug=deploy").json()
    exec_file = next(f for f in detail["files"] if f["path"] == "execution.json")
    expected = hashlib.sha256(b'[{"marker":"v1"}]').hexdigest()
    assert exec_file["sha256"] == expected


# ---------------------------------------------------------------------------
# 13: version history ordering
# ---------------------------------------------------------------------------

def test_version_history_returns_correct_ordering():
    _publish("acme-rel14", "deploy", "1.0.0", "v1")
    _publish("acme-rel14", "deploy", "1.1.0", "v2")
    _publish("acme-rel14", "deploy", "1.2.0", "v3")

    versions = client.get(
        "/api/v1/workflows/v2/acme-rel14/skill-packs/versions?skill_slug=deploy"
    ).json()["versions"]
    assert [v["version"] for v in versions] == ["1.2.0", "1.1.0", "1.0.0"]


# ---------------------------------------------------------------------------
# 14: deterministic diff
# ---------------------------------------------------------------------------

def test_diff_is_deterministic():
    prev = {
        "grp/skill_a/execution.json": b'[{"type":"click","selector":"#a"}]',
        "grp/skill_a/recovery.json": b'{"rules":[]}',
    }
    curr = {
        "grp/skill_a/execution.json": b'[{"type":"click","selector":"#a"},{"type":"click","selector":"#b"}]',
        "grp/skill_a/recovery.json": b'{"rules":["r1"]}',
    }
    result1 = release_diff.compute_diff(prev, curr)
    result2 = release_diff.compute_diff(prev, curr)
    assert result1 == result2
    assert result1["steps_added"] == 1
    assert result1["recovery_changed_skills"] == ["skill_a"]


def test_diff_endpoint_matches_preview_before_publishing():
    # Baseline content lives under grp/deploy/ (the path release_diff's
    # _index_by_skill actually attributes to the "deploy" skill) so the
    # published-release diff and the pre-publish preview diff compare the
    # same file, not the baseline's unrelated root-level execution.json.
    # Released (not just published) so it's the previous PUBLISHED release
    # get_release_diff compares the next version against.
    _publish_and_release("acme-rel15", "deploy", "1.0.0", "v1", group_id="grp", extra={"grp/deploy/execution.json": "[]"})

    preview = client.post(
        "/api/v1/workflows/v2/acme-rel15/releases/preview",
        json={
            "version": "1.1.0",
            "skill_slug": "deploy",
            "group_id": "grp",
            "files": _files("v2", extra={"grp/deploy/execution.json": '[{"type":"click","selector":"#x"}]'}),
        },
    ).json()
    assert preview["diff"]["steps_added"] == 1

    _publish_and_release(
        "acme-rel15", "deploy", "1.1.0", "v2", group_id="grp",
        extra={"grp/deploy/execution.json": '[{"type":"click","selector":"#x"}]'},
    )
    published_diff = client.get(
        "/api/v1/workflows/v2/acme-rel15/releases/1.1.0/diff?skill_slug=deploy"
    ).json()
    assert published_diff["available"] is True
    assert published_diff["steps_added"] == preview["diff"]["steps_added"]


# ---------------------------------------------------------------------------
# 15: runtime desired version follows the channel, not the publish
# ---------------------------------------------------------------------------

def test_runtime_desired_version_follows_release_not_publish():
    _publish("acme-rel16", "deploy", "1.0.0", "v1", extra={"_default/deploy/execution.json": '["step-a"]'})

    # Publish alone must never make the skill runtime-visible.
    delta = client.get("/api/v1/skill-packs/acme-rel16/delta?since=%7B%7D").json()
    assert next((s for s in delta["skills"] if s["name"] == "deploy"), None) is None

    _release("acme-rel16", "deploy", "1.0.0")
    delta_after_release = client.get("/api/v1/skill-packs/acme-rel16/delta?since=%7B%7D").json()
    deploy = next(s for s in delta_after_release["skills"] if s["name"] == "deploy")
    assert deploy["version"] == "1.0.0"

    # A second publish stays invisible to runtimes until it, too, is released.
    _publish("acme-rel16", "deploy", "1.1.0", "v2", extra={"_default/deploy/execution.json": '["step-b"]'})
    delta_still_old = client.get("/api/v1/skill-packs/acme-rel16/delta?since=%7B%7D").json()
    deploy_still_old = next(s for s in delta_still_old["skills"] if s["name"] == "deploy")
    assert deploy_still_old["version"] == "1.0.0"

    _release("acme-rel16", "deploy", "1.1.0")
    delta = client.get("/api/v1/skill-packs/acme-rel16/delta?since=%7B%7D").json()
    deploy = next(s for s in delta["skills"] if s["name"] == "deploy")
    assert deploy["version"] == "1.1.0"

    client.post("/api/v1/workflows/v2/acme-rel16/releases/1.0.0/rollback?skill_slug=deploy")
    delta_after = client.get("/api/v1/skill-packs/acme-rel16/delta?since=%7B%7D").json()
    deploy_after = next(s for s in delta_after["skills"] if s["name"] == "deploy")
    assert deploy_after["version"] == "1.0.0"
    file_entry = next(f for f in deploy_after["files"] if f["path"] == "execution.json")
    assert base64.b64decode(file_entry["content_base64"]) == b'["step-a"]'


# ---------------------------------------------------------------------------
# 16-18: per-skill isolation — the fix this architecture exists for
# ---------------------------------------------------------------------------

def test_new_skill_first_publish_needs_no_previous_version():
    """A brand-new skill publishes v1.0.0 with no previous-version requirement,
    independent of whatever else has already been published under this slug."""
    _publish_and_release("acme-rel17", "existing-skill", "1.0.0", "v1")
    r = _publish_and_release("acme-rel17", "brand-new-skill", "1.0.0", "v1")
    assert r.status_code == 200, r.text
    assert release_channel.get_stable_version("acme-rel17", "brand-new-skill") == "1.0.0"


def test_publishing_one_skill_never_touches_a_siblings_version_or_stable_pointer():
    """The bug this fix addresses: publishing "Create a Lead" must never
    require, version-bump, or move the stable pointer of "Update Opportunity"."""
    _publish_and_release("acme-rel18", "update-opportunity", "1.0.0", "opp-v1")
    _publish_and_release("acme-rel18", "create-a-lead", "1.0.0", "lead-v1")

    # Publishing create-a-lead's v1.1.0 must not touch update-opportunity at all.
    r = _publish_and_release("acme-rel18", "create-a-lead", "1.1.0", "lead-v2")
    assert r.status_code == 200, r.text

    assert release_channel.get_stable_version("acme-rel18", "create-a-lead") == "1.1.0"
    assert release_channel.get_stable_version("acme-rel18", "update-opportunity") == "1.0.0"

    lead_versions = client.get(
        "/api/v1/workflows/v2/acme-rel18/skill-packs/versions?skill_slug=create-a-lead"
    ).json()["versions"]
    opp_versions = client.get(
        "/api/v1/workflows/v2/acme-rel18/skill-packs/versions?skill_slug=update-opportunity"
    ).json()["versions"]
    assert {v["version"] for v in lead_versions} == {"1.0.0", "1.1.0"}
    assert {v["version"] for v in opp_versions} == {"1.0.0"}


def test_rolling_back_one_skill_never_touches_a_siblings_files_or_version():
    _publish_and_release("acme-rel19", "skill-a", "1.0.0", "a-v1", extra={"_default/skill-a/execution.json": '["a-step-1"]'})
    _publish_and_release("acme-rel19", "skill-a", "1.1.0", "a-v2", extra={"_default/skill-a/execution.json": '["a-step-2"]'})
    _publish_and_release("acme-rel19", "skill-b", "1.0.0", "b-v1", extra={"_default/skill-b/execution.json": '["b-step-1"]'})

    client.post("/api/v1/workflows/v2/acme-rel19/releases/1.0.0/rollback?skill_slug=skill-a")

    assert release_channel.get_stable_version("acme-rel19", "skill-a") == "1.0.0"
    assert release_channel.get_stable_version("acme-rel19", "skill-b") == "1.0.0"  # untouched

    delta = client.get("/api/v1/skill-packs/acme-rel19/delta?since=%7B%7D").json()
    skill_b = next(s for s in delta["skills"] if s["name"] == "skill-b")
    b_file = next(f for f in skill_b["files"] if f["path"] == "execution.json")
    assert base64.b64decode(b_file["content_base64"]) == b'["b-step-1"]'


# ---------------------------------------------------------------------------
# Studio-synced groups (empty folders before first publish)
# ---------------------------------------------------------------------------

def test_put_group_shows_up_empty_on_get_and_rename_updates_name():
    gid = "11111111-1111-1111-1111-111111111111"
    r = client.put(
        f"/api/v1/workflows/v2/acme-g1/groups/{gid}",
        json={"group_name": "Sales", "company_name": "Acme"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"slug": "acme-g1", "group_id": gid, "group_name": "Sales"}

    listed = client.get("/api/v1/workflows/v2/acme-g1/groups")
    assert listed.status_code == 200, listed.text
    groups = listed.json()["groups"]
    assert len(groups) == 1
    assert groups[0]["group_id"] == gid
    assert groups[0]["group_name"] == "Sales"
    assert groups[0]["workflows"] == []

    renamed = client.put(
        f"/api/v1/workflows/v2/acme-g1/groups/{gid}",
        json={"group_name": "Revenue"},
    )
    assert renamed.status_code == 200, renamed.text
    groups = client.get("/api/v1/workflows/v2/acme-g1/groups").json()["groups"]
    assert len(groups) == 1
    assert groups[0]["group_name"] == "Revenue"


def test_publish_attaches_to_existing_synced_group_without_duplicating():
    gid = "22222222-2222-2222-2222-222222222222"
    assert client.put(
        f"/api/v1/workflows/v2/acme-g2/groups/{gid}",
        json={"group_name": "Sales"},
    ).status_code == 200
    p = _publish("acme-g2", "create-a-lead", "1.0.0", "v1", group_id=gid)
    assert p.status_code == 200, p.text

    groups = client.get("/api/v1/workflows/v2/acme-g2/groups").json()["groups"]
    assert len(groups) == 1
    assert groups[0]["group_id"] == gid
    assert groups[0]["group_name"] == "Sales"
    assert [w["skill_slug"] for w in groups[0]["workflows"]] == ["create-a-lead"]


def test_get_groups_still_includes_skills_never_synced_as_a_group():
    p = _publish("acme-g3", "orphan", "1.0.0", "v1", group_id="legacy-grp")
    assert p.status_code == 200, p.text
    groups = client.get("/api/v1/workflows/v2/acme-g3/groups").json()["groups"]
    match = next(g for g in groups if g["group_id"] == "legacy-grp")
    assert [w["skill_slug"] for w in match["workflows"]] == ["orphan"]
