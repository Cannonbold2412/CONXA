"""Human Review Copilot command handlers (BUILD-26 stages b-d).

`cmd_copilot_turn` diagnoses from the evidence bundle and, when it has something to propose,
returns pre-gated proposals as accept/reject diffs — never applying anything itself.
`cmd_accept_copilot_proposal` and `cmd_reject_copilot_proposal` are the two ways a reviewer
disposes of one: accept resolves the proposal's step_key to the CURRENT step_index and delegates
to cmd_patch_step, the same validated, undo-tracked path a manual edit takes; reject writes
straight to the same decision log accept goes through backend.py's dispatch() hook, because a
rejected proposal changes no document and would otherwise leave no trace at all.
"""

from __future__ import annotations

from typing import Any

from handlers.protocol import _CommandError, _event_sink, _safe_id


class CopilotMixin:
    def cmd_copilot_turn(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        from conxa_compile.editor.copilot_proposals import gate_proposals
        from conxa_compile.editor.evidence import EvidenceError, build_evidence_bundle
        from conxa_compile.llm.copilot import copilot_turn
        from conxa_core.storage.json_store import read_skill
        from services.llm_proxy_client import CloudUnreachable, EntitlementBlocked, QuotaExceeded

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        message = str(payload.get("message") or "").strip()
        if not message:
            raise _CommandError("invalid_input", "message is required")
        transcript = payload.get("transcript") if isinstance(payload.get("transcript"), list) else []
        run_id = payload.get("run_id")
        run_id = str(run_id).strip() if run_id else None

        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")

        try:
            evidence = build_evidence_bundle(skill_id, run_id=run_id)
        except EvidenceError as exc:
            raise _CommandError(exc.code, exc.message) from exc

        screenshot_path = (evidence.get("runtime_evidence") or {}).get("failure_screenshot_path")

        sink = _event_sink(rid)
        self._install_proxy_router(sink=sink, usage_class="human_edit")
        try:
            result = copilot_turn(
                evidence=evidence,
                transcript=transcript,
                message=message,
                screenshot_path=screenshot_path,
                on_delta=lambda text: sink({"phase": "copilot_delta", "text": text}),
            )
        except EntitlementBlocked as exc:
            raise _CommandError(exc.code, self._entitlement_error_message(exc.code)) from exc
        except QuotaExceeded as exc:
            raise _CommandError("quota_exceeded", str(exc)) from exc
        except CloudUnreachable as exc:
            raise _CommandError("cloud_unreachable", str(exc)) from exc

        proposals = gate_proposals(doc, result.get("proposals") or [])
        return {"reply": result.get("reply") or "", "proposals": proposals}

    def cmd_accept_copilot_proposal(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        from conxa_compile.editor.copilot_proposals import ProposalError, resolve_step_index
        from conxa_core.storage.json_store import read_skill

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        step_key = str(payload.get("step_key") or "").strip()
        patch = payload.get("patch")
        if not step_key or not isinstance(patch, dict):
            raise _CommandError("invalid_input", "step_key and patch are required")

        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        try:
            step_index = resolve_step_index(doc, step_key)
        except ProposalError as exc:
            raise _CommandError(exc.code, exc.message) from exc

        # Delegates to the exact command a manual edit uses — its own patch_gate re-run, its own
        # undo entry, its own edits.jsonl lines. dispatch()'s edit-log hook attributes the write
        # to THIS command (accept_copilot_proposal, in _EDIT_COMMANDS), not "patch_step", so the
        # accepted line in edits.jsonl carries source="copilot" (backend.py's dispatch()).
        return self.cmd_patch_step(
            {"skill_id": skill_id, "step_index": step_index, "patch": patch}, rid
        )

    def cmd_reject_copilot_proposal(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_compile.editor.edit_log import append_decision

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        step_key = str(payload.get("step_key") or "").strip()
        proposal_id = str(payload.get("proposal_id") or "").strip()
        if not step_key or not proposal_id:
            raise _CommandError("invalid_input", "step_key and proposal_id are required")

        append_decision(
            skill_id,
            proposal_id=proposal_id,
            decision="rejected",
            command=str(payload.get("command") or "patch_step"),
            field=str(payload.get("field") or ""),
            why=str(payload.get("why") or ""),
            step_key=step_key,
        )
        return {"ok": True}
