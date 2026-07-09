"""Workflow-editor mutation command handlers (patch/reorder/undo/redo/sign-off)."""

from __future__ import annotations

from typing import Any

from handlers.protocol import _CommandError, _deep_merge, _event_sink, _safe_id, _skill_response

class WorkflowEditorMixin:
    def cmd_patch_step(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import copy
        from conxa_core.storage.json_store import read_skill, write_skill
        from conxa_compile.compiler.patch import revalidate_step
        from conxa_compile.compiler.selector_filters import selector_passes_filters
        from conxa_compile.compiler.selector_grammar import rebuild_identity_signals_from_target
        from conxa_compile.compiler.build import _confidence_from_identity_bundle
        from conxa_compile.editor.patch_gate import validate_editor_patch
        from conxa_compile.policy.bundle import get_policy_bundle

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        step_index = int(payload.get("step_index") or 0)
        patch = dict(payload.get("patch") or {})
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        snapshot = copy.deepcopy(doc)
        doc = dict(doc)
        skills = list(doc.get("skills") or [])
        if not skills:
            raise _CommandError("invalid_document", "No skills block")
        block = dict(skills[0])
        steps = list(block.get("steps") or [])
        if step_index < 0 or step_index >= len(steps):
            raise _CommandError("step_not_found", f"Step {step_index} out of range")
        original_step = dict(steps[step_index])

        # Reject patches that would silently drop a required post-condition assertion, an
        # unsupported action kind, or other invariant violations before anything is merged
        # or persisted (`conxa_compile/editor/patch_gate.py`).
        try:
            validate_editor_patch(original_step, patch, get_policy_bundle().data)
        except ValueError as exc:
            raise _CommandError(str(exc), f"Patch rejected: {exc}") from exc

        step = _deep_merge(dict(steps[step_index]), patch)

        # Quality-gate edited selectors before persisting.
        if "target" in patch and isinstance(patch.get("target"), dict):
            tgt = step.get("target") if isinstance(step.get("target"), dict) else {}
            primary = str(tgt.get("primary_selector") or "").strip()
            if primary and not selector_passes_filters(primary):
                raise _CommandError("invalid_selector", f"primary_selector failed quality gates: {primary!r}")
            for fb in (tgt.get("fallback_selectors") or []):
                fb_s = str(fb).strip()
                if fb_s and not selector_passes_filters(fb_s):
                    raise _CommandError("invalid_selector", f"fallback_selector failed quality gates: {fb_s!r}")

            # Rebuild identity_bundle.signals from the edited target selector list so the
            # runtime hot path reflects exactly what the editor shows. Editor order = priority.
            new_signals = rebuild_identity_signals_from_target(step)
            if new_signals:
                bundle = dict(step.get("identity_bundle") or {})
                bundle["signals"] = new_signals
                step["identity_bundle"] = bundle
                # Re-derive selector_confidence from the rebuilt bundle.
                try:
                    step.setdefault("target", {})
                    step["target"]["selector_confidence"] = _confidence_from_identity_bundle(bundle)
                except Exception:
                    pass  # Non-critical — confidence will be recomputed on next compile.

        steps[step_index] = step
        block["steps"] = steps
        skills[0] = block
        doc["skills"] = skills
        meta = dict(doc.get("meta") or {})
        meta["version"] = int(meta.get("version", 1)) + 1
        doc["meta"] = meta
        revalidation = revalidate_step(step)
        self._push_undo(skill_id, snapshot)
        write_skill(skill_id, doc)
        result = _skill_response(skill_id, doc, revalidation)
        result.update(self._history_flags(skill_id))
        return result

    def cmd_validate_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.json_store import read_skill
        from conxa_compile.editor.workflow_mutations import validate_skill_document

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        return validate_skill_document(doc)

    def cmd_reorder_steps(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import copy
        from conxa_core.storage.json_store import read_skill, write_skill
        from conxa_compile.editor.workflow_mutations import reorder_steps

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        new_order = list(payload.get("new_order") or [])
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        self._push_undo(skill_id, copy.deepcopy(doc))
        doc = reorder_steps(doc, new_order)
        write_skill(skill_id, doc)
        result = _skill_response(skill_id, doc)
        result.update(self._history_flags(skill_id))
        return result

    def cmd_insert_step(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import copy
        from conxa_core.storage.json_store import read_skill, write_skill
        from conxa_compile.editor.workflow_mutations import insert_step_after

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        action_kind = str(payload.get("action_kind") or "click")
        insert_after = payload.get("insert_after")
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        self._push_undo(skill_id, copy.deepcopy(doc))
        doc = insert_step_after(doc, action_kind, insert_after)
        write_skill(skill_id, doc)
        result = _skill_response(skill_id, doc)
        result.update(self._history_flags(skill_id))
        return result

    def cmd_delete_step(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import copy
        from conxa_core.storage.json_store import read_skill, write_skill
        from conxa_compile.editor.workflow_mutations import delete_step_at

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        step_index = int(payload.get("step_index") or 0)
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        self._push_undo(skill_id, copy.deepcopy(doc))
        doc = delete_step_at(doc, step_index)
        write_skill(skill_id, doc)
        result = _skill_response(skill_id, doc)
        result.update(self._history_flags(skill_id))
        return result

    def cmd_update_workflow_inputs(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_core.storage.json_store import read_skill, write_skill
        from conxa_compile.editor.workflow_mutations import merge_skill_inputs

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        inputs = list(payload.get("inputs") or [])
        title = payload.get("title")
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        doc = merge_skill_inputs(doc, inputs, title)
        write_skill(skill_id, doc)
        return {"skill_id": skill_id, "ok": True}

    def cmd_replace_literals(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import copy
        from conxa_core.storage.json_store import read_skill, write_skill
        from conxa_compile.editor.workflow_mutations import replace_string_literals_in_skill_document

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        find = str(payload.get("find") or "")
        replace_with = str(payload.get("replace_with") or "")
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        self._push_undo(skill_id, copy.deepcopy(doc))
        doc = replace_string_literals_in_skill_document(doc, find, replace_with)
        write_skill(skill_id, doc)
        result = _skill_response(skill_id, doc)
        result.update(self._history_flags(skill_id))
        return result

    def cmd_undo_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import copy
        from conxa_core.storage.json_store import read_skill, write_skill

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        undo_stack = self._undo_stacks.get(skill_id, [])
        if not undo_stack:
            raise _CommandError("nothing_to_undo", "No undo history for this skill")
        current = read_skill(skill_id)
        if current is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        self._redo_stacks.setdefault(skill_id, []).append(copy.deepcopy(current))
        prev_doc = undo_stack.pop()
        prev_doc = dict(prev_doc)
        meta = dict(prev_doc.get("meta") or {})
        meta["version"] = int(meta.get("version", 1)) + 1
        prev_doc["meta"] = meta
        write_skill(skill_id, prev_doc)
        result = _skill_response(skill_id, prev_doc)
        result.update(self._history_flags(skill_id))
        return result

    def cmd_redo_workflow(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        import copy
        from conxa_core.storage.json_store import read_skill, write_skill

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        redo_stack = self._redo_stacks.get(skill_id, [])
        if not redo_stack:
            raise _CommandError("nothing_to_redo", "No redo history for this skill")
        current = read_skill(skill_id)
        if current is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        self._undo_stacks.setdefault(skill_id, []).append(copy.deepcopy(current))
        next_doc = redo_stack.pop()
        next_doc = dict(next_doc)
        meta = dict(next_doc.get("meta") or {})
        meta["version"] = int(meta.get("version", 1)) + 1
        next_doc["meta"] = meta
        write_skill(skill_id, next_doc)
        result = _skill_response(skill_id, next_doc)
        result.update(self._history_flags(skill_id))
        return result

    def cmd_retarget_preview(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Phase 2/3 preview for the re-target wizard: generate selector candidates and a
        validation diff for a user-drawn bbox, without persisting anything."""
        from conxa_compile.editor.retarget import RetargetError, preview_retarget
        from conxa_core.storage.json_store import read_skill
        from services.llm_proxy_client import CloudUnreachable, EntitlementBlocked, QuotaExceeded

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        step_index = int(payload.get("step_index") or 0)
        bbox = {k: payload.get(k) for k in ("x", "y", "w", "h")}
        # regenerate=False means the user is only reviewing an unchanged element, so the
        # already-compiled selectors are read back — no LLM call, no router needed.
        regenerate = bool(payload.get("regenerate", True))
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        if regenerate:
            self._install_proxy_router(usage_class="human_edit")
        try:
            return preview_retarget(doc, step_index, bbox, regenerate=regenerate)
        except RetargetError as exc:
            raise _CommandError(exc.code, exc.message) from exc
        except EntitlementBlocked as exc:
            raise _CommandError(exc.code, self._entitlement_error_message(exc.code)) from exc
        except QuotaExceeded as exc:
            raise _CommandError("quota_exceeded", str(exc)) from exc
        except CloudUnreachable as exc:
            raise _CommandError("cloud_unreachable", str(exc)) from exc

    def cmd_retarget_apply(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        """Atomically apply the re-target wizard's chosen selector + bbox + validation.

        Lands as a single undo entry — nothing from `cmd_retarget_preview` was persisted.
        """
        import copy

        from conxa_compile.editor.retarget import RetargetError, apply_retarget
        from conxa_compile.compiler.patch import revalidate_step
        from conxa_core.storage.json_store import read_skill, write_skill
        from services.llm_proxy_client import CloudUnreachable, EntitlementBlocked, QuotaExceeded

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        step_index = int(payload.get("step_index") or 0)
        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        snapshot = copy.deepcopy(doc)
        self._install_proxy_router(usage_class="human_edit")
        try:
            doc = apply_retarget(doc, step_index, payload)
        except RetargetError as exc:
            raise _CommandError(exc.code, exc.message) from exc
        except EntitlementBlocked as exc:
            raise _CommandError(exc.code, self._entitlement_error_message(exc.code)) from exc
        except QuotaExceeded as exc:
            raise _CommandError("quota_exceeded", str(exc)) from exc
        except CloudUnreachable as exc:
            raise _CommandError("cloud_unreachable", str(exc)) from exc

        skills = doc.get("skills") or [{}]
        steps = (skills[0] or {}).get("steps") or []
        step = steps[step_index] if step_index < len(steps) else {}
        revalidation = revalidate_step(step)
        self._push_undo(skill_id, snapshot)
        write_skill(skill_id, doc)
        result = _skill_response(skill_id, doc, revalidation)
        result.update(self._history_flags(skill_id))
        return result

    def cmd_sign_off_workflow(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        import time
        from conxa_core.storage.plugin_store import list_plugins, save_plugin

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        target_plugin = None
        for plugin in list_plugins():
            for wf in plugin.workflows:
                if wf.skill_id == skill_id:
                    wf.edited_at = time.time()
                    wf.signed_off = True
                    save_plugin(plugin)
                    target_plugin = plugin
                    break
            if target_plugin is not None:
                break

        if target_plugin is None:
            return {"skill_id": skill_id, "signed_off": True, "built": False, "waiting_on": []}

        # Sign-off gates the build (plugin_builder.py's raise-on-uncompiled/unedited is
        # the enforcement point); auto-build simply fires the moment that gate is
        # satisfied for every workflow in the plugin, so the user never has to visit
        # a separate build page after approving the last one.
        waiting_on = [
            wf.name for wf in target_plugin.workflows if not wf.skill_id or not wf.edited_at
        ]
        if waiting_on:
            return {
                "skill_id": skill_id,
                "signed_off": True,
                "built": False,
                "waiting_on": waiting_on,
            }

        from conxa_compile.plugin_builder import build_plugin

        sink = _event_sink(rid)
        try:
            build_plugin(target_plugin.id, realtime_sink=sink)
            return {"skill_id": skill_id, "signed_off": True, "built": True, "waiting_on": []}
        except Exception as exc:
            sink({"kind": "plugin_build", "message": f"Auto-build failed: {exc}"})
            return {
                "skill_id": skill_id,
                "signed_off": True,
                "built": False,
                "waiting_on": [],
                "build_error": str(exc),
            }

