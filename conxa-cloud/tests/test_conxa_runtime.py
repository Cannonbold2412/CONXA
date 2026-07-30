"""Tests for conxa_compile/conxa_runtime.py (runtime dir resolution + skill-pack sync)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest


# ─── resolve_runtime_dir ───────────────────────────────────────────────────────

class TestResolveRuntimeDir:
    """resolve_runtime_dir() is identical for Dev and Production — no sys.frozen
    branching at all. Dev/Production isolation comes entirely from CONXA_STUDIO_HOME
    pointing at separate trees; scripts/build-runtime-local.ps1 writes into
    deps/conxa-runtime/ in Dev, exactly where a real download lands in Production."""

    def test_runtime_local_dir_used_when_set(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        runtime_dir = tmp_path / "runtime-v1.2.3"
        runtime_dir.mkdir()
        (runtime_dir / "conxa-runtime.exe").touch()
        monkeypatch.setenv("CONXA_RUNTIME_LOCAL_DIR", str(runtime_dir))
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))

        from conxa_compile.conxa_runtime import resolve_runtime_dir

        assert resolve_runtime_dir() == runtime_dir

    def test_runtime_local_dir_ignored_if_invalid(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CONXA_RUNTIME_LOCAL_DIR", str(tmp_path / "nonexistent"))
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))

        from conxa_compile.conxa_runtime import resolve_runtime_dir

        # Falls through to deps scan, which also finds nothing.
        assert resolve_runtime_dir() is None

    def test_deps_managed_runtime_is_used(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Covers both a real download (Production) and scripts/build-runtime-local.ps1
        writing directly here (Dev) — same directory, same lookup, same code."""
        monkeypatch.delenv("CONXA_RUNTIME_LOCAL_DIR", raising=False)
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))
        runtime_dir = tmp_path / "data" / "deps" / "conxa-runtime" / "runtime-v1.0.0"
        runtime_dir.mkdir(parents=True)
        (runtime_dir / "conxa-runtime.exe").touch()

        from conxa_compile.conxa_runtime import resolve_runtime_dir

        assert resolve_runtime_dir() == runtime_dir

    def test_returns_none_when_nothing_found(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CONXA_RUNTIME_LOCAL_DIR", raising=False)
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))

        from conxa_compile.conxa_runtime import resolve_runtime_dir

        assert resolve_runtime_dir() is None

    def test_conxa_dir_env_is_not_checked(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """$CONXA_DIR is no longer part of runtime resolution — only the runtime process gets it."""
        (tmp_path / "server.js").touch()
        (tmp_path / "package.json").touch()
        monkeypatch.setenv("CONXA_DIR", str(tmp_path))
        monkeypatch.delenv("CONXA_RUNTIME_LOCAL_DIR", raising=False)
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))

        from conxa_compile.conxa_runtime import resolve_runtime_dir

        # CONXA_DIR is passed to the runtime process env, not used for discovery.
        assert resolve_runtime_dir() is None


# ─── _bootstrap_runtime_dir ────────────────────────────────────────────────────

class TestBootstrapRuntimeDir:
    def _make_candidate(self, root: Path, name: str) -> Path:
        d = root / "deps" / "conxa-runtime" / name
        d.mkdir(parents=True)
        (d / "conxa-runtime.exe").touch()
        return d

    def test_local_build_beats_higher_numbered_release(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """build-runtime-local.ps1's output must win even though a downloaded release
        sorts higher lexicographically ("host-v1.2.3" > "host-v0.0.0-local.<ts>") —
        otherwise an installer build ships a host exe older than the current checkout
        (the jsonc-parser regression this guards against; see FIX.md 2026-07-30)."""
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        downloaded = self._make_candidate(tmp_path, "host-v1.2.3")
        local_build = self._make_candidate(tmp_path, "host-v0.0.0-local.20260730124242")

        from conxa_compile.conxa_runtime import _bootstrap_runtime_dir

        result = _bootstrap_runtime_dir()

        assert result == local_build
        assert result != downloaded

    def test_picks_highest_version_without_local_build(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        self._make_candidate(tmp_path, "host-v1.0.0")
        newest = self._make_candidate(tmp_path, "host-v1.2.3")
        self._make_candidate(tmp_path, "host-v1.1.9")

        from conxa_compile.conxa_runtime import _bootstrap_runtime_dir

        result = _bootstrap_runtime_dir()

        assert result == newest


# ─── _bootstrap_app_dir ───────────────────────────────────────────────────────

class TestBootstrapAppDir:
    def test_returns_highest_version_subdir(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CONXA_APP_LOCAL_DIR", raising=False)
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        app_root = tmp_path / "deps" / "conxa-app"
        (app_root / "app-v1.0.0").mkdir(parents=True)
        (app_root / "app-v1.0.2").mkdir()
        (app_root / "app-v1.0.1").mkdir()

        from conxa_compile.conxa_runtime import _bootstrap_app_dir

        result = _bootstrap_app_dir()

        assert result == app_root / "app-v1.0.2"

    def test_prefers_conxa_app_local_dir(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        explicit = tmp_path / "explicit-app"
        explicit.mkdir()
        monkeypatch.setenv("CONXA_APP_LOCAL_DIR", str(explicit))

        from conxa_compile.conxa_runtime import _bootstrap_app_dir

        result = _bootstrap_app_dir()

        assert result == explicit

    def test_returns_none_when_absent(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CONXA_APP_LOCAL_DIR", raising=False)
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))

        from conxa_compile.conxa_runtime import _bootstrap_app_dir

        result = _bootstrap_app_dir()

        assert result is None

    def test_local_build_beats_downloaded_release(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """scripts/build-app-local.ps1 output must win even though a downloaded release
        sorts higher lexicographically ("app-v1.3.4" > "app-v0.0.0-local.<ts>") and even
        though the deps bootstrap points CONXA_APP_LOCAL_DIR at whatever it just
        downloaded — otherwise Build Installer ships a stale app layer built before the
        current checkout (the http:// sync fix regression this guards against)."""
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        app_root = tmp_path / "deps" / "conxa-app"
        downloaded = app_root / "app-v1.3.4"
        downloaded.mkdir(parents=True)
        local_build = app_root / "app-v0.0.0-local.20260730124130"
        local_build.mkdir()
        monkeypatch.setenv("CONXA_APP_LOCAL_DIR", str(downloaded))

        from conxa_compile.conxa_runtime import _bootstrap_app_dir

        result = _bootstrap_app_dir()

        assert result == local_build

    def test_newest_local_build_used_when_multiple(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CONXA_APP_LOCAL_DIR", raising=False)
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        app_root = tmp_path / "deps" / "conxa-app"
        older = app_root / "app-v0.0.0-local.20260701000000"
        older.mkdir(parents=True)
        newer = app_root / "app-v0.0.0-local.20260730124130"
        newer.mkdir()

        from conxa_compile.conxa_runtime import _bootstrap_app_dir

        result = _bootstrap_app_dir()

        assert result == newer


# ─── sync_skill_pack ──────────────────────────────────────────────────────────

class TestSyncSkillPack:
    def test_copies_source_to_runtime(self, tmp_path: Path) -> None:
        source = tmp_path / "source" / "my-plugin"
        source.mkdir(parents=True)
        (source / "pack.json").write_text('{"skills":[]}', encoding="utf-8")
        runtime_dir = tmp_path / "runtime"
        runtime_dir.mkdir()

        from conxa_compile.conxa_runtime import sync_skill_pack
        with patch("conxa_compile.conxa_runtime.resolve_conxa_data_dir", return_value=tmp_path / "data"):
            sync_skill_pack(company="my-plugin", source_dir=source, runtime_dir=runtime_dir)

        dest = runtime_dir / "skill-packs" / "my-plugin"
        assert (dest / "pack.json").is_file()
        assert (dest / "pack.json").read_text() == '{"skills":[]}'

    def test_noop_when_source_missing(self, tmp_path: Path) -> None:
        runtime_dir = tmp_path / "runtime"
        runtime_dir.mkdir()
        from conxa_compile.conxa_runtime import sync_skill_pack
        with patch("conxa_compile.conxa_runtime.resolve_conxa_data_dir", return_value=tmp_path / "data"):
            sync_skill_pack(company="x", source_dir=tmp_path / "nonexistent", runtime_dir=runtime_dir)
        # No dest should be created
        assert not (runtime_dir / "skill-packs" / "x").exists()

    def test_busts_manifest_cache(self, tmp_path: Path) -> None:
        source = tmp_path / "src"
        source.mkdir()
        (source / "pack.json").write_text("{}", encoding="utf-8")
        runtime_dir = tmp_path / "rt"
        runtime_dir.mkdir()
        # Create a fake cache file
        cache_dir = tmp_path / "data" / "cache"
        cache_dir.mkdir(parents=True)
        cache_file = cache_dir / "manifests.json"
        cache_file.write_text("{}", encoding="utf-8")

        from conxa_compile.conxa_runtime import sync_skill_pack
        with patch("conxa_compile.conxa_runtime.resolve_conxa_data_dir", return_value=tmp_path / "data"):
            sync_skill_pack(company="c", source_dir=source, runtime_dir=runtime_dir)

        assert not cache_file.exists(), "Manifest cache should be deleted after sync"

    def test_replaces_existing_files(self, tmp_path: Path) -> None:
        source = tmp_path / "src"
        source.mkdir()
        (source / "pack.json").write_text('{"v":2}', encoding="utf-8")
        runtime_dir = tmp_path / "rt"
        dest = runtime_dir / "skill-packs" / "c"
        dest.mkdir(parents=True)
        (dest / "pack.json").write_text('{"v":1}', encoding="utf-8")  # old version

        from conxa_compile.conxa_runtime import sync_skill_pack
        with patch("conxa_compile.conxa_runtime.resolve_conxa_data_dir", return_value=tmp_path / "data"):
            sync_skill_pack(company="c", source_dir=source, runtime_dir=runtime_dir)

        assert (dest / "pack.json").read_text() == '{"v":2}'

    def test_stages_skill_into_versioned_current_layout(self, tmp_path: Path) -> None:
        """Regression test: runtime/skill_loader.js only reads <slug>/current/manifest.json.

        A locally built, unpublished skill pack has no sync_token, so runtime/sync.js's
        cloud-driven activation (which normally creates `current`) always no-ops — sync_skill_pack
        must produce that same versioned+current layout itself, offline.
        """
        source = tmp_path / "src" / "acme"
        skill_src = source / "make-widget"
        skill_src.mkdir(parents=True)
        (source / "pack.json").write_text(
            '{"skills":["make-widget"]}', encoding="utf-8"
        )
        (skill_src / "manifest.json").write_text('{"version":"0.2.0"}', encoding="utf-8")
        (skill_src / "execution.json").write_text('{}', encoding="utf-8")

        runtime_dir = tmp_path / "rt"
        runtime_dir.mkdir()

        from conxa_compile.conxa_runtime import sync_skill_pack
        with patch("conxa_compile.conxa_runtime.resolve_conxa_data_dir", return_value=tmp_path / "data"):
            sync_skill_pack(company="acme", source_dir=source, runtime_dir=runtime_dir)

        slug_dir = runtime_dir / "skill-packs" / "acme" / "make-widget"
        current = slug_dir / "current"
        assert current.is_dir()
        assert (current / "manifest.json").is_file()
        assert (current / "execution.json").is_file()
        assert current.resolve() == (slug_dir / "v0.2.0").resolve()

    def test_re_sync_replaces_stale_version(self, tmp_path: Path) -> None:
        """Re-syncing after a version bump should drop the old version dir, not accumulate."""
        source = tmp_path / "src" / "acme"
        skill_src = source / "make-widget"
        skill_src.mkdir(parents=True)
        (source / "pack.json").write_text('{"skills":["make-widget"]}', encoding="utf-8")
        (skill_src / "manifest.json").write_text('{"version":"0.1.0"}', encoding="utf-8")

        runtime_dir = tmp_path / "rt"
        runtime_dir.mkdir()

        from conxa_compile.conxa_runtime import sync_skill_pack
        with patch("conxa_compile.conxa_runtime.resolve_conxa_data_dir", return_value=tmp_path / "data"):
            sync_skill_pack(company="acme", source_dir=source, runtime_dir=runtime_dir)
            (skill_src / "manifest.json").write_text('{"version":"0.2.0"}', encoding="utf-8")
            sync_skill_pack(company="acme", source_dir=source, runtime_dir=runtime_dir)

        slug_dir = runtime_dir / "skill-packs" / "acme" / "make-widget"
        assert not (slug_dir / "v0.1.0").exists()
        assert (slug_dir / "current").resolve() == (slug_dir / "v0.2.0").resolve()


# ─── stage_runtime_payload ────────────────────────────────────────────────────

class TestStageRuntimePayload:
    def _make_runtime_dir(self, base: Path, name: str = "runtime-v1.0.0") -> Path:
        d = base / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "conxa-runtime.exe").write_bytes(b"exe")
        (d / "keytar.node").write_bytes(b"keytar")
        return d

    def _make_app_dir(self, base: Path, name: str = "app-v1.0.0") -> Path:
        d = base / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "server.jsc").write_bytes(b"bytecode")
        (d / "version.json").write_text('{"app_version":"1.0.0"}', encoding="utf-8")
        return d

    def test_stages_exe_keytar_version_and_app(self, tmp_path: Path) -> None:
        runtime_dir = self._make_runtime_dir(tmp_path / "deps")
        app_dir = self._make_app_dir(tmp_path / "deps")
        dest = tmp_path / "out"
        dest.mkdir()

        from conxa_compile.conxa_runtime import stage_runtime_payload
        stage_runtime_payload(dest, runtime_dir, app_dir)

        assert (dest / "conxa-runtime.exe").is_file()
        assert (dest / "keytar.node").is_file()
        assert (dest / "version.json").is_file()
        version_dest = dest / "conxa-app" / app_dir.name
        assert (version_dest / "server.jsc").is_file()
        current = dest / "conxa-app" / "current"
        assert current.is_dir()
        assert current.resolve() == version_dest.resolve()

    def test_version_json_records_both_versions(self, tmp_path: Path) -> None:
        import json as _json
        runtime_dir = self._make_runtime_dir(tmp_path / "deps", "runtime-v2.0.0")
        app_dir = self._make_app_dir(tmp_path / "deps", "app-v3.1.0")
        dest = tmp_path / "out"
        dest.mkdir()

        from conxa_compile.conxa_runtime import stage_runtime_payload
        stage_runtime_payload(dest, runtime_dir, app_dir)

        meta = _json.loads((dest / "version.json").read_text())
        assert meta["runtime_version"] == "runtime-v2.0.0"
        assert meta["app_version"] == "app-v3.1.0"

    def test_works_without_app_dir(self, tmp_path: Path) -> None:
        runtime_dir = self._make_runtime_dir(tmp_path / "deps")
        dest = tmp_path / "out"
        dest.mkdir()

        from conxa_compile.conxa_runtime import stage_runtime_payload
        stage_runtime_payload(dest, runtime_dir, None)

        assert (dest / "conxa-runtime.exe").is_file()
        assert not (dest / "conxa-app").exists()

    def test_raises_if_exe_missing(self, tmp_path: Path) -> None:
        runtime_dir = tmp_path / "runtime-v1.0.0"
        runtime_dir.mkdir()
        # no exe

        from conxa_compile.conxa_runtime import stage_runtime_payload
        with pytest.raises(RuntimeError, match="No packed runtime executable"):
            stage_runtime_payload(tmp_path / "out", runtime_dir, None)


# ─── ensure_test_sandbox ──────────────────────────────────────────────────────

class TestEnsureTestSandbox:
    def _make_runtime_dir(self, base: Path, name: str = "runtime-v1.0.0") -> Path:
        d = base / "deps" / "conxa-runtime" / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "conxa-runtime.exe").write_bytes(b"exe")
        (d / "keytar.node").write_bytes(b"keytar")
        return d

    def _make_app_dir(self, base: Path, name: str = "app-v1.0.0") -> Path:
        d = base / "deps" / "conxa-app" / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "server.jsc").write_bytes(b"bytecode")
        (d / "version.json").write_text('{}', encoding="utf-8")
        return d

    def test_creates_sandbox_structure(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        runtime_dir = self._make_runtime_dir(tmp_path)
        app_dir = self._make_app_dir(tmp_path)

        from conxa_compile.conxa_runtime import ensure_test_sandbox
        conxa_dir, data_dir = ensure_test_sandbox(runtime_dir, app_dir)

        assert conxa_dir == tmp_path / "sandbox" / ".conxa"
        assert data_dir == tmp_path / "sandbox" / "data"
        assert conxa_dir.is_dir()
        assert (data_dir / "cache").is_dir()
        assert (data_dir / "logs").is_dir()

    def test_stages_payload(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Covers both Production (runtime_dir/app_dir came from a real download) and
        Dev (they came from scripts/build-runtime-local.ps1 / build-app-local.ps1
        writing into deps/ directly) — identical staging either way."""
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        runtime_dir = self._make_runtime_dir(tmp_path)
        app_dir = self._make_app_dir(tmp_path)

        from conxa_compile.conxa_runtime import ensure_test_sandbox
        conxa_dir, _ = ensure_test_sandbox(runtime_dir, app_dir)

        assert (conxa_dir / "conxa-runtime.exe").is_file()
        assert (conxa_dir / "keytar.node").is_file()
        version_dest = conxa_dir / "conxa-app" / app_dir.name
        assert (version_dest / "server.jsc").is_file()
        current = conxa_dir / "conxa-app" / "current"
        assert current.is_dir()
        assert current.resolve() == version_dest.resolve()

    def test_skips_restage_when_versions_unchanged(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Re-running with the same deps versions must NOT re-copy the exe."""
        import json as _json
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        runtime_dir = self._make_runtime_dir(tmp_path)
        app_dir = self._make_app_dir(tmp_path)

        conxa_dir = tmp_path / "sandbox" / ".conxa"
        conxa_dir.mkdir(parents=True)
        (conxa_dir / "conxa-runtime.exe").write_bytes(b"original")
        (conxa_dir / "version.json").write_text(
            _json.dumps({"runtime_version": runtime_dir.name, "app_version": app_dir.name}),
            encoding="utf-8",
        )
        # App layer already fully staged from a previous run — the cache-hit check
        # now verifies this file is actually present, not just the version label.
        (conxa_dir / "conxa-app" / "current").mkdir(parents=True)
        (conxa_dir / "conxa-app" / "current" / "server.js").write_bytes(b"staged")

        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch("conxa_compile.conxa_runtime._ensure_junction", return_value=True):
            ensure_test_sandbox(runtime_dir, app_dir)

        # Original bytes preserved — no re-copy happened
        assert (conxa_dir / "conxa-runtime.exe").read_bytes() == b"original"

    def test_restages_when_runtime_version_changes(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        import json as _json
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        runtime_dir = self._make_runtime_dir(tmp_path, "runtime-v2.0.0")
        app_dir = self._make_app_dir(tmp_path)

        conxa_dir = tmp_path / "sandbox" / ".conxa"
        conxa_dir.mkdir(parents=True)
        (conxa_dir / "conxa-runtime.exe").write_bytes(b"old-exe")
        # version.json still says v1
        (conxa_dir / "version.json").write_text(
            _json.dumps({"runtime_version": "runtime-v1.0.0", "app_version": app_dir.name}),
            encoding="utf-8",
        )

        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch("conxa_compile.conxa_runtime._ensure_junction", return_value=True):
            ensure_test_sandbox(runtime_dir, app_dir)

        # Exe should have been replaced with the new v2 content
        assert (conxa_dir / "conxa-runtime.exe").read_bytes() == b"exe"

    def test_restages_when_app_version_changes(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        import json as _json
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        runtime_dir = self._make_runtime_dir(tmp_path)
        app_dir = self._make_app_dir(tmp_path, "app-v2.0.0")

        conxa_dir = tmp_path / "sandbox" / ".conxa"
        conxa_dir.mkdir(parents=True)
        (conxa_dir / "conxa-runtime.exe").write_bytes(b"original")
        (conxa_dir / "version.json").write_text(
            _json.dumps({"runtime_version": runtime_dir.name, "app_version": "app-v1.0.0"}),
            encoding="utf-8",
        )

        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch("conxa_compile.conxa_runtime._ensure_junction", return_value=True):
            ensure_test_sandbox(runtime_dir, app_dir)

        # Re-staged due to app version change
        assert (conxa_dir / "conxa-runtime.exe").read_bytes() == b"exe"

    def test_restages_when_app_layer_missing_despite_matching_version(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A version.json label match alone must not be trusted if conxa-app/current/
        server.js isn't actually there (interrupted or raced staging) — otherwise the
        sandbox stays permanently broken instead of self-healing on the next run."""
        import json as _json
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        runtime_dir = self._make_runtime_dir(tmp_path)
        app_dir = self._make_app_dir(tmp_path)

        conxa_dir = tmp_path / "sandbox" / ".conxa"
        conxa_dir.mkdir(parents=True)
        (conxa_dir / "conxa-runtime.exe").write_bytes(b"original")
        # Labels match current deps versions, but conxa-app/ was never staged.
        (conxa_dir / "version.json").write_text(
            _json.dumps({"runtime_version": runtime_dir.name, "app_version": app_dir.name}),
            encoding="utf-8",
        )

        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch("conxa_compile.conxa_runtime._ensure_junction", return_value=True):
            ensure_test_sandbox(runtime_dir, app_dir)

        version_dest = conxa_dir / "conxa-app" / app_dir.name
        assert (version_dest / "server.jsc").is_file()


# ─── call_runtime_tool env injection ──────────────────────────────────────────

class TestCallRuntimeToolEnv:
    """Verify that call_runtime_tool sets the right env vars and avoids legacy ones."""

    def test_sets_conxa_dir_to_sandbox_not_runtime_dir(self, tmp_path: Path) -> None:
        sandbox_conxa = tmp_path / "sandbox" / ".conxa"
        sandbox_conxa.mkdir(parents=True)
        (sandbox_conxa / "conxa-runtime.exe").write_bytes(b"exe")

        runtime_dir = tmp_path / "runtime-src"
        runtime_dir.mkdir()

        captured_env: dict = {}

        def fake_popen(cmd, cwd, env, **kwargs):
            captured_env.update(env)
            # Return a process-like object that immediately fails so call_runtime_tool exits fast
            raise OSError("stopped for test")

        import subprocess as _subprocess
        from conxa_compile.runtime_tool import call_runtime_tool

        with patch.object(_subprocess, "Popen", fake_popen):
            try:
                call_runtime_tool(runtime_dir, "test_tool", {}, conxa_dir=sandbox_conxa)
            except Exception:
                pass  # expected — fake_popen raises

        assert captured_env.get("CONXA_DIR") == str(sandbox_conxa)
        # Explicit override, not left to env.js's fallback derivation — a parent
        # process launched via scripts/conxa.ps1 already has CONXA_APP_DIR set
        # (pointing at ~/.conxa-dev/conxa-app), and it would leak through via
        # os.environ inheritance otherwise, beating the sandbox-derived path.
        assert captured_env.get("CONXA_APP_DIR") == str(sandbox_conxa / "conxa-app")
        assert "PLAYWRIGHT_BROWSERS_PATH" not in captured_env

    def test_conxa_app_dir_override_beats_stale_parent_env(self, tmp_path: Path, monkeypatch) -> None:
        """A CONXA_APP_DIR inherited from the parent process (e.g. scripts/conxa.ps1) must
        not leak into the spawned runtime's env — it has to be overridden to match the
        sandbox conxa_dir, not the parent's ~/.conxa-dev/conxa-app."""
        monkeypatch.setenv("CONXA_APP_DIR", str(tmp_path / "stale-parent" / "conxa-app"))

        sandbox_conxa = tmp_path / "sandbox" / ".conxa"
        sandbox_conxa.mkdir(parents=True)
        (sandbox_conxa / "conxa-runtime.exe").write_bytes(b"exe")

        runtime_dir = tmp_path / "runtime-src"
        runtime_dir.mkdir()

        captured_env: dict = {}

        def fake_popen(cmd, cwd, env, **kwargs):
            captured_env.update(env)
            raise OSError("stopped for test")

        import subprocess as _subprocess
        from conxa_compile.runtime_tool import call_runtime_tool

        with patch.object(_subprocess, "Popen", fake_popen):
            try:
                call_runtime_tool(runtime_dir, "test_tool", {}, conxa_dir=sandbox_conxa)
            except Exception:
                pass  # expected — fake_popen raises

        assert captured_env.get("CONXA_APP_DIR") == str(sandbox_conxa / "conxa-app")

    def test_raises_when_no_exe_found(self, tmp_path: Path) -> None:
        """Both Dev and Production always resolve to a real packed exe now — no more
        `node server.js` source-tree fallback."""
        runtime_dir = tmp_path / "runtime-src"
        runtime_dir.mkdir()

        from conxa_compile.conxa_runtime import RuntimeToolError
        from conxa_compile.runtime_tool import call_runtime_tool

        with pytest.raises(RuntimeToolError, match="No packed runtime executable"):
            call_runtime_tool(runtime_dir, "test_tool", {})
