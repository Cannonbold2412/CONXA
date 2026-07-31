"""_is_public_path must exempt the versioned runtime endpoints from the Clerk
gate without opening up plugin_routes.py's Clerk-protected dashboard endpoints,
which share the same /api/v1/plugins/ path segment."""

from __future__ import annotations

from app.api.security import _body_limit_for_path, _is_public_path
from conxa_core.config import settings


def test_unified_manifest_is_public():
    assert _is_public_path("/api/v1/manifest.json", "GET")


def test_versioned_skill_pack_delta_is_public():
    assert _is_public_path("/api/v1/plugins/v2/render/skill-packs/delta", "GET")


def test_versioned_tracking_events_is_public():
    assert _is_public_path("/api/v1/plugins/v2/render/tracking/events", "POST")


def test_legacy_skill_pack_delta_still_public():
    assert _is_public_path("/api/v1/skill-packs/render/delta", "GET")


def test_plugin_dashboard_routes_stay_protected():
    assert not _is_public_path("/api/v1/plugins", "GET")
    assert not _is_public_path("/api/v1/plugins", "POST")
    assert not _is_public_path("/api/v1/plugins/some-plugin-id", "GET")
    assert not _is_public_path("/api/v1/plugins/some-plugin-id", "DELETE")


def test_versioned_skill_pack_delta_wrong_method_not_public():
    assert not _is_public_path("/api/v1/plugins/v2/render/skill-packs/delta", "POST")


def test_versioned_tracking_events_wrong_method_not_public():
    assert not _is_public_path("/api/v1/plugins/v2/render/tracking/events", "GET")


def test_skill_pack_upload_gets_build_artifact_body_limit():
    # Skill packs (base64-encoded screenshots/DOM snapshots) routinely exceed the
    # generic 1MB JSON body cap — this path must use the 250MB build-artifact cap,
    # not fall through to max_json_body_bytes.
    path = "/api/v1/plugins/v2/render/skill-packs/upload"
    assert _body_limit_for_path(path) == settings.build_artifact_upload_max_bytes
    assert _body_limit_for_path(path) != settings.max_json_body_bytes
