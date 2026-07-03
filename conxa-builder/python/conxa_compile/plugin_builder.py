"""Plugin-first build pipeline.

Compiles a Plugin entity (auth session + N workflow sessions) into a
data-only skill pack folder:

  output/skill_package/{bundle_slug}-plugin/
    plugin.json                   <- plugin manifest
    README.md                     <- auto-generated, public-facing
    CLAUDE.md                     <- Claude reads this for skill discovery
    .gitignore                    <- excludes auth/auth.json and local state
    LICENSE                       <- MIT by default
    auth/                         <- runtime-local auth directory only
    skills/
      {workflow_slug}/            <- one per workflow, login steps stripped

auth/auth.json and auth/credentials*.json are NEVER placed in the build output.
Credentials are local runtime state captured by the installed Conxa runtime.
"""

from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from typing import Any, Callable
from zipfile import ZIP_DEFLATED, ZipFile

from conxa_compile.plugin_builder_output import (
    _bundle_root,
    _clean_stale_artifacts,
    _copy_plugin_templates,
    _plugin_bundle_slug,
    _render_license,
    _render_readme,
    _write_skill_packs_format,
)
from conxa_compile.plugin_builder_saved_skill import _build_workflow_from_saved_skill
from conxa_core.sanitize import dumps_safe
from conxa_core.storage.plugin_store import get_plugin, set_build
from conxa_core.storage.json_store import read_skill


# ─────────────────────────────────────────────────
# Main build entry point
# ─────────────────────────────────────────────────

def build_plugin(
    plugin_id: str,
    *,
    version: str = "0.1.0",
    realtime_sink: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Compile a plugin from its recorded sessions into an installer-ready package."""
    plugin = get_plugin(plugin_id)
    if plugin is None:
        raise ValueError(f"Plugin {plugin_id!r} not found.")
    if not plugin.workflows:
        raise ValueError("Plugin has no workflows. Record at least one workflow.")
    uncompiled = [wf.name for wf in plugin.workflows if not wf.skill_id]
    if uncompiled:
        raise ValueError(f"Compile these workflows before building: {', '.join(uncompiled)}")
    unedited = [wf.name for wf in plugin.workflows if not wf.edited_at]
    if unedited:
        raise ValueError(
            f"Open the editor and sign off on these workflows before building: {', '.join(unedited)}"
        )

    def _log(msg: str, **extra: Any) -> None:
        entry = {"kind": "plugin_build", "message": msg, "plugin_id": plugin_id, **extra}
        if realtime_sink:
            realtime_sink(entry)

    bundle_slug = _plugin_bundle_slug(plugin_id, plugin.name)
    _log("Starting plugin build", bundle_slug=bundle_slug, version=version)

    bundle_root = _bundle_root(bundle_slug)

    # ── 0. Clean stale artifacts from old build architectures ─────────────
    _clean_stale_artifacts(bundle_root)
    _log("Cleaned stale artifacts")

    # ── 1. Build workflow skills ───────────────────────────────────────────
    skill_slugs: list[str] = []
    for wf in plugin.workflows:
        saved_skill = read_skill(wf.skill_id) if wf.skill_id else None
        if saved_skill is not None:
            _log("Building workflow from saved skill JSON", workflow=wf.name, workflow_id=wf.id)
            _build_workflow_from_saved_skill(
                bundle_root=bundle_root,
                workflow_slug=wf.slug,
                saved_skill=saved_skill,
            )
            skill_slugs.append(wf.slug)
            _log(f"Workflow {wf.name!r} compiled from saved skill JSON")
            continue

        _log(f"Skipping workflow {wf.name!r} — no compiled skill found", warning=True)

    # ── 2. Write plugin.json (v2 manifest for the installed Conxa runtime) ──
    var_pattern = re.compile(r"\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}")
    protected_url_vars = var_pattern.findall(plugin.protected_url)

    package_id = getattr(plugin, "package_id", None) or bundle_slug
    visibility = getattr(plugin, "visibility", "private")
    tags = list(getattr(plugin, "tags", []) or [])
    repository_url = getattr(plugin, "repository_url", None)

    plugin_config = {
        "package_format": 2,
        "id": package_id,
        "slug": bundle_slug,
        "name": plugin.name,
        "version": version,
        "visibility": visibility,
        "tags": tags,
        "target_url": plugin.target_url,
        "protected_url": plugin.protected_url,
        "protected_url_vars": protected_url_vars,
        "auth_requirements": {"kind": "cookie", "manual_login": True},
        "skills": [{"slug": s, "path": f"skills/{s}"} for s in skill_slugs],
        "runtime_min_version": "1.0.0",
        "compatibility": {"conxa_runtime": ">=1.0.0"},
    }
    if repository_url:
        plugin_config["source"] = {"kind": "git+https", "repository_url": repository_url}
    (bundle_root / "plugin.json").write_text(
        dumps_safe(plugin_config, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    _log("Written plugin.json", skills=skill_slugs, package_id=package_id, visibility=visibility)

    # ── 3. Copy plugin templates (Claude.md, index.md, .gitignore) ─────────
    _copy_plugin_templates(
        bundle_root,
        plugin_name=plugin.name,
        plugin_slug=bundle_slug,
        target_url=plugin.target_url,
        version=version,
        skill_slugs=skill_slugs,
        package_id=package_id,
    )
    _log("Copied plugin templates")

    # ── 4. Write README.md and LICENSE ────────────────────────────────────
    (bundle_root / "README.md").write_text(
        _render_readme(plugin.name, bundle_slug, plugin.target_url, skill_slugs, package_id=package_id),
        encoding="utf-8",
    )
    _log("Written README.md")

    license_path = bundle_root / "LICENSE"
    if not license_path.exists():
        license_path.write_text(_render_license(), encoding="utf-8")
        _log("Written LICENSE")

    # ── 5. Write skill-packs/{company}/ format (for installer runtime) ────────
    try:
        _write_skill_packs_format(
            bundle_root=bundle_root,
            bundle_slug=bundle_slug,
            plugin_name=plugin.name,
            target_url=plugin.target_url,
            protected_url=plugin.protected_url,
            skill_slugs=skill_slugs,
            version=version,
        )
        _log("Written skill-packs format", company=bundle_slug, skills=skill_slugs)
    except Exception as exc:
        _log(f"Warning: skill-packs format write failed — {exc}", warning=True)

    # ── 6. Persist build record ────────────────────────────────────────────
    set_build(plugin_id, output_path=str(bundle_root), version=version)

    return {
        "plugin_id": plugin_id,
        "bundle_slug": bundle_slug,
        "output_path": str(bundle_root),
        "version": version,
        "skills": skill_slugs,
    }


def zip_plugin(plugin_id: str) -> tuple[str, bytes]:
    """Return (filename, zip_bytes) for the compiled plugin folder."""
    plugin = get_plugin(plugin_id)
    if plugin is None:
        raise ValueError(f"Plugin {plugin_id!r} not found.")
    if plugin.build is None:
        raise ValueError("Plugin has not been built yet.")

    bundle_root = Path(plugin.build.output_path)
    if not bundle_root.is_dir():
        raise ValueError(f"Built plugin folder not found: {bundle_root}")

    buf = BytesIO()
    with ZipFile(buf, "w", compression=ZIP_DEFLATED) as zf:
        for file_path in sorted(bundle_root.rglob("*")):
            if not file_path.is_file():
                continue
            rel = file_path.relative_to(bundle_root)
            # auth/* credentials are local runtime state — never include in the zip
            if rel.parts and rel.parts[0] == "auth" and (
                rel.name == "auth.json" or rel.name.startswith("credentials")
            ):
                continue
            arcname = file_path.relative_to(bundle_root.parent).as_posix()
            zf.write(file_path, arcname)

    filename = f"{bundle_root.name}.zip"
    return filename, buf.getvalue()
