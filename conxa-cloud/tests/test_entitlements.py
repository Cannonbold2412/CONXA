from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from conxa_core.config import settings
from conxa_core.db import db_set
from app.main import app
from app.services import llm_metering
from app.services.entitlements import current_period, usage_key
from app.services.saas import Principal, upsert_billing

client = TestClient(app)
STUDIO_HEADER = {"X-Conxa-Client": settings.llm_proxy_client_header}


def _set_plan(plan: str, **limits: object) -> None:
    patch: dict[str, object] = {"plan": plan}
    if limits:
        patch["entitlement_overrides"] = limits
    upsert_billing("wrk_local", patch)


def test_basic_plan_maps_to_starter(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    _set_plan("basic")

    r = client.get("/api/v1/entitlements/current")

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["plan"] == "starter"
    assert body["meters"]["seats"]["limit"] == 3
    assert body["meters"]["machines"]["limit"] == 3
    assert body["meters"]["compile_credits"]["limit"] == 200
    assert body["meters"]["human_edit_tokens"]["limit"] == 2_500_000
    assert body["capabilities"]["distribution"] == "external"
    assert body["capabilities"]["white_label"] is False
    assert body["capabilities"]["ops_tier"] == "basic"


def test_paid_usage_window_follows_razorpay_payment_date(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    upsert_billing(
        "wrk_local",
        {
            "plan": "starter",
            "current_period_end": 1893456000,
        },
    )
    db_set(
        "entitlement_usage",
        usage_key("wrk_local", "billing:1893456000"),
        {
            "workspace_id": "wrk_local",
            "period": "billing:1893456000",
            "compile_credits_used": 7,
        },
    )

    r = client.get("/api/v1/entitlements/current")

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["period"] == "billing:1893456000"
    assert body["reset_at"] == "2030-01-01T00:00:00Z"
    assert body["meters"]["compile_credits"]["used"] == 7


def test_compile_reserve_commit_release_idempotency(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "entitlements_enforce_compile", True)
    _set_plan("free")

    body = {
        "reservation_id": "cmp_test_one",
        "workflow_id": "wf_1",
        "session_id": "sess_1",
    }
    first = client.post("/api/v1/usage/compile/reserve", json=body)
    duplicate = client.post("/api/v1/usage/compile/reserve", json=body)
    commit = client.post("/api/v1/usage/compile/commit", json={"reservation_id": "cmp_test_one"})
    duplicate_commit = client.post("/api/v1/usage/compile/commit", json={"reservation_id": "cmp_test_one"})
    release_after_commit = client.post("/api/v1/usage/compile/release", json={"reservation_id": "cmp_test_one"})

    assert first.status_code == 200, first.text
    assert duplicate.status_code == 200, duplicate.text
    assert first.json()["remaining_compile_credits"] == 24
    assert duplicate.json()["remaining_compile_credits"] == 24
    assert commit.status_code == 200, commit.text
    assert duplicate_commit.status_code == 200, duplicate_commit.text
    assert release_after_commit.status_code == 200, release_after_commit.text
    assert release_after_commit.json()["status"] == "committed"

    entitlements = client.get("/api/v1/entitlements/current").json()
    assert entitlements["meters"]["compile_credits"]["used"] == 1
    assert entitlements["meters"]["compile_credits"]["remaining"] == 24


def test_compile_reserve_blocks_last_credit_concurrently(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "entitlements_enforce_compile", True)
    _set_plan("free", compile_credits=1)

    first = client.post("/api/v1/usage/compile/reserve", json={"reservation_id": "cmp_last_1"})
    second = client.post("/api/v1/usage/compile/reserve", json={"reservation_id": "cmp_last_2"})

    assert first.status_code == 200, first.text
    assert second.status_code == 402
    assert second.json()["detail"] == "compile_credit_limit_exceeded"


def test_expired_reservation_is_ignored(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "entitlements_enforce_compile", True)
    _set_plan("free", compile_credits=1)
    period = current_period()
    db_set(
        "compile_reservations",
        "cmp_expired",
        {
            "reservation_id": "cmp_expired",
            "workspace_id": "wrk_local",
            "period": period,
            "amount": 1,
            "status": "reserved",
            "expires_at": 1,
        },
    )

    reserve = client.post("/api/v1/usage/compile/reserve", json={"reservation_id": "cmp_after_expired"})

    assert reserve.status_code == 200, reserve.text
    assert reserve.json()["remaining_compile_credits"] == 0


def test_human_edit_pool_blocks_when_exhausted(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "entitlements_enforce_human_edit", True)
    _set_plan("free", human_edit_tokens=5)
    period = current_period()
    db_set(
        "entitlement_usage",
        usage_key("wrk_local", period),
        {
            "workspace_id": "wrk_local",
            "period": period,
            "human_edit_input_tokens": 5,
            "human_edit_output_tokens": 0,
        },
    )

    r = client.post(
        "/api/v1/llm/proxy/text",
        json={"task": "selector_repair", "payload": {"prompt": "x"}, "usage_class": "human_edit"},
        headers=STUDIO_HEADER,
    )

    assert r.status_code == 402
    assert r.json()["detail"] == "human_edit_pool_exceeded"


def test_compile_llm_usage_does_not_consume_human_edit_pool(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    _set_plan("free")
    from app.api import llm_proxy_routes

    class FakeRouter:
        def route_text(self, task, payload, timeout_ms, *, error_detail=None, pool=None):
            return {"text": "ok"}

    before = llm_metering.get_usage("wrk_local")["requests"]
    monkeypatch.setattr(llm_proxy_routes, "get_router", lambda: FakeRouter())
    r = client.post(
        "/api/v1/llm/proxy/text",
        json={"task": "intent", "payload": {"prompt": "hello"}, "usage_class": "compile"},
        headers=STUDIO_HEADER,
    )

    assert r.status_code == 200, r.text
    assert llm_metering.get_usage("wrk_local")["requests"] == before + 1
    entitlements = client.get("/api/v1/entitlements/current").json()
    assert entitlements["meters"]["human_edit_tokens"]["used"] == 0


def test_installer_upload_duplicate_version_rejected_but_new_slug_allowed(monkeypatch, tmp_path):
    """There is no per-slug slot limit any more (removed 2026-08-08) — a
    workspace may publish under unlimited slugs on any plan. Only the
    per-version duplicate-upload guard, and the internal/external distribution
    gate (see test_distribution_gating_on_installer_upload below), remain."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    _set_plan("free")

    first = client.post(
        "/api/v1/workflows/slug-one/installer/upload?filename=Setup.exe&version=1.0.0&release_notes=First",
        content=b"MZfirst",
    )
    duplicate = client.post(
        "/api/v1/workflows/slug-one/installer/upload?filename=Setup.exe&version=1.0.0&release_notes=Duplicate",
        content=b"MZduplicate",
    )
    update = client.post(
        "/api/v1/workflows/slug-one/installer/upload?filename=Setup.exe&version=1.0.1&release_notes=Second",
        content=b"MZsecond",
    )
    another_slug = client.post(
        "/api/v1/workflows/slug-two/installer/upload?filename=Setup.exe&version=1.0.0&release_notes=First",
        content=b"MZother",
    )

    assert first.status_code == 200, first.text
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "installer_version_exists"
    assert update.status_code == 200, update.text
    assert another_slug.status_code == 200, another_slug.text


def _publish(slug: str, version: str, skills: list[str]):
    return client.post(
        "/api/v1/workflows/publish",
        json={"slug": slug, "skill_pack_version": version, "skills": skills, "files": []},
    )


def test_downgrade_soft_locks_oldest_excess_workflows(monkeypatch, tmp_path):
    """A workspace that published up to its plan's cap, then downgrades to a
    lower cap, keeps every workflow it built — but only the newest N stay
    active. The rest are locked (not deleted) until it upgrades again, and
    republishing a locked workflow, or publishing a brand-new one past the
    cap, is blocked."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "entitlements_enforce_compile", True)
    _set_plan("free", compile_credits=2)

    first = _publish("acme", "1.0.0", ["wf1"])
    second = _publish("acme", "1.0.1", ["wf1", "wf2"])
    over_cap = _publish("acme", "1.0.2", ["wf1", "wf2", "wf3"])

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert over_cap.status_code == 402, over_cap.text
    assert over_cap.json()["detail"] == "workflow_limit_exceeded"

    entitlements = client.get("/api/v1/entitlements/current").json()
    assert entitlements["workflow_lock"]["active"] == 2
    assert entitlements["workflow_lock"]["locked"] == 0

    # Downgrade below the current workflow count.
    _set_plan("free", compile_credits=1)

    entitlements = client.get("/api/v1/entitlements/current").json()
    assert entitlements["workflow_lock"]["active"] == 1
    assert entitlements["workflow_lock"]["locked"] == 1
    locked_ids = {
        row["workflow_id"] for row in entitlements["workflow_lock"]["workflows"] if row["locked"]
    }
    assert locked_ids == {"wf1"}  # oldest published stays locked, wf2 (newer) stays active

    republish_locked = _publish("acme", "1.0.3", ["wf1"])
    republish_active = _publish("acme", "1.0.4", ["wf2"])

    assert republish_locked.status_code == 402, republish_locked.text
    assert republish_locked.json()["detail"] == "workflow_locked"
    assert republish_active.status_code == 200, republish_active.text

    # Upgrading again reopens room and unlocks the oldest workflow back up.
    _set_plan("free", compile_credits=2)
    entitlements = client.get("/api/v1/entitlements/current").json()
    assert entitlements["workflow_lock"]["locked"] == 0
    assert entitlements["workflow_lock"]["active"] == 2


def test_distribution_gating_on_installer_upload(monkeypatch, tmp_path):
    """Free builds internal-only installers; Starter/Pro/Enterprise may
    distribute externally (Starter's volume is naturally bounded by its
    compile-credit ceiling, not a distribution flag). Custom branding is
    Enterprise-only. Enforced server-side in
    publish_routes._upload_installer_impl, not just UI-hidden."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "entitlements_enforce_distribution", True)
    _set_plan("free")

    internal_ok = client.post(
        "/api/v1/workflows/dist-one/installer/upload?filename=Setup.exe&version=1.0.0&release_notes=x",
        content=b"MZinternal",
    )
    external_blocked = client.post(
        "/api/v1/workflows/dist-two/installer/upload?filename=Setup.exe&version=1.0.0&release_notes=x&distribution=external",
        content=b"MZexternal",
    )

    assert internal_ok.status_code == 200, internal_ok.text
    assert external_blocked.status_code == 402
    assert external_blocked.json()["detail"] == "distribution_not_permitted"

    _set_plan("starter")
    starter_external_ok = client.post(
        "/api/v1/workflows/dist-starter/installer/upload?filename=Setup.exe&version=1.0.0&release_notes=x&distribution=external",
        content=b"MZstarterexternal",
    )
    assert starter_external_ok.status_code == 200, starter_external_ok.text

    _set_plan("pro")
    external_ok = client.post(
        "/api/v1/workflows/dist-three/installer/upload?filename=Setup.exe&version=1.0.0&release_notes=x&distribution=external",
        content=b"MZexternal2",
    )
    white_label_blocked = client.post(
        "/api/v1/workflows/dist-four/installer/upload"
        "?filename=Setup.exe&version=1.0.0&release_notes=x&distribution=external&white_label=true",
        content=b"MZbranded",
    )

    assert external_ok.status_code == 200, external_ok.text
    assert white_label_blocked.status_code == 402
    assert white_label_blocked.json()["detail"] == "white_label_not_permitted"

    _set_plan("enterprise", distribution="external", white_label=True)
    white_label_ok = client.post(
        "/api/v1/workflows/dist-five/installer/upload"
        "?filename=Setup.exe&version=1.0.0&release_notes=x&distribution=external&white_label=true",
        content=b"MZbranded2",
    )
    assert white_label_ok.status_code == 200, white_label_ok.text


def test_machine_limit_blocks_new_device_but_allows_known_one(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    from app.services.entitlements import EntitlementError, ensure_machine_slot

    _set_plan("free")  # free's machine limit is 1
    principal = Principal(
        user_id="u1", workspace_id="wrk_local", workspace_slug="local", workspace_name="Local",
        role="owner", email=None, name=None, auth_provider="local",
    )

    first = ensure_machine_slot(principal, "machine-a", "10.0.0.1")
    assert first["used"] == 1

    with pytest.raises(EntitlementError) as exc_info:
        ensure_machine_slot(principal, "machine-b", "10.0.0.2")
    assert exc_info.value.code == "machine_limit_exceeded"

    # Re-registering the already-known machine keeps working — it doesn't
    # double-count against the limit.
    again = ensure_machine_slot(principal, "machine-a", "10.0.0.1")
    assert again["used"] == 1



def test_trial_expired_blocks_compile_but_not_sync(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "entitlements_enforce_compile", True)
    import time as time_mod

    upsert_billing("wrk_local", {"plan": "free", "trial_started_at": time_mod.time() - 31 * 86400})

    entitlements = client.get("/api/v1/entitlements/current")
    reserve = client.post("/api/v1/usage/compile/reserve", json={"reservation_id": "cmp_trial_expired"})

    assert entitlements.status_code == 200, entitlements.text
    assert entitlements.json()["trial_expired"] is True
    assert reserve.status_code == 402
    assert reserve.json()["detail"] == "trial_expired"


def test_ops_tier_gates_dashboard_and_drift_by_plan(monkeypatch, tmp_path):
    """Free: no dashboard at all. Starter ("basic"): runs list yes, drift no.
    Pro ("full"): everything. Mirrors the capability ladder in docs/PRD.md §11."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")

    _set_plan("free")
    free_dashboard = client.get("/api/v1/tracking/dashboard")
    assert free_dashboard.status_code == 403
    assert free_dashboard.json()["detail"] == "ops_tier_required"

    _set_plan("starter")
    starter_runs = client.get("/api/v1/tracking/some-company/runs")
    starter_drift = client.get("/api/v1/tracking/drift")
    assert starter_runs.status_code == 200, starter_runs.text
    assert starter_drift.status_code == 403
    assert starter_drift.json()["detail"] == "ops_tier_required"

    _set_plan("pro")
    pro_drift = client.get("/api/v1/tracking/drift")
    assert pro_drift.status_code == 200, pro_drift.text


def test_addon_compile_packs_stack_on_top_of_plan_credits(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    _set_plan("starter")  # 200 compile credits/mo base

    upsert_billing("wrk_local", {"addon_compile_packs": 2})
    entitlements = client.get("/api/v1/entitlements/current")

    assert entitlements.status_code == 200, entitlements.text
    assert entitlements.json()["meters"]["compile_credits"]["limit"] == 250  # 200 + 2*25


def test_development_plan_is_unlimited(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(settings, "entitlements_enforce_compile", True)
    _set_plan("development")

    entitlements = client.get("/api/v1/entitlements/current")
    reserve = client.post("/api/v1/usage/compile/reserve", json={"reservation_id": "cmp_dev"})

    assert entitlements.status_code == 200, entitlements.text
    assert entitlements.json()["meters"]["compile_credits"]["unlimited"] is True
    assert entitlements.json()["meters"]["machines"]["unlimited"] is True
    assert reserve.status_code == 200, reserve.text
    assert reserve.json()["remaining_compile_credits"] is None
