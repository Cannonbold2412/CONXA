"""Tests for conxa_compile/conxa_runtime.py (runtime dir resolution + skill-pack sync)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest


# ─── resolve_runtime_dir ───────────────────────────────────────────────────────

class TestResolveRuntimeDir:
    def test_runtime_local_dir_is_priority(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        runtime_dir = tmp_path / "runtime-v1.2.3"
        runtime_dir.mkdir()
        (runtime_dir / "conxa-runtime.exe").touch()
        monkeypatch.setenv("CONXA_RUNTIME_LOCAL_DIR", str(runtime_dir))
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))

        from conxa_compile.conxa_runtime import resolve_runtime_dir

        result = resolve_runtime_dir()

        assert result == runtime_dir

    def test_runtime_local_dir_ignored_if_invalid(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CONXA_RUNTIME_LOCAL_DIR", str(tmp_path / "nonexistent"))
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))

        import sys as _sys
        from conxa_compile.conxa_runtime import resolve_runtime_dir

        with patch.object(_sys, "frozen", True, create=True):
            result = resolve_runtime_dir()

        # Falls through to deps scan, which also finds nothing.
        assert result is None

    def test_deps_managed_runtime_is_used(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CONXA_RUNTIME_LOCAL_DIR", raising=False)
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))
        runtime_dir = tmp_path / "data" / "deps" / "conxa-runtime" / "runtime-v1.0.0"
        runtime_dir.mkdir(parents=True)
        (runtime_dir / "conxa-runtime.exe").touch()

        import sys as _sys
        from conxa_compile.conxa_runtime import resolve_runtime_dir

        with patch.object(_sys, "frozen", True, create=True):
            result = resolve_runtime_dir()

        assert result == runtime_dir

    def test_returns_none_when_nothing_found(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CONXA_RUNTIME_LOCAL_DIR", raising=False)
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))

        import sys as _sys
        from conxa_compile.conxa_runtime import resolve_runtime_dir

        with patch.object(_sys, "frozen", True, create=True):
            result = resolve_runtime_dir()

        assert result is None

    def test_conxa_dir_env_is_not_checked(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """$CONXA_DIR is no longer part of runtime resolution — only the runtime process gets it."""
        (tmp_path / "server.js").touch()
        (tmp_path / "package.json").touch()
        monkeypatch.setenv("CONXA_DIR", str(tmp_path))
        monkeypatch.delenv("CONXA_RUNTIME_LOCAL_DIR", raising=False)
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path / "data"))

        import sys as _sys
        from conxa_compile.conxa_runtime import resolve_runtime_dir

        with patch.object(_sys, "frozen", True, create=True):
            result = resolve_runtime_dir()

        # CONXA_DIR is passed to the runtime process env, not used for discovery.
        assert result is None


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
        assert (dest / "conxa-app" / "server.jsc").is_file()

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

        import sys as _sys
        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch.object(_sys, "frozen", True, create=True):
            conxa_dir, data_dir = ensure_test_sandbox(runtime_dir, app_dir)

        assert conxa_dir == tmp_path / "sandbox" / ".conxa"
        assert data_dir == tmp_path / "sandbox" / "data"
        assert conxa_dir.is_dir()
        assert (data_dir / "cache").is_dir()
        assert (data_dir / "logs").is_dir()

    def test_stages_payload_in_frozen_mode(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        runtime_dir = self._make_runtime_dir(tmp_path)
        app_dir = self._make_app_dir(tmp_path)

        import sys as _sys
        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch.object(_sys, "frozen", True, create=True):
            # Patch out junction creation (not relevant to this assertion)
            with patch("conxa_compile.conxa_runtime._ensure_chromium_link", return_value=True):
                conxa_dir, _ = ensure_test_sandbox(runtime_dir, app_dir)

        assert (conxa_dir / "conxa-runtime.exe").is_file()
        assert (conxa_dir / "keytar.node").is_file()
        assert (conxa_dir / "conxa-app" / "server.jsc").is_file()

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

        import sys as _sys
        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch.object(_sys, "frozen", True, create=True):
            with patch("conxa_compile.conxa_runtime._ensure_chromium_link", return_value=True):
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

        import sys as _sys
        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch.object(_sys, "frozen", True, create=True):
            with patch("conxa_compile.conxa_runtime._ensure_chromium_link", return_value=True):
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

        import sys as _sys
        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch.object(_sys, "frozen", True, create=True):
            with patch("conxa_compile.conxa_runtime._ensure_chromium_link", return_value=True):
                ensure_test_sandbox(runtime_dir, app_dir)

        # Re-staged due to app version change
        assert (conxa_dir / "conxa-runtime.exe").read_bytes() == b"exe"

    def test_no_staging_in_dev_mode(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """In dev (not frozen), no exe staging — just creates dirs and junction."""
        monkeypatch.setenv("SKILL_DATA_DIR", str(tmp_path))
        runtime_dir = self._make_runtime_dir(tmp_path)
        app_dir = self._make_app_dir(tmp_path)

        import sys as _sys
        from conxa_compile.conxa_runtime import ensure_test_sandbox
        with patch.object(_sys, "frozen", False, create=True):
            with patch("conxa_compile.conxa_runtime._ensure_chromium_link", return_value=True):
                conxa_dir, _ = ensure_test_sandbox(runtime_dir, app_dir)

        assert not (conxa_dir / "conxa-runtime.exe").exists()


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
        from conxa_compile.conxa_runtime import call_runtime_tool

        with patch.object(_subprocess, "Popen", fake_popen):
            try:
                call_runtime_tool(runtime_dir, "test_tool", {}, conxa_dir=sandbox_conxa)
            except Exception:
                pass  # expected — fake_popen raises

        assert captured_env.get("CONXA_DIR") == str(sandbox_conxa)
        assert "CONXA_APP_DIR" not in captured_env
        assert "PLAYWRIGHT_BROWSERS_PATH" not in captured_env
