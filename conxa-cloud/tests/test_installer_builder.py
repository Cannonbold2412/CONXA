from conxa_compile.installer_builder import _render_nsis_script


def test_rendered_nsis_uses_skill_packs_paths(tmp_path):
    nsi_path = _render_nsis_script(tmp_path, "render", "Render", "v1.0.0")
    rendered = nsi_path.read_text(encoding="utf-8")

    assert r"${INSTALL_DIR}\skill-packs\${COMPANY_SLUG}" in rendered
    # Thin installer: only pack.json is staged, not a recursive copy of the
    # whole skill-packs tree — the runtime's own delta-sync fetches every skill.
    assert r"${STAGING_DIR}\skill-packs\${COMPANY_SLUG}\pack.json" in rendered
    assert r"${STAGING_DIR}\skill-packs\${COMPANY_SLUG}\*.*" not in rendered
    assert r"${INSTALL_DIR}\plugins\*.*" not in rendered
    assert r"${STAGING_DIR}\plugins\${COMPANY_SLUG}\*.*" not in rendered


def test_rendered_nsis_creates_runtime_and_app_junctions_but_not_skill_junctions(tmp_path):
    # Runtime/app-layer junctions are unrelated to skill packs and still exist.
    # Per-skill junctions are no longer created by the installer at all — the
    # runtime's own delta-sync creates each skill's `current` junction on its
    # first run (see runtime/sync.js), exactly as it does for every later update.
    nsi_path = _render_nsis_script(tmp_path, "render", "Render", "0.3.0")
    rendered = nsi_path.read_text(encoding="utf-8")

    assert "New-Item -ItemType Junction" in rendered
    assert r"${RUNTIME_ROOT}\current" in rendered
    assert r"${APP_ROOT}\current" in rendered
    assert r"${RUNTIME_ROOT}\current\conxa-runtime.exe" in rendered  # MCP command target
    assert "conxa_skill_junctions.ps1" not in rendered
    assert "SKILL_VER_DIR" not in rendered


def test_build_installer_packages_existing_skill_pack_without_rebuild(tmp_path, monkeypatch):
    import subprocess

    from conxa_core.config import settings
    from conxa_core.models.plugin import Plugin, PluginBuild
    from conxa_compile import installer_builder
    from conxa_compile import plugin_builder
    from conxa_core.storage import plugin_store

    skill_pack = tmp_path / "skill-packs" / "render"
    skill_pack.mkdir(parents=True)
    (skill_pack / "pack.json").write_text(
        '{"skill_pack_version":"v9.9.9","skills":["delete-a-service","create-a-service"],"sync_token":"sync-token"}',
        encoding="utf-8",
    )

    plugin = Plugin(
        id="plugin-1",
        slug="render",
        name="Render",
        workspace_id="ws-1",
        target_url="https://dashboard.render.com/login",
        status="ready",
        build=PluginBuild(last_built_at=1.0, output_path=str(tmp_path / "out"), version="v9.9.9"),
    )

    def fail_rebuild(*args, **kwargs):
        raise AssertionError("build_installer must not rebuild the plugin")

    studio_runtime_dir = tmp_path / ".conxa-build-studio" / "deps" / "conxa-runtime" / "runtime-v-local"
    studio_runtime_dir.mkdir(parents=True)

    def fake_stage_runtime(dest, log=None, *, studio_runtime_dir=None):
        (dest / "conxa-runtime.exe").write_bytes(b"runtime")
        (dest / "keytar.node").write_bytes(b"keytar")
        (dest / "version.json").write_text('{"runtime_version":"runtime-v-local"}', encoding="utf-8")

    def fake_run(args, **kwargs):
        output_arg = next(arg for arg in args if str(arg).startswith("/DOUTPUT_PATH="))
        output_path = output_arg.split("=", 1)[1]
        with open(output_path, "wb") as f:
            f.write(b"installer")
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(plugin_builder, "build_plugin", fail_rebuild)
    monkeypatch.setattr(plugin_store, "get_plugin", lambda plugin_id: plugin)
    monkeypatch.setattr(plugin_store, "set_installer", lambda *args, **kwargs: None)
    monkeypatch.setattr(installer_builder, "_find_makensis", lambda: "makensis")
    monkeypatch.setattr(installer_builder, "_find_studio_cache_runtime_dir", lambda: studio_runtime_dir)
    monkeypatch.setattr(installer_builder, "_stage_runtime_binary", fake_stage_runtime)
    monkeypatch.setattr(installer_builder.subprocess, "run", fake_run)

    logs = []
    result = installer_builder.build_installer(
        plugin.id,
        company_slug="render",
        realtime_sink=lambda event: logs.append(event["message"]),
    )

    assert result["version"] == "v9.9.9"
    assert (tmp_path / "installers" / "Render-Agent-Setup.exe").is_file()
    assert any("Using existing skill pack" in message for message in logs)
    assert not any("Building skill pack" in message for message in logs)


def test_build_installer_allows_missing_sync_token_for_local_dev_endpoint(tmp_path, monkeypatch):
    """A pack built against a local dev cloud never publishes (backend.py's
    _auto_publish_enabled() skips it for a local API base), so it never gets a
    sync_token — that must not block a purely-local "Build Installer" run.
    """
    import subprocess

    from conxa_core.config import settings
    from conxa_core.models.plugin import Plugin, PluginBuild
    from conxa_compile import installer_builder
    from conxa_compile import plugin_builder
    from conxa_core.storage import plugin_store

    skill_pack = tmp_path / "skill-packs" / "render"
    skill_pack.mkdir(parents=True)
    (skill_pack / "pack.json").write_text(
        '{"skill_pack_version":"v9.9.9","skills":[],'
        '"sync_endpoint":"http://127.0.0.1:8000/api/v1/skill-packs/render/delta"}',
        encoding="utf-8",
    )

    plugin = Plugin(
        id="plugin-1",
        slug="render",
        name="Render",
        workspace_id="ws-1",
        target_url="https://dashboard.render.com/login",
        status="ready",
        build=PluginBuild(last_built_at=1.0, output_path=str(tmp_path / "out"), version="v9.9.9"),
    )

    studio_runtime_dir = tmp_path / ".conxa-build-studio-dev" / "deps" / "conxa-runtime" / "runtime-v-local"
    studio_runtime_dir.mkdir(parents=True)

    def fake_stage_runtime(dest, log=None, *, studio_runtime_dir=None):
        (dest / "conxa-runtime.exe").write_bytes(b"runtime")
        (dest / "keytar.node").write_bytes(b"keytar")
        (dest / "version.json").write_text('{"runtime_version":"runtime-v-local"}', encoding="utf-8")

    def fake_run(args, **kwargs):
        output_arg = next(arg for arg in args if str(arg).startswith("/DOUTPUT_PATH="))
        output_path = output_arg.split("=", 1)[1]
        with open(output_path, "wb") as f:
            f.write(b"installer")
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(plugin_builder, "build_plugin", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no rebuild")))
    monkeypatch.setattr(plugin_store, "get_plugin", lambda plugin_id: plugin)
    monkeypatch.setattr(plugin_store, "set_installer", lambda *args, **kwargs: None)
    monkeypatch.setattr(installer_builder, "_find_makensis", lambda: "makensis")
    monkeypatch.setattr(installer_builder, "_find_studio_cache_runtime_dir", lambda: studio_runtime_dir)
    monkeypatch.setattr(installer_builder, "_stage_runtime_binary", fake_stage_runtime)
    monkeypatch.setattr(installer_builder.subprocess, "run", fake_run)

    result = installer_builder.build_installer(plugin.id, company_slug="render")

    assert (tmp_path / "installers" / "Render-Agent-Setup.exe").is_file()
    assert result["version"] == "v9.9.9"


def test_build_installer_still_requires_sync_token_for_real_cloud_endpoint(tmp_path, monkeypatch):
    """A pack bound to a real, non-local cloud must still be published first."""
    import pytest

    from conxa_core.config import settings
    from conxa_core.models.plugin import Plugin, PluginBuild
    from conxa_compile import installer_builder
    from conxa_core.storage import plugin_store

    skill_pack = tmp_path / "skill-packs" / "render"
    skill_pack.mkdir(parents=True)
    (skill_pack / "pack.json").write_text(
        '{"skill_pack_version":"v9.9.9","skills":[],'
        '"sync_endpoint":"https://apis.conxa.in/api/v1/skill-packs/render/delta"}',
        encoding="utf-8",
    )

    plugin = Plugin(
        id="plugin-1",
        slug="render",
        name="Render",
        workspace_id="ws-1",
        target_url="https://dashboard.render.com/login",
        status="ready",
        build=PluginBuild(last_built_at=1.0, output_path=str(tmp_path / "out"), version="v9.9.9"),
    )

    studio_runtime_dir = tmp_path / ".conxa-build-studio" / "deps" / "conxa-runtime" / "runtime-v-local"
    studio_runtime_dir.mkdir(parents=True)

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(plugin_store, "get_plugin", lambda plugin_id: plugin)
    monkeypatch.setattr(installer_builder, "_find_makensis", lambda: "makensis")
    monkeypatch.setattr(installer_builder, "_find_studio_cache_runtime_dir", lambda: studio_runtime_dir)

    with pytest.raises(RuntimeError, match="sync_token"):
        installer_builder.build_installer(plugin.id, company_slug="render")


def test_build_installer_stages_only_pack_json_not_skill_files(tmp_path, monkeypatch):
    """Thin installer: only pack.json is staged into the NSIS payload — no skill
    file trees. The runtime's own delta-sync downloads every skill and creates
    each skill's `current` junction on its first run (see runtime/sync.js),
    exactly as it does for every later update."""
    import subprocess

    from conxa_core.config import settings
    from conxa_core.models.plugin import Plugin, PluginBuild
    from conxa_compile import installer_builder
    from conxa_compile import plugin_builder
    from conxa_core.storage import plugin_store

    skill_pack = tmp_path / "skill-packs" / "render"
    (skill_pack / "deploy").mkdir(parents=True)
    (skill_pack / "pack.json").write_text(
        '{"skill_pack_version":"0.3.0","skills":["deploy"],"sync_token":"sync-token","installer_version":"v2"}',
        encoding="utf-8",
    )
    (skill_pack / "deploy" / "manifest.json").write_text('{"name":"deploy"}', encoding="utf-8")
    (skill_pack / "deploy" / "execution.json").write_text('{"steps":[]}', encoding="utf-8")

    plugin = Plugin(
        id="plugin-1", slug="render", name="Render", workspace_id="ws-1",
        target_url="https://dashboard.render.com/login", status="ready",
        build=PluginBuild(last_built_at=1.0, output_path=str(tmp_path / "out"), version="0.3.0"),
    )

    studio_runtime_dir = tmp_path / ".conxa-build-studio" / "deps" / "conxa-runtime" / "runtime-v-local"
    studio_runtime_dir.mkdir(parents=True)

    def fake_stage_runtime(dest, log=None, *, studio_runtime_dir=None):
        (dest / "conxa-runtime.exe").write_bytes(b"runtime")
        (dest / "keytar.node").write_bytes(b"keytar")
        (dest / "version.json").write_text('{"runtime_version":"runtime-v-local"}', encoding="utf-8")

    captured = {}
    real_render = installer_builder._render_nsis_script

    def spy_render(tmp, *args, **kwargs):
        # Assert here, not after build_installer() returns — its `with
        # tempfile.TemporaryDirectory()` block deletes `tmp` before this function's
        # caller sees control again.
        staged = tmp / "skill-packs" / "render"
        assert (staged / "pack.json").is_file(), "pack.json must stay flat at the company root"
        assert not (staged / "deploy").exists(), "thin installer must not stage any skill file tree"
        captured["staged_entries"] = sorted(p.name for p in staged.iterdir())
        return real_render(tmp, *args, **kwargs)

    def fake_run(args, **kwargs):
        output_arg = next(arg for arg in args if str(arg).startswith("/DOUTPUT_PATH="))
        output_path = output_arg.split("=", 1)[1]
        with open(output_path, "wb") as f:
            f.write(b"installer")
        return subprocess.CompletedProcess(args, 0, stdout="", stderr="")

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(plugin_builder, "build_plugin", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no rebuild")))
    monkeypatch.setattr(plugin_store, "get_plugin", lambda plugin_id: plugin)
    monkeypatch.setattr(plugin_store, "set_installer", lambda *args, **kwargs: None)
    monkeypatch.setattr(installer_builder, "_find_makensis", lambda: "makensis")
    monkeypatch.setattr(installer_builder, "_find_studio_cache_runtime_dir", lambda: studio_runtime_dir)
    monkeypatch.setattr(installer_builder, "_stage_runtime_binary", fake_stage_runtime)
    monkeypatch.setattr(installer_builder, "_render_nsis_script", spy_render)
    monkeypatch.setattr(installer_builder.subprocess, "run", fake_run)

    installer_builder.build_installer(plugin.id, company_slug="render")

    assert captured["staged_entries"] == ["pack.json"]
