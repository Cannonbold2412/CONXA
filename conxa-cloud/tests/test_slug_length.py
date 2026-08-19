"""Workflow and company slugs must fit the cloud publish 64-char limit."""

from __future__ import annotations

from conxa_core.slugs import MAX_SLUG_LEN, fit_slug
from conxa_core.storage.workflow_store import create_workflow, get_workflow
from conxa_core.workspace import company_slug


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


def test_company_slug_long_name_within_limit():
    slug = company_slug("wrk_local", "Deploy a service on Render then visit frontend on Vercel")
    assert len(slug) <= MAX_SLUG_LEN
