"""Compiled-skill and skill-package storage command handlers."""

from __future__ import annotations

import json
from typing import Any

from handlers.protocol import _CommandError, _safe_id

class SkillPackagesMixin:
    def cmd_list_skills(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from pathlib import Path
        from conxa_core.config import settings

        skills_dir = Path(settings.data_dir) / "skills"
        result = []
        if skills_dir.is_dir():
            for d in sorted(skills_dir.iterdir()):
                skill_json = d / "skill.json"
                if skill_json.is_file():
                    try:
                        doc = json.loads(skill_json.read_text(encoding="utf-8"))
                        meta = doc.get("meta") or {}
                        steps = (doc.get("skills") or [{}])[0].get("steps") or []
                        result.append({
                            "skill_id": d.name,
                            "title": str(meta.get("title") or d.name),
                            "version": int(meta.get("version") or 1),
                            "step_count": len(steps),
                            "modified_at": skill_json.stat().st_mtime,
                        })
                    except Exception:
                        pass
        return {"skills": result}

    def cmd_delete_skill(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import shutil
        from pathlib import Path
        from conxa_core.config import settings

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        skill_dir = Path(settings.data_dir) / "skills" / skill_id
        if not skill_dir.is_dir():
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        title = skill_id
        skill_json = skill_dir / "skill.json"
        if skill_json.is_file():
            try:
                title = str(
                    (json.loads(skill_json.read_text(encoding="utf-8")).get("meta") or {}).get("title") or skill_id
                )
            except Exception:
                pass
        shutil.rmtree(skill_dir)
        return {"skill_id": skill_id, "title": title, "deleted": True}

    def cmd_rename_skill(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.json_store import read_skill, write_skill

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        title = str(payload.get("title") or "").strip()
        if not title:
            raise _CommandError("invalid_input", "title is required")
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        doc = dict(doc)
        meta = dict(doc.get("meta") or {})
        meta["title"] = title
        doc["meta"] = meta
        write_skill(skill_id, doc)
        return {"skill_id": skill_id, "title": title}

    def cmd_get_skill_document(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.json_store import read_skill

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        return doc

    def cmd_get_compiled_skill(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from pathlib import Path
        from conxa_core.storage.skill_pack_store import get_skill_pack
        from conxa_core.workspace import LOCAL_WORKSPACE_ID

        workspace_id = str(payload.get("workspace_id") or "").strip() or LOCAL_WORKSPACE_ID
        skill_slug = str(payload.get("skill_slug") or "").strip()
        if not skill_slug:
            raise _CommandError("invalid_input", "skill_slug is required")
        pack = get_skill_pack(workspace_id)
        if pack is None:
            raise _CommandError("skill_pack_not_found", f"No skill pack built yet for workspace {workspace_id}")
        if pack.build is None:
            raise _CommandError("not_built", "The skill package has not been built yet")
        skill_dir = Path(pack.build.output_path) / "skills" / skill_slug
        if not skill_dir.is_dir():
            raise _CommandError("skill_not_found", f"No compiled skill {skill_slug}")
        files: dict[str, Any] = {}
        for fname in ("execution.json", "recovery.json", "input.json"):
            fpath = skill_dir / fname
            files[fname] = json.loads(fpath.read_text(encoding="utf-8")) if fpath.is_file() else None
        return {"workspace_id": workspace_id, "skill_slug": skill_slug, "files": files}

    # ─── skill packages ──────────────────────────────────────────────────────

    def cmd_list_skill_packages(self, _payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.skill_packages import (
            list_skill_package_summaries,
            skill_package_root_dir,
        )

        root = skill_package_root_dir()
        packages = []
        for package in list_skill_package_summaries():
            package_name = str(package.get("package_name") or "")
            package_folder = f"{package_name}-plugin"
            packages.append(
                {
                    **package,
                    "package_folder": package_folder,
                    "package_path": str(root / package_folder),
                }
            )
        return {"packages": packages, "bundle_root": str(root)}

    def cmd_list_skill_package_files(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.skill_packages import read_skill_package_bundle_files

        package_name = str(payload.get("package_name") or "").strip()
        if not package_name:
            raise _CommandError("invalid_input", "package_name is required")
        files = read_skill_package_bundle_files(package_name)
        if files is None:
            raise _CommandError("package_not_found", f"No package {package_name}")
        return {"package_name": package_name, "files": files}

    def cmd_delete_skill_package(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_compile.storage.skill_packages_build import delete_skill_package_bundle

        package_name = str(payload.get("package_name") or "").strip()
        if not package_name:
            raise _CommandError("invalid_input", "package_name is required")
        if not delete_skill_package_bundle(package_name):
            raise _CommandError("package_not_found", f"No package {package_name}")
        return {"package_name": package_name, "deleted": True}

    def cmd_rename_skill_package(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_compile.storage.skill_packages_build import rename_skill_package_bundle

        package_name = str(payload.get("package_name") or "").strip()
        new_name = str(payload.get("new_name") or "").strip()
        if not package_name or not new_name:
            raise _CommandError("invalid_input", "package_name and new_name are required")
        try:
            rename_skill_package_bundle(package_name, new_name)
        except FileNotFoundError as exc:
            raise _CommandError("package_not_found", f"No package {package_name}") from exc
        except ValueError as exc:
            message = str(exc)
            code = "already_exists" if "already exists" in message else "invalid_input"
            raise _CommandError(code, message) from exc
        return {"package_name": new_name, "previous_name": package_name}

    def cmd_set_skill_pack_bundle_root(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        bundle_root = str(payload.get("bundle_root") or "").strip()
        if not bundle_root:
            raise _CommandError("invalid_input", "bundle_root is required")
        return {"bundle_root": bundle_root}

    # ─── runs ────────────────────────────────────────────────────────────────

