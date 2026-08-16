"""Skill-package output-directory scaffolding: skill-packs format, templates, docs.

Split out of skill_package_builder.py: writing the skill-packs/{company}/ output
layout, resolving/cleaning the shared package's output directory, copying its
template files, and rendering the generated README/LICENSE.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from conxa_core.sanitize import dumps_safe


# ─────────────────────────────────────────────────
# skill-packs/{company}/ output format
# ─────────────────────────────────────────────────

def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _compute_inputs_required(idata: dict[str, Any]) -> list[str]:
    """Derive the manifest's `inputs_required` from a parsed inputs.json.

    An explicit top-level `required` list (legacy/cloud-authored packages) wins outright.
    Otherwise every declared input is required EXCEPT one flagged `optional` in the editor —
    that flag means the skill may run without it, so it must not block execution
    (runtime/server.js's pre-execution gate) or be advertised as mandatory to the calling agent
    (runtime/server.js's `_skillToolDefinitions`).
    """
    if "required" in idata:
        return list(idata["required"])
    if "inputs" in idata and isinstance(idata["inputs"], list):
        return [
            i["name"]
            for i in idata["inputs"]
            if isinstance(i, dict) and "name" in i and not i.get("optional")
        ]
    return []


def _write_skill_packs_format(
    *,
    bundle_root: Path,
    company_slug: str,
    company_name: str,
    target_url: str,
    protected_url: str,
    skill_slugs: list[str],
    skill_target_urls: dict[str, str],
    version: str,
    skill_group_ids: dict[str, str] | None = None,
    skill_required_apps: dict[str, list[str]] | None = None,
    groups: list[dict[str, Any]] | None = None,
    conxa_api_url: str = "",
    required_runtime: str = "",
) -> None:
    """Write the skill-packs/{company}/ layout alongside the legacy build output.

    This format is consumed by conxa-runtime.exe (the installer-distributed MCP server).
    The legacy skills/ layout is kept untouched for backward compatibility.

    target_url/protected_url are the company-level display defaults (from the first
    workflow, best-effort) — each skill's own manifest.json carries its own accurate
    target_url from skill_target_urls, since different workflows in one shared package
    may automate different pages on the company's site.
    """
    from conxa_core.config import active_environment
    from conxa_core.config import settings

    company      = company_slug
    # Resolve the public base that gets FROZEN into pack.json (sync + tracking) from
    # the active environment, so a dev-built installer embeds the dev cloud and a
    # prod-built one embeds prod — consistently across BOTH sync_endpoint and
    # tracking_url. Explicit overrides win; then SKILL_API_BASE_URL from .env.<env>;
    # then an env-appropriate default. (The old code defaulted to prod and separately
    # special-cased tracking to localhost, which could split the two across envs.)
    _env = active_environment()
    _env_default_base = f"http://127.0.0.1:{settings.port}" if _env == "dev" else "https://apis.conxa.in"
    api_base     = (
        conxa_api_url
        or os.environ.get("CONXA_API_URL")
        or os.environ.get("CONXA_CLOUD_API")
        or (settings.api_base_url or "").strip()
        or _env_default_base
    ).rstrip("/")
    tracking_base = os.environ.get("CONXA_TRACKING_API_URL", api_base).rstrip("/")
    tracking_events_url = os.environ.get("CONXA_TRACKING_EVENTS_URL", "").strip()
    if not tracking_events_url:
        tracking_events_url = f"{tracking_base}/api/tracking/{company}/events"
    skill_packs  = settings.data_dir / "skill-packs" / company

    skill_packs.mkdir(parents=True, exist_ok=True)

    written_slugs: list[str] = []
    skill_groups: dict[str, str] = {}
    for slug in skill_slugs:
        src_dir  = bundle_root / "skills" / slug
        group_id = (skill_group_ids or {}).get(slug) or "_default"
        dest_dir = skill_packs / group_id / slug
        if not src_dir.is_dir():
            continue

        dest_dir.mkdir(parents=True, exist_ok=True)

        # Copy execution.json, recovery.json and visuals unchanged
        for fname in ("execution.json", "recovery.json"):
            src = src_dir / fname
            if src.is_file():
                shutil.copy2(src, dest_dir / fname)

        if (src_dir / "visuals").is_dir():
            dest_visuals = dest_dir / "visuals"
            if dest_visuals.exists():
                shutil.rmtree(dest_visuals)
            shutil.copytree(src_dir / "visuals", dest_visuals)

        # inputs.json (rename from input.json)
        input_src = src_dir / "input.json"
        if input_src.is_file():
            shutil.copy2(input_src, dest_dir / "inputs.json")

        # Compute checksums over the files we wrote
        checksums: dict[str, str] = {}
        for fname in ("execution.json", "recovery.json", "inputs.json"):
            p = dest_dir / fname
            if p.is_file():
                checksums[fname] = _sha256_file(p)

        # Read name/description from input.json or SKILL.md fallback
        skill_name = slug.replace("_", " ").title()
        description = ""
        inputs_p = dest_dir / "inputs.json"
        if inputs_p.is_file():
            try:
                idata = json.loads(inputs_p.read_text(encoding="utf-8"))
                description = idata.get("description", "")
            except Exception:
                pass
        if not description:
            md_p = src_dir / "SKILL.md"
            if md_p.is_file():
                first = next((l.lstrip("# ").strip() for l in md_p.read_text(encoding="utf-8").splitlines() if l.strip()), "")
                description = first

        inputs_required: list[str] = []
        if inputs_p.is_file():
            try:
                idata = json.loads(inputs_p.read_text(encoding="utf-8"))
                inputs_required = _compute_inputs_required(idata)
            except Exception:
                pass

        # Structural fingerprint (optional) for the runtime's pre-execution drift gate.
        structural_fp: dict[str, Any] = {}
        fp_src = src_dir / "structural_fingerprint.json"
        if fp_src.is_file():
            try:
                loaded = json.loads(fp_src.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    structural_fp = loaded
            except (OSError, json.JSONDecodeError):
                structural_fp = {}

        manifest = {
            "slug":             slug,
            "name":             skill_name,
            "description":      description,
            "version":          version,
            # NOTE(branch-steps): if_present/try_dismiss/wait_for_one_of (EXEC-1) require a
            # runtime that recognizes those step types — an older runtime silently no-ops an
            # unknown step type (see runtime/run.js executeStep), which for a branch step means
            # skipping its entire nested body. The branch executor (probePresent/runBranchBody/
            # HANDLERS.if_present|try_dismiss|wait_for_one_of, commit 45896e7) is on `main` but,
            # as of the 2026-07-10 Human Edit branch-authoring work, is NOT YET in any tagged
            # app-vX.Y.Z release (confirmed: `git merge-base --is-ancestor 45896e7 app-v1.3.4`
            # fails). Do NOT hardcode a bump here until that changes — a fabricated version floor
            # would make every pack (branch steps or not) refuse to run on the current app layer.
            # Once the app layer containing 45896e7 is tagged (see MIN_HOST precedent in
            # .github/workflows/build-runtime-app.yml), bump the default below to that tag so
            # packs using branch steps refuse on older runtimes instead of silently skipping
            # their body. Until then, set CONXA_REQUIRED_RUNTIME explicitly for any pack that
            # uses branch steps.
            "required_runtime": required_runtime or os.environ.get("CONXA_REQUIRED_RUNTIME", ">=1.0.3"),
            "company":          company,
            "target_url":       skill_target_urls.get(slug, target_url),
            "group_id":         group_id,
            # Which of the group's apps this specific workflow actually depends on (matched
            # by hostname against the workflow's own target_url/protected_url at build time —
            # see skill_package_builder.py). Empty for a "_default" skill or one that never
            # touches any of its group's apps. Missing on packs built before this field
            # existed, which the runtime group-auth gate treats as "gate on every app" (unchanged
            # legacy behavior, see runtime/browser.js::getGroupAuthContext).
            "required_apps":    (skill_required_apps or {}).get(slug, []),
            "inputs_required":  inputs_required,
            "structural_fingerprint": structural_fp,
            "checksum":         checksums,
        }
        (dest_dir / "manifest.json").write_text(
            dumps_safe(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        written_slugs.append(slug)
        skill_groups[slug] = group_id

    # pack.json at company root
    _req_rt = required_runtime or os.environ.get("CONXA_REQUIRED_RUNTIME", ">=1.0.3")
    pack = {
        "company":            company,
        "company_display":    company_name,
        "skill_pack_version": version,
        "required_runtime":   _req_rt,
        "target_url":         target_url,
        "protected_url":      protected_url,
        "skills":             written_slugs,
        "skill_groups":       skill_groups,
        "groups":             groups or [],
        "sync_endpoint":      f"{api_base}/skill-packs/{company}/delta",
        "built_at":           datetime.now(timezone.utc).isoformat(),
    }

    # Tracking config: embed in pack.json so the runtime knows where to send events
    import hmac as _hmac_mod
    import hashlib as _hash_mod

    _tracking_secret = os.environ.get("SKILL_TRACKING_HMAC_SECRET", "")
    _tracking_token  = ""
    if _tracking_secret:
        _raw = f"{company}:{version}".encode()
        _tracking_token = _hmac_mod.new(_tracking_secret.encode(), _raw, _hash_mod.sha256).hexdigest()
        from conxa_core.db import db_set
        db_set("tracking_tokens", company, {"token": _tracking_token, "version": version})

    # tracking_events_url already derives from the env-consistent api_base above
    # (via tracking_base), so no per-env localhost special-case is needed — dev builds
    # embed the dev cloud, prod builds embed prod, for both sync and tracking.
    pack["tracking"] = {
        "enabled":          True,
        "tracking_url":     tracking_events_url,
        "tracking_token":   _tracking_token,
        "company_id":       company,
        "schema_version":   1,
        "protocol_version": 1,
    }

    (skill_packs / "pack.json").write_text(
        dumps_safe(pack, indent=2, ensure_ascii=False), encoding="utf-8"
    )


# ─────────────────────────────────────────────────
# Skill-package output directory helpers
# ─────────────────────────────────────────────────

def _bundle_root(bundle_slug: str) -> Path:
    from conxa_core.storage.skill_packages import bundle_root_dir
    from conxa_compile.storage.skill_packages_build import ensure_bundle_scaffold
    root = bundle_root_dir(bundle_slug)
    if root is None:
        root = ensure_bundle_scaffold(bundle_slug)
    return root


# ─────────────────────────────────────────────────
# Template helpers
# ─────────────────────────────────────────────────

def _templates_dir() -> Path:
    # Templates ship alongside this module in conxa_compile (bundled by PyInstaller
    # via the source-glob collector in pyinstaller.spec, which walks conxa_compile
    # for *.tmpl/*.gitignore files).
    return Path(__file__).parent / "skill_package_templates"


def _render_skill_package_template(name: str, **subs: str) -> str:
    tmpl = (_templates_dir() / "skill_package" / name).read_text(encoding="utf-8")
    for k, v in subs.items():
        tmpl = tmpl.replace("{{" + k + "}}", v)
    return tmpl


def _copy_skill_package_templates(
    bundle_root: Path,
    *,
    company_name: str,
    bundle_slug: str,
    target_url: str,
    version: str,
    skill_slugs: list[str],
    package_id: str | None = None,
) -> None:
    """Copy skill-package-side templates into bundle_root with substitutions."""
    templates = _templates_dir()

    # .gitignore
    tmpl_gi = templates / "skill_package" / ".gitignore"
    if tmpl_gi.exists():
        (bundle_root / ".gitignore").write_text(tmpl_gi.read_text(encoding="utf-8"), encoding="utf-8")

    install_id = package_id or bundle_slug

    # Claude.md (from template)
    skills_list = "\n".join(f"- `{s}`" for s in skill_slugs)
    (bundle_root / "Claude.md").write_text(
        _render_skill_package_template(
            "Claude.md.tmpl",
            company_name=company_name,
            slug=bundle_slug,
            package_id=install_id,
            target_url=target_url,
            skills_list=skills_list,
        ),
        encoding="utf-8",
    )

    # index.md (from template)
    skills_catalog = "\n".join(f"- `{s}` — see `skills/{s}/SKILL.md`" for s in skill_slugs)
    (bundle_root / "index.md").write_text(
        _render_skill_package_template(
            "index.md.tmpl",
            company_name=company_name,
            slug=bundle_slug,
            target_url=target_url,
            skills_catalog=skills_catalog,
        ),
        encoding="utf-8",
    )

    # Build output stays data-only. Runtime installation is handled by the
    # Windows installer flow, not by an npm CLI package.


def _clean_stale_artifacts(bundle_root: Path) -> None:
    """Remove files from old build architectures before rebuilding."""
    stale_files = [
        "server.js", "run.js", "browser.js", "config.js", "runtime.js",
        "package.json", "package-lock.json", ".mcp.json",
        "plugin.json", "plugin.config.json",  # pre-workflow-collapse manifest filename
        "schema.json",         # removed from build output
        "auth/credentials.example.json",
        "auth/credentials.json",
    ]
    stale_dirs = [
        "execution", "node_modules", "auth/login",
        "runtime", "runtime/node_modules",
        ".claude-plugin",  # old marketplace shim, removed in shared-runtime migration
    ]
    for name in stale_files:
        p = bundle_root / name
        if p.exists():
            p.unlink()
    for name in stale_dirs:
        p = bundle_root / name
        if p.is_dir():
            shutil.rmtree(p)
    # Remove hash-suffixed per-workflow registry json files (e.g. render_c759c810.json)
    for p in bundle_root.glob("*_*.json"):
        p.unlink()


# ─────────────────────────────────────────────────
# Data-only package file generators (kept for README/LICENSE)
# ─────────────────────────────────────────────────


def _render_readme(
    company_name: str,
    bundle_slug: str,
    target_url: str,
    skill_slugs: list[str],
    package_id: str | None = None,
) -> str:
    skills_md = "\n".join(f"- `{s}` — see `skills/{s}/SKILL.md`" for s in skill_slugs)
    install_id = package_id or bundle_slug
    return f"""\
# {company_name}

Automate [{target_url}]({target_url}) with Claude using this Conxa skill pack.

Package ID: `{install_id}`

## Install

This is a data-only skill pack. Use Conxa's Build Installer page to create the
Windows setup file that installs the runtime, registers Claude, and copies these
skills onto the user's machine.

## Available Skills

{skills_md}

## How It Works

This skill pack works with the installed `conxa` MCP runtime. When Claude calls
a skill, a real Chromium browser opens on your machine, executes the recorded
workflow, and returns a result and screenshot. Your auth session stays on your
machine and is never uploaded anywhere.

---
*Generated by [Conxa](https://conxa.in)*
"""


def _render_license() -> str:
    year = datetime.now(timezone.utc).year
    return f"""\
MIT License

Copyright (c) {year} Conxa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""
