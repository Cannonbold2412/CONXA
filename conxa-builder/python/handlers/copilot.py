"""Human Review Copilot command handlers (BUILD-26 stages b-f).

`cmd_copilot_turn` diagnoses from the evidence bundle and, when it has something to propose,
returns pre-gated proposals as accept/reject diffs — never applying anything itself. Two
proposal KINDS exist: `patch_step` (edit a field on an existing step) and, since stage (f),
`insert_overlay_branch` (insert an if_present/try_dismiss branch built from an overlay the
runtime actually observed during a test run — never a selector the model invented).

`cmd_accept_copilot_proposal` and `cmd_reject_copilot_proposal` are the two ways a reviewer
disposes of one. Accept branches on the proposal's `command`: `patch_step` resolves step_key to
the CURRENT step_index and delegates to cmd_patch_step, the same validated, undo-tracked path a
manual edit takes; `insert_overlay_branch` composes cmd_insert_step + cmd_patch_step (+
cmd_insert_branch_step for if_present's nested click) — the same existing, gate-validated RPCs,
no new mutation logic. Reject writes straight to the same decision log accept goes through
backend.py's dispatch() hook, because a rejected proposal changes no document and would
otherwise leave no trace at all.

`cmd_copilot_verify` (stage e) rebuilds the skill package and retests the workflow after an
accepted proposal, then writes a fixed/still_failing/progressed verdict into the same decision
log — the label that says whether an accepted fix actually worked, not just that a human liked it.
"""

from __future__ import annotations

from typing import Any

from handlers.protocol import _CommandError, _event_sink, _safe_id


class CopilotMixin:
    def cmd_copilot_turn(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        from conxa_compile.editor.copilot_proposals import gate_overlay_proposals, gate_proposals
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

        raw_proposals = result.get("proposals") or []
        proposals = gate_proposals(doc, raw_proposals)
        # BUILD-26 stage f: a second proposal KIND from the same model call — an overlay
        # insertion, gated separately since it needs the run's observed_overlays rather than
        # patch_gate's field allow-list. Concatenated: the renderer only ever shows proposals[0].
        observed_overlays = (evidence.get("runtime_evidence") or {}).get("observed_overlays") or []
        if observed_overlays:
            proposals = proposals + gate_overlay_proposals(doc, observed_overlays, raw_proposals)
        return {"reply": result.get("reply") or "", "proposals": proposals}

    def cmd_accept_copilot_proposal(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        # BUILD-26 stage f: a second proposal kind branches here before the patch_step path below
        # even looks at step_key — insert_overlay_branch has no step_key of its own (it inserts a
        # new step, it doesn't edit an existing one).
        if str(payload.get("command") or "").strip() == "insert_overlay_branch":
            return self._accept_overlay_branch_proposal(payload, rid)

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

    def _accept_overlay_branch_proposal(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        """Composes three existing, gate-validated RPCs — cmd_insert_step, cmd_patch_step, and
        (if_present only) cmd_insert_branch_step — rather than writing new mutation logic. All
        three run inside this one dispatch() call, so the edit-log's before/after doc diff (see
        backend.py) captures every change from a single accept as one attributed batch.

        Known ceiling: several internal cmd_* calls means several undo entries for one accept,
        not one compound entry — acceptable for now; only worth collapsing if reviewers complain.
        """
        from conxa_compile.compiler.step_key import step_keys
        from conxa_core.storage.json_store import read_skill

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        primitive = str(payload.get("primitive") or "").strip()
        after_step_key = payload.get("after_step_key")
        patch = payload.get("patch")
        nested_step = payload.get("nested_step")
        if primitive not in ("try_dismiss", "if_present") or not isinstance(patch, dict):
            raise _CommandError("invalid_input", "primitive and patch are required")

        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        skills = doc.get("skills") if isinstance(doc.get("skills"), list) else []
        block0 = skills[0] if skills and isinstance(skills[0], dict) else {}
        steps = block0.get("steps") if isinstance(block0.get("steps"), list) else []

        insert_after: int | None = None
        if after_step_key:
            keys = step_keys(steps)
            try:
                insert_after = keys.index(str(after_step_key))
            except ValueError as exc:
                raise _CommandError(
                    "proposal_stale",
                    "The step this was proposed after no longer exists — the workflow changed since this was proposed.",
                ) from exc
        new_index = (insert_after + 1) if insert_after is not None else len(steps)

        self.cmd_insert_step({"skill_id": skill_id, "action_kind": primitive, "insert_after": insert_after}, rid)
        result = self.cmd_patch_step({"skill_id": skill_id, "step_index": new_index, "patch": patch}, rid)

        if primitive == "if_present" and isinstance(nested_step, dict):
            self.cmd_insert_branch_step({"skill_id": skill_id, "step_index": new_index, "action_kind": "click"}, rid)
            result = self.cmd_patch_step(
                {"skill_id": skill_id, "step_index": new_index, "path": "branch.steps[0]", "patch": nested_step}, rid
            )
        return result

    def cmd_copilot_save_session(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_compile.editor.copilot_sessions import save_copilot_session

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        transcript = payload.get("transcript") if isinstance(payload.get("transcript"), list) else []
        save_copilot_session(skill_id, transcript)
        return {"ok": True}

    def cmd_copilot_verify(self, payload: dict[str, Any], rid: str) -> dict[str, Any]:
        """Rebuild + retest a workflow after an accepted copilot proposal, then log the verdict.

        Two-phase, matching the renderer's confirm-then-run flow: `confirmed=False` (the default)
        only counts steps whose compiled `consequence` is "irreversible" and returns them for a
        confirmation prompt — no build, no browser. `confirmed=True` runs the exact commands a
        reviewer would click by hand (cmd_build_skill_package, then cmd_test_workflow) and derives
        a fixed/still_failing/progressed verdict by comparing the new run's failing step (if any)
        to the step under verification, written into edits.jsonl via append_verification.
        """
        from conxa_core.storage.json_store import read_skill

        from conxa_compile.compiler.step_key import step_keys
        from conxa_compile.editor.edit_log import append_verification
        from conxa_compile.editor.describe import describe_step
        from conxa_compile.editor.evidence import EvidenceError, build_evidence_bundle, find_workflow_for_skill

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        step_key = str(payload.get("step_key") or "").strip()
        proposal_id = str(payload.get("proposal_id") or "").strip() or None
        confirmed = bool(payload.get("confirmed"))

        doc = read_skill(skill_id)
        if doc is None:
            raise _CommandError("skill_not_found", f"No skill {skill_id}")
        workflow = find_workflow_for_skill(skill_id)
        if workflow is None:
            raise _CommandError("workflow_not_found", f"No workflow compiles skill {skill_id}")

        skills = doc.get("skills") if isinstance(doc.get("skills"), list) else []
        block0 = skills[0] if skills and isinstance(skills[0], dict) else {}
        steps = block0.get("steps") if isinstance(block0.get("steps"), list) else []

        if not confirmed:
            # Pre-flight only — CLAUDE.md/PROD-3's own consequence classification, not a re-typed
            # copy of the runtime's step-type idempotency table (they'd disagree). Known ceiling:
            # classify_consequence only marks a destructive/commit CLICK irreversible, so an
            # upload/keyboard-shortcut/checkbox-toggle step counts as 0 here even though the
            # runtime's isNonIdempotent guard treats it as non-reversible too. The dialog names
            # what it actually counted rather than implying a full audit.
            keys = step_keys(steps)
            irreversible = [
                {"step_key": key, "description": describe_step(step, i)}
                for i, (step, key) in enumerate(zip(steps, keys))
                if step.get("consequence") == "irreversible"
            ]
            return {"status": "confirm_required", "irreversible_count": len(irreversible), "irreversible_steps": irreversible}

        sink = _event_sink(rid)

        def _relay(message: str) -> None:
            sink({"phase": "copilot_verify", "text": message})

        _relay("Rebuilding skill package…")
        try:
            self.cmd_build_skill_package({"skill_slug": workflow.slug}, rid)
        except _CommandError as exc:
            _relay(f"Build failed: {exc.message}")
            raise

        _relay(f"Running {workflow.name!r}…")
        try:
            result = self.cmd_test_workflow(
                {"workflow_id": workflow.id, "inputs": workflow.last_test_inputs, "headless": False},
                rid,
            )
        except _CommandError as exc:
            if exc.code != "workflow_test_failed":
                raise
            new_run_id = exc.run_id
            try:
                evidence = build_evidence_bundle(skill_id, run_id=new_run_id) if new_run_id else None
            except EvidenceError:
                evidence = None
            failed_step_key = evidence.get("failed_step_key") if evidence else None
            verdict = "still_failing" if failed_step_key == step_key else "progressed"
            if proposal_id:
                append_verification(
                    skill_id, proposal_id=proposal_id, step_key=step_key, verdict=verdict,
                    run_id=new_run_id or "", message=exc.message,
                )
            _relay(f"Retest failed: {exc.message}")
            return {"status": "verified", "verdict": verdict, "run_id": new_run_id, "message": exc.message}

        if result.get("status") == "cancelled":
            # EXEC-35: a user-initiated cancel is neither a pass nor a failure — writing a verdict
            # for it would poison the correction dataset with a false "fixed"/"still_failing".
            _relay("Verification cancelled.")
            return {"status": "cancelled", "run_id": result.get("run_id")}

        new_run_id = result.get("run_id")
        if proposal_id:
            append_verification(
                skill_id, proposal_id=proposal_id, step_key=step_key, verdict="fixed",
                run_id=new_run_id or "", message=result.get("message") or "",
            )
        _relay("Retest passed.")
        return {"status": "verified", "verdict": "fixed", "run_id": new_run_id, "message": result.get("message")}

    def cmd_reject_copilot_proposal(self, payload: dict[str, Any], _rid: str) -> dict[str, Any]:
        from conxa_compile.editor.edit_log import append_decision

        skill_id = _safe_id(payload.get("skill_id"), "skill_id")
        step_key = str(payload.get("step_key") or "").strip()
        proposal_id = str(payload.get("proposal_id") or "").strip()
        if not proposal_id:
            raise _CommandError("invalid_input", "proposal_id is required")
        if not step_key:
            # insert_overlay_branch proposals (BUILD-26 stage f) insert a new step rather than
            # editing an existing one, so they carry no step_key — log against the overlay
            # instead of leaving the field empty, so the decision log stays one shape.
            overlay_id = str(payload.get("overlay_id") or "").strip()
            step_key = f"overlay:{overlay_id}" if overlay_id else "overlay:unknown"

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
