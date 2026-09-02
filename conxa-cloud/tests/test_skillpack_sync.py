from __future__ import annotations

import unittest
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import app.api.skillpack_update_routes as sp


class RateLimitPersistenceTests(unittest.TestCase):
    """The sync rate limit must survive a process restart when a database is
    configured, so a runtime cannot bypass the 5-minute window by hitting a
    freshly-restarted (or newly scaled-out) app instance."""

    def test_rate_limit_persists_across_restart(self) -> None:
        store: dict[tuple[str, str], dict] = {}

        def fake_get(ns: str, key: str):
            return store.get((ns, key))

        def fake_set(ns: str, key: str, data: dict) -> None:
            store[(ns, key)] = data

        with (
            patch.object(sp, "using_database", return_value=True),
            patch.object(sp, "db_get", side_effect=fake_get),
            patch.object(sp, "db_set", side_effect=fake_set),
        ):
            # First sync records the timestamp in the KV store.
            sp._check_rate_limit("token-abc")
            # Simulate a restart / different instance: in-memory cache is gone,
            # but the KV entry survives.
            sp._rate_cache.clear()
            with self.assertRaises(HTTPException) as ctx:
                sp._check_rate_limit("token-abc")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_rate_limit_in_memory_fallback_without_database(self) -> None:
        sp._rate_cache.clear()
        with patch.object(sp, "using_database", return_value=False):
            sp._check_rate_limit("token-xyz")  # first call allowed
            with self.assertRaises(HTTPException) as ctx:
                sp._check_rate_limit("token-xyz")  # second within window blocked
        self.assertEqual(ctx.exception.status_code, 429)
        sp._rate_cache.clear()



class TestArtifactSync:
    """Recovery artifacts (recording-time screenshots) reach the customer's machine.

    They previously did not: the delta shipped a hardcoded five-JSON allow-list, so `visuals/`
    stayed in the cloud while `recovery.json` — which DID sync — carried a `visual_ref` pointing
    at it. Every install received a pointer to a file guaranteed never to arrive.
    """

    def _pack(self, tmp_path, *, slug="checkout", group="_default"):
        packs_dir = tmp_path / "ws-1"
        skill_dir = packs_dir / group / slug
        (skill_dir / "visuals").mkdir(parents=True)
        (packs_dir / "pack.json").write_text(
            f'{{"skills": ["{slug}"], "skill_groups": {{"{slug}": "{group}"}}, "version": "1"}}',
            encoding="utf-8",
        )
        for name in ("execution.json", "recovery.json", "manifest.json"):
            (skill_dir / name).write_text("{}", encoding="utf-8")
        (skill_dir / "visuals" / "Image_1.jpg").write_bytes(b"first-shot")
        (skill_dir / "visuals" / "Image_2.jpg").write_bytes(b"second-shot")
        return packs_dir, skill_dir

    def test_artifact_entries_lists_non_code_files_only(self, tmp_path):
        _packs, skill_dir = self._pack(tmp_path)
        entries = sp._artifact_entries(skill_dir)
        assert [e["path"] for e in entries] == ["visuals/Image_1.jpg", "visuals/Image_2.jpg"]
        # Code files ride the delta body inline; listing them here would double-ship them.
        assert not any(e["path"].endswith(".json") for e in entries)
        assert all(len(e["sha256"]) == 64 for e in entries)

    def test_delta_lists_artifacts_even_when_code_is_unchanged(self, tmp_path, monkeypatch):
        """A pack installed before artifact sync existed must be able to backfill its images
        without waiting for an unrelated republish."""
        packs_dir, _skill_dir = self._pack(tmp_path)
        monkeypatch.setattr(sp, "skill_packs_dir", lambda ws: packs_dir)
        monkeypatch.setattr(sp, "_ensure_skill_pack_on_disk", lambda ws: None)
        monkeypatch.setattr(sp, "_skill_version", lambda ws, slug: "7")

        delta = sp._build_delta("ws-1", {"checkout": "7"})  # client already has this version
        entry = delta["skills"][0]
        assert entry["action"] == "no_change"
        assert [a["path"] for a in entry["artifacts"]] == ["visuals/Image_1.jpg", "visuals/Image_2.jpg"]
        assert "files" not in entry, "no_change must still not re-ship the code"

    def test_archive_returns_only_the_hashes_the_machine_lacks(self, tmp_path, monkeypatch):
        import io as _io
        import zipfile as _zipfile

        packs_dir, skill_dir = self._pack(tmp_path)
        monkeypatch.setattr(sp, "skill_packs_dir", lambda ws: packs_dir)
        monkeypatch.setattr(sp, "_ensure_skill_pack_on_disk", lambda ws: None)
        monkeypatch.setattr(sp.settings, "auth_required", False)

        entries = sp._artifact_entries(skill_dir)
        first_sha = next(e["sha256"] for e in entries if e["path"].endswith("Image_1.jpg"))

        # First install: the store is empty, so everything comes back.
        resp = sp.get_skill_artifacts("v1", "ws-1", "checkout", sp.ArtifactRequest(have=[]), None)
        names = _zipfile.ZipFile(_io.BytesIO(resp.body)).namelist()
        assert sorted(names) == ["visuals/Image_1.jpg", "visuals/Image_2.jpg"]

        # Update: the machine already holds one hash, so only the other is sent. Same code path.
        resp = sp.get_skill_artifacts(
            "v1", "ws-1", "checkout", sp.ArtifactRequest(have=[first_sha]), None
        )
        assert _zipfile.ZipFile(_io.BytesIO(resp.body)).namelist() == ["visuals/Image_2.jpg"]

        # Nothing missing is an empty zip, not an error — the client just extracts nothing.
        resp = sp.get_skill_artifacts(
            "v1", "ws-1", "checkout",
            sp.ArtifactRequest(have=[e["sha256"] for e in entries]), None,
        )
        assert _zipfile.ZipFile(_io.BytesIO(resp.body)).namelist() == []

    def test_archive_ignores_unknown_hashes_and_publishes_its_own_checksum(self, tmp_path, monkeypatch):
        """The store is shared across every skill and workspace on the machine, so it
        legitimately holds hashes this skill never had. That is not an error."""
        import hashlib as _hashlib

        packs_dir, _skill_dir = self._pack(tmp_path)
        monkeypatch.setattr(sp, "skill_packs_dir", lambda ws: packs_dir)
        monkeypatch.setattr(sp, "_ensure_skill_pack_on_disk", lambda ws: None)
        monkeypatch.setattr(sp.settings, "auth_required", False)

        resp = sp.get_skill_artifacts(
            "v1", "ws-1", "checkout", sp.ArtifactRequest(have=["deadbeef" * 8]), None
        )
        assert resp.status_code == 200
        assert resp.headers["X-Artifact-Sha256"] == _hashlib.sha256(resp.body).hexdigest()

    def test_archive_is_not_rate_limited(self, tmp_path, monkeypatch):
        """The artifact pass runs immediately after the code files land — that is the point, so
        execution is never blocked on screenshots. The delta route's 5-minute-per-token window
        would refuse it every single time."""
        packs_dir, _skill_dir = self._pack(tmp_path)
        monkeypatch.setattr(sp, "skill_packs_dir", lambda ws: packs_dir)
        monkeypatch.setattr(sp, "_ensure_skill_pack_on_disk", lambda ws: None)
        monkeypatch.setattr(sp.settings, "auth_required", False)

        calls = []
        monkeypatch.setattr(sp, "_check_rate_limit", lambda token: calls.append(token))

        for _ in range(3):
            resp = sp.get_skill_artifacts("v1", "ws-1", "checkout", sp.ArtifactRequest(have=[]), None)
            assert resp.status_code == 200
        assert calls == [], "the artifact route must never consult the sync rate limiter"

    def test_unknown_skill_is_404_not_an_empty_zip(self, tmp_path, monkeypatch):
        packs_dir, _skill_dir = self._pack(tmp_path)
        monkeypatch.setattr(sp, "skill_packs_dir", lambda ws: packs_dir)
        monkeypatch.setattr(sp, "_ensure_skill_pack_on_disk", lambda ws: None)
        monkeypatch.setattr(sp.settings, "auth_required", False)

        with pytest.raises(HTTPException) as ctx:
            sp.get_skill_artifacts("v1", "ws-1", "not-a-skill", sp.ArtifactRequest(have=[]), None)
        assert ctx.value.status_code == 404


class TestArtifactRouteExemption:
    """The artifact route is a POST under /api/v1/workflows/, where the Clerk gate lives. It is
    sync-token authenticated like the delta beside it, so it must be exempt — and the exemption
    must not widen to the dashboard routes sharing that prefix."""

    def test_artifact_post_bypasses_clerk(self):
        from app.api.security import _is_public_path

        assert _is_public_path("/api/v1/workflows/v1/ws-1/skill-packs/checkout/artifacts", "POST")
        assert _is_public_path("/api/v1/workflows/v1/ws-1/tracking/events", "POST")

    def test_exemption_does_not_widen(self):
        from app.api.security import _is_public_path

        assert not _is_public_path("/api/v1/workflows/publish", "POST")
        assert not _is_public_path("/api/v1/workflows/v1/ws-1/skill-packs/checkout/artifacts", "GET")
        assert not _is_public_path("/api/v1/workflows/v1/ws-1/releases", "POST")

if __name__ == "__main__":
    unittest.main()
