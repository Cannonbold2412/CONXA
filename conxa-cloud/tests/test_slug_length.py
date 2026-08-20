"""Workflow slugs and workspace directory slugs are character-safe."""

from __future__ import annotations

from conxa_core.slugs import MAX_SLUG_LEN, fit_slug
from conxa_core.storage.workflow_store import create_workflow, get_workflow
from conxa_core.workspace import workspace_dir_slug


def test_fit_slug_caps_total_length():
    base = "deploy-a-service-on-render-then-visit-frontend-on-vercel"
    suffix = "cbbe58e4"
    slug = fit_slug(base, suffix, "-")
    assert len(slug) <= MAX_SLUG_LEN
    assert slug.endswith(f"-{suffix}")


def test_create_workflow_slug_within_limit(monkeypatch, tmp_path):
    from conxa_core import db
    from conxa_core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(db, "_engine", None)

    wf = create_workflow(
        "Deploy a service on Render then visit frontend on Vercel",
        "https://example.test",
    )
    assert len(wf.slug) <= MAX_SLUG_LEN
    assert get_workflow(wf.id).slug == wf.slug


def test_workspace_dir_slug_character_safety():
    """workspace_dir_slug transforms arbitrary workspace_id into filesystem-safe."""
    test_cases = [
        ("wrk_local", "wrk_local"),
        ("wrk-customer-123", "wrk_customer_123"),
        ("WRK_CUSTOMER", "wrk_customer"),
        ("123workspace", "ws_123workspace"),  # digit-prefixed gets ws_ prefix
        ("wrk.company@example.com", "wrk_company_example_com"),
    ]
    for workspace_id, expected in test_cases:
        slug = workspace_dir_slug(workspace_id)
        assert slug == expected, f"workspace_dir_slug({workspace_id!r}) should be {expected!r}, got {slug!r}"
        # All slugs must be letter-prefixed
        assert slug[0].isalpha(), f"workspace_dir_slug({workspace_id!r}) not letter-prefixed: {slug}"
