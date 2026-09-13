"""Generation side of skill-package bundle output: scaffold, write, delete, rename.

Build-Studio-only. The read/list/resolve side of bundle storage (used by both
the cloud dashboard and the Build Studio) lives in
conxa_core.storage.skill_packages; this module handles producing bundle output
during compile and editing it via the workflow editor.
"""

from __future__ import annotations

import json
import re
import shutil
import threading
import time
from contextlib import contextmanager
from pathlib import Path

from conxa_compile.skill_pack_build_log import (
    skill_pack_log_append,
    skill_pack_text_metrics,
)
from conxa_compile.storage.skill_package_formatters import (
    format_auth_json_text as _format_auth_json_text,
    format_credentials_example_json_text as _format_credentials_example_json_text,
    format_test_cases_stub_json_text as _format_test_cases_stub_json_text,
    infer_auth_config as _infer_auth_config,
)
from conxa_core.storage.skill_packages import (
    FIXED_PACKAGE_ROOT,
    SKILLS_SUBDIR,
    VISUAL_IMAGE_SUFFIXES,
    WORKFLOW_FILENAMES,
    WORKFLOWS_SUBDIR,
    _bundle_folder_name,
    _read_visual_asset_bytes,
    _read_visual_assets,
    _sanitize_segment,
    _walk_bundle_files,
    _workflow_package_entries,
    bundle_root_dir,
    skill_package_root_dir,
    validate_bundle_slug,
)

OBSOLETE_WORKFLOW_FILENAMES = (
    "skill.md",
    "skill.json",
    "execution.md",
    "execution_plan.json",
    "inputs.json",
    "input.json",
    "manifest.json",
    "url_state.json",
)

RESERVED_WORKFLOW_FOLDER_NAMES = frozenset({"packages", SKILLS_SUBDIR, WORKFLOWS_SUBDIR})
BUNDLE_RUNTIME_DIRS = ("auth", "execution")
BUNDLE_RUNTIME_FILES = (
    "execution/executor.js",
    "execution/recovery.js",
    "execution/session_manager.js",
    "execution/tracker.js",
    "execution/validator.js",
)
STALE_BUNDLE_DIRS = ("engine", "bridge", "claude", ".opencode", ".codex", "orchestration")


def package_bundle_root_name() -> str:
    """POSIX path segment for the shared container (parent of bundle folders)."""
    return FIXED_PACKAGE_ROOT.as_posix()


def rename_package_bundle_root(new_slug: str) -> str:
    raise ValueError("Bundle root is fixed to output/skill_package.")


def skill_package_root_posix(bundle_slug: str) -> str:
    return f"{package_bundle_root_name()}/{_bundle_folder_name(_sanitize_segment(bundle_slug))}"


# ──────────────────────────────────────────────────────────────────────────────
# Scaffold
# ──────────────────────────────────────────────────────────────────────────────


def ensure_bundle_scaffold(bundle_slug: str) -> Path:
    """Ensure ``<container>/<bundle>-plugin/`` exists with execution/, auth/, skills/."""
    name = _sanitize_segment(bundle_slug)
    if not name or not validate_bundle_slug(name):
        raise ValueError(f'Invalid bundle name "{bundle_slug}".')
    root = skill_package_root_dir() / _bundle_folder_name(name)
    root.mkdir(parents=True, exist_ok=True)

    (root / SKILLS_SUBDIR).mkdir(parents=True, exist_ok=True)
    for dirname in BUNDLE_RUNTIME_DIRS:
        (root / dirname).mkdir(parents=True, exist_ok=True)

    for stale_dir in STALE_BUNDLE_DIRS:
        candidate = root / stale_dir
        if candidate.is_dir():
            shutil.rmtree(candidate)
    return root


# ──────────────────────────────────────────────────────────────────────────────
# Formatter wrappers (public re-exports; sanitize the bundle slug first)
# ──────────────────────────────────────────────────────────────────────────────


def infer_auth_config(all_inputs: list[dict[str, str]]) -> dict[str, object]:
    return _infer_auth_config(all_inputs)


def format_auth_json_text(auth_dict: dict[str, object]) -> str:
    return _format_auth_json_text(auth_dict)


def format_credentials_example_json_text(sensitive_inputs: list[dict[str, str]]) -> str:
    return _format_credentials_example_json_text(sensitive_inputs)


def format_test_cases_stub_json_text(inputs: list[dict[str, str]]) -> str:
    return _format_test_cases_stub_json_text(inputs)


# ──────────────────────────────────────────────────────────────────────────────
# Internal skill discovery helpers
# ──────────────────────────────────────────────────────────────────────────────


# ──────────────────────────────────────────────────────────────────────────────
# Workflow dir resolution
# ──────────────────────────────────────────────────────────────────────────────


def resolve_workflow_dir(bundle_slug: str, workflow_slug: str) -> Path | None:
    """Return skills/<workflow_slug>/ under the bundle, or None if not found."""
    br = bundle_root_dir(bundle_slug)
    if br is None or not br.is_dir():
        return None
    name = _sanitize_segment(workflow_slug)
    if not name:
        return None
    canonical = br / SKILLS_SUBDIR / name
    if canonical.is_dir():
        return canonical
    return None


def skill_package_dir(bundle_slug: str, workflow_slug: str) -> Path:
    """Canonical path for skills/<workflow_slug>/ (creates scaffold)."""
    root = ensure_bundle_scaffold(bundle_slug)
    return root / SKILLS_SUBDIR / _sanitize_segment(workflow_slug)


# ──────────────────────────────────────────────────────────────────────────────
# Visual asset helpers
# ──────────────────────────────────────────────────────────────────────────────


def read_skill_package_visual_asset_bytes(bundle_slug: str, workflow_slug: str) -> dict[str, bytes]:
    path = resolve_workflow_dir(bundle_slug, workflow_slug)
    if path is None:
        return {}
    return _read_visual_asset_bytes(path)


def _sanitize_bundle_relative_path(rel: str) -> str | None:
    """Return a safe relative path under a bundle or workflow folder, or None if unsafe."""
    raw = str(rel or "").strip().replace("\\", "/")
    if not raw or raw.startswith("/"):
        return None
    parts: list[str] = []
    for segment in Path(raw).parts:
        seg = str(segment).strip()
        if not seg or seg == "." or seg == "..":
            return None
        if seg.startswith("."):
            pass  # Allow hidden roots like .opencode/skills/name/SKILL.md
        parts.append(seg)
    if not parts:
        return None
    return str(Path(*parts).as_posix())


def _log_written_text_file(path: str, content: str, started_at: float) -> None:
    skill_pack_log_append(
        {
            "kind": "file_written",
            "path": path,
            **skill_pack_text_metrics(content),
            "elapsed_ms": round((time.perf_counter() - started_at) * 1000, 2),
        }
    )


def _log_written_binary_file(path: str, content: bytes, started_at: float) -> None:
    skill_pack_log_append(
        {
            "kind": "file_written",
            "path": path,
            "bytes": len(content),
            "elapsed_ms": round((time.perf_counter() - started_at) * 1000, 2),
        }
    )


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _remove_file_if_present(path: Path) -> None:
    if path.is_file():
        path.unlink()


def _remove_obsolete_workflow_files(workflow_dir: Path) -> None:
    for filename in OBSOLETE_WORKFLOW_FILENAMES:
        _remove_file_if_present(workflow_dir / filename)


def _write_workflow_text_files(
    workflow_dir: Path,
    files: dict[str, str],
    *,
    log_prefix: str,
) -> None:
    for filename, content in sorted(files.items()):
        if content is None:
            continue
        destination = workflow_dir / filename
        started_at = time.perf_counter()
        _write_text(destination, content)
        _log_written_text_file(f"{log_prefix}/{filename}", content, started_at)


def _workflow_has_visual_assets(visuals_dir: Path) -> bool:
    return any(
        child.is_file() and not child.name.startswith(".") and child.suffix.lower() in VISUAL_IMAGE_SUFFIXES
        for child in visuals_dir.iterdir()
    )


def _write_workflow_visual_assets(
    visuals_dir: Path,
    visual_assets: dict[str, bytes] | None,
    *,
    log_prefix: str,
) -> None:
    if _workflow_has_visual_assets(visuals_dir):
        return

    for filename, content in sorted((visual_assets or {}).items()):
        safe_name = Path(filename).name
        if not safe_name or safe_name.startswith("."):
            continue
        if Path(safe_name).suffix.lower() not in VISUAL_IMAGE_SUFFIXES:
            continue

        destination = visuals_dir / safe_name
        if destination.exists():
            continue

        started_at = time.perf_counter()
        destination.write_bytes(content)
        _log_written_binary_file(f"{log_prefix}/visuals/{safe_name}", content, started_at)


def _write_extra_bundle_files(
    bundle_root: Path | None,
    extra_bundle_files: dict[str, str] | None,
    *,
    log_prefix: str,
) -> None:
    if bundle_root is None:
        return

    for relative_path, content in sorted((extra_bundle_files or {}).items()):
        safe_relative_path = _sanitize_bundle_relative_path(relative_path)
        if safe_relative_path is None:
            continue

        destination = bundle_root / safe_relative_path
        try:
            destination.relative_to(bundle_root)
        except ValueError:
            continue

        started_at = time.perf_counter()
        _write_text(destination, content)
        _log_written_text_file(f"{log_prefix}/{safe_relative_path}", content, started_at)


# ──────────────────────────────────────────────────────────────────────────────
# Write lock
# ──────────────────────────────────────────────────────────────────────────────

_bundle_write_locks: dict[str, threading.Lock] = {}
_bundle_write_lock_registry = threading.Lock()


@contextmanager
def _bundle_write_lock(bundle_slug: str):
    """Serialize filesystem updates that rebuild bundle index for one bundle."""
    key = _sanitize_segment(bundle_slug)
    with _bundle_write_lock_registry:
        lock = _bundle_write_locks.setdefault(key, threading.Lock())
    lock.acquire()
    try:
        yield
    finally:
        lock.release()


# ──────────────────────────────────────────────────────────────────────────────
# Core write
# ──────────────────────────────────────────────────────────────────────────────


def _write_skill_package_files_core(
    bundle_slug: str,
    workflow_slug: str,
    files: dict[str, str],
    *,
    visual_assets: dict[str, bytes] | None = None,
    extra_bundle_files: dict[str, str] | None = None,
) -> Path:
    bundle_root = ensure_bundle_scaffold(bundle_slug)
    workflow_name = _sanitize_segment(workflow_slug)
    if not workflow_name:
        raise ValueError("Invalid workflow folder name.")
    bundle_posix = skill_package_root_posix(bundle_slug)
    workflow_dir = bundle_root / SKILLS_SUBDIR / workflow_name
    workflow_dir.mkdir(parents=True, exist_ok=True)

    visuals_dir = workflow_dir / "visuals"
    visuals_dir.mkdir(parents=True, exist_ok=True)

    workflow_log_prefix = f"{bundle_posix}/skills/{workflow_name}"
    _remove_obsolete_workflow_files(workflow_dir)
    _write_workflow_text_files(workflow_dir, files, log_prefix=workflow_log_prefix)
    _write_workflow_visual_assets(visuals_dir, visual_assets, log_prefix=workflow_log_prefix)
    _write_extra_bundle_files(bundle_root, extra_bundle_files, log_prefix=bundle_posix)
    return workflow_dir


def write_skill_package_files(
    bundle_slug: str,
    workflow_slug: str,
    files: dict[str, str],
    *,
    visual_assets: dict[str, bytes] | None = None,
    extra_bundle_files: dict[str, str] | None = None,
) -> Path:
    with _bundle_write_lock(bundle_slug):
        return write_skill_package_files_unlocked(
            bundle_slug,
            workflow_slug,
            files,
            visual_assets=visual_assets,
            extra_bundle_files=extra_bundle_files,
        )


def write_skill_package_files_unlocked(
    bundle_slug: str,
    workflow_slug: str,
    files: dict[str, str],
    *,
    visual_assets: dict[str, bytes] | None = None,
    extra_bundle_files: dict[str, str] | None = None,
) -> Path:
    """Write workflow files when the caller already holds the bundle write lock."""

    return _write_skill_package_files_core(
        bundle_slug,
        workflow_slug,
        files,
        visual_assets=visual_assets,
        extra_bundle_files=extra_bundle_files,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Display / label helpers
# ──────────────────────────────────────────────────────────────────────────────


def _bundle_has_workflows(bundle_root: Path) -> bool:
    return bool(_workflow_package_entries(bundle_root))


def _bundle_runtime_file_keys(bundle_slug: str) -> list[str]:
    return ["skill_package.json", "README.md", "CLAUDE.md", "package.json", *BUNDLE_RUNTIME_FILES]


def _read_text_file_if_present(path: Path) -> str | None:
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def _read_bundle_runtime_files(bundle_root: Path, bundle_slug: str) -> dict[str, str]:
    return _walk_bundle_files(bundle_root)


def _read_workflow_text_files(workflow_dir: Path, *, prefix: str = "") -> dict[str, str]:
    files: dict[str, str] = {}
    for filename in WORKFLOW_FILENAMES:
        content = _read_text_file_if_present(workflow_dir / filename)
        if content is not None:
            files[f"{prefix}{filename}"] = content

    skill_md = _read_text_file_if_present(workflow_dir / "SKILL.md")
    if skill_md is not None:
        files[f"{prefix}SKILL.md"] = skill_md

    return files


def _workflow_extra_file_keys(bundle_root: Path, workflow_slug: str) -> list[str]:
    workflow_dir = bundle_root / SKILLS_SUBDIR / workflow_slug
    return [
        f"{SKILLS_SUBDIR}/{workflow_slug}/SKILL.md"
        for _ in [None]
        if (workflow_dir / "SKILL.md").is_file()
    ]


def read_skill_package_files(bundle_slug: str, workflow_slug: str) -> dict[str, str] | None:
    """Single-workflow overlay: bundle runtime files plus unprefixed workflow files + visuals/."""
    root = bundle_root_dir(bundle_slug)
    if root is None or not root.is_dir():
        return None
    wf_dir = resolve_workflow_dir(bundle_slug, workflow_slug)
    if wf_dir is None:
        return None

    out = _read_bundle_runtime_files(root, bundle_slug)
    out.update(_read_workflow_text_files(wf_dir))
    out.update(_read_visual_assets(wf_dir))
    return out or None


# ──────────────────────────────────────────────────────────────────────────────
# CRUD operations
# ──────────────────────────────────────────────────────────────────────────────


def delete_skill_package_bundle(bundle_slug: str) -> bool:
    root = bundle_root_dir(bundle_slug)
    if root is None or not root.is_dir():
        return False
    shutil.rmtree(root)
    return True


def rename_skill_package_bundle(old_slug: str, new_slug: str) -> None:
    old = _sanitize_segment(old_slug)
    new = _sanitize_segment(new_slug)
    if old != old_slug or new != new_slug or not old or not new:
        raise ValueError("Invalid bundle name.")
    if not validate_bundle_slug(new):
        raise ValueError(f'Invalid bundle name "{new_slug}".')
    if old == new:
        return
    old_root = bundle_root_dir(old)
    if old_root is None or not old_root.is_dir():
        raise FileNotFoundError(old_slug)
    new_root = skill_package_root_dir() / _bundle_folder_name(new)
    if new_root.exists():
        raise ValueError(f'A skill package named "{new}" already exists.')
    old_root.rename(new_root)
    _remove_file_if_present(new_root / f"{old}.json")


def delete_skill_package_workflow(bundle_slug: str, workflow_slug: str) -> bool:
    path = resolve_workflow_dir(bundle_slug, workflow_slug)
    if path is None or not path.is_dir():
        return False
    shutil.rmtree(path)
    return True


def rename_skill_package_workflow(bundle_slug: str, old_workflow: str, new_workflow: str) -> None:
    old = _sanitize_segment(old_workflow)
    new_s = _sanitize_segment(new_workflow)
    if old != old_workflow or new_s != new_workflow or not old or not new_s:
        raise ValueError("Invalid workflow folder name.")
    if new_s in RESERVED_WORKFLOW_FOLDER_NAMES:
        raise ValueError(f'Reserved name "{new_workflow}" cannot be used.')
    if old == new_s:
        return
    ensure_bundle_scaffold(bundle_slug)
    old_path = resolve_workflow_dir(bundle_slug, old)
    if old_path is None or not old_path.is_dir():
        raise FileNotFoundError(old_workflow)
    new_parent = (bundle_root_dir(bundle_slug) or Path()) / SKILLS_SUBDIR
    new_path = new_parent / new_s
    if new_path.exists():
        raise ValueError(f'A workflow folder named "{new_s}" already exists.')
    old_path.rename(new_path)
    manifest_path = new_path / "manifest.json"
    if manifest_path.is_file():
        try:
            parsed = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            parsed = None
        if isinstance(parsed, dict):
            parsed["name"] = new_s
            manifest_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
