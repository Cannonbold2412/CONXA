# Implementation Status

| Phase | Status | Files touched | Test result |
|-------|--------|---------------|-------------|
| 1. Selector ranking | DONE | selector_score.py, skill_spec.py, test_element_fingerprint.py | 22/22 pass |
| 2. Selector filtering | DONE | selector_filters.py, test_element_fingerprint.py | 34/34 pass |
| 3. IdentityBundle | DONE | skill_spec.py, stable_hash.py, build.py, test_element_fingerprint.py | 42/42 pass |
| 4. Playwright grammar | DONE | llm_selector_generator_v2.py, identity_bundle.py, build.py, test_element_fingerprint.py | 52/52 pass |
| 5. Frame context | DONE | recorder/session.py, build.py, runtime/run.js, test_element_fingerprint.py | 56/56 pass |
| 6. Shadow DOM | DONE | build.py, test_element_fingerprint.py | 60/60 pass |
| 7. Hover support | DONE | skill_spec.py, action_semantics.py, build.py, runtime/run.js, test_element_fingerprint.py | 66/66 py pass; run.js loads |
| 8. Replay verification | DONE | runtime/resolver.js (new), runtime/run.js (GATE+VERIFY), test_resolver.js, test_verify.js | 16/16 node pass |
| 9. Recovery integration | DONE | runtime/recovery.js (new), runtime/run.js (L1 ladder+repair_event), tracking_routes.py (drift queue), test_recovery.js | 27/27 node pass; 218 py pass |

## Cutover: IdentityBundle is the single source of truth (backward-compat removed)

The dual-path backward compatibility was removed and the pure resolver was wired in as the
**primary** runtime resolution path.

| Change | Files |
|--------|-------|
| Resolver wired in as primary path (adapter pattern reusing pure `resolve()`) | `runtime/resolve_adapter.js` (new), `runtime/run.js` (`resolveStep`, `PRIMARY`, `withLocator`) |
| `IdentityBundle` carries nested `fingerprint`; `SkillStep.element_fingerprint` removed; `identity_bundle` required | `packages/conxa-core/.../skill_spec.py`, `compiler/build.py`, `compiler/patch.py` |
| Frame resolution driven solely by `identity_bundle.frame_chain` (legacy `selector`/merge removed) | `recorder/session.py`, `compiler/build.py`, `runtime/run.js` (`rootCandidates`) |
| Legacy compiled-selector recovery tier removed (alternate-signal recovery now inherent) | `runtime/run.js` (`recoverStep`, `recoverWithA11y`) |
| Tests updated + new adapter test | `tests/test_element_fingerprint.py`, `tests/test_recorder_session.py`, `tests/test_phases.py`, `runtime/test/test_resolve_adapter.js` (new) |

**Intended consequence:** packs compiled before the cutover (no `identity_bundle`) fail fast and
must be recompiled — no runtime fallback remains.

**Known follow-up (out of scope):** the Build Studio **saved-skill export**
(`plugin_builder.py:_saved_step_to_execution_step`) still emits legacy `{type, selector}` steps
without an `identity_bundle`; those packs will not replay post-cutover until that path also
generates IdentityBundles. The compiled record→compile pipeline is fully cut over.

**Tests:** Python `test_element_fingerprint.py` 66/66; broader compile suite 211 passed.
Node `test_resolve_adapter.js`(9) + `test_resolver.js`(9) + `test_verify.js`(7) +
`test_recovery.js`(11) + auth/dashboard regression — 36/36 green.

## All phases complete (pre-cutover history below)

**Pipeline now implemented end-to-end** (Record → Compile → Build → Replay → Recover → Verify):

- **Compile (Python):** `generate_deterministic_signals()` produces durability-ranked,
  orthogonality-deduplicated `IdentityBundle`s in Playwright native grammar
  (`internal:role=`, `internal:testid=`, `internal:text=`), gated by uniqueness +
  PII-binding + xpath/shadow guards, with `stable_hash`, multi-signal `frame_chain`,
  `shadow_path`, and `hover_chain` hints.
- **Replay (Node):** pure `resolver.js` walks signals by durability with a strict
  uniqueness/margin gate (never blind `[0]`), `stable_hash` tie-break; `run.js` adds a
  pre-action GATE (attached/visible/RAF-stable/enabled) and an independent post-action VERIFY.
- **Recover (Node):** `recovery.js` L1 exception ladder + L2 re-hover/a11y/anchor cascade,
  emitting a structured `repair_event` drift signal.
- **Flywheel (Cloud):** `GET /api/v1/tracking/{company}/drift` aggregates `repair_event`s into
  an **admin review queue** — detection automatic & fleet-wide, publishing always admin-gated.

### Test summary
- Python: `tests/test_element_fingerprint.py` 66/66; full compiler/model suite 218 passed
  (2 unrelated env failures in `test_conxa_runtime.py`; FastAPI-app integration tests need
  `razorpay`/full stack — not run here).
- Node: `test_resolver.js` (9), `test_verify.js` (7), `test_recovery.js` (11),
  `test_auth_recovery.js` + `test_dashboard_telemetry.js` regression — all green.
  (`test_mcp_client.js` / `test_orchestration.js` fail on `spawn /bin/sh ENOENT` — sandbox
  has no `/bin/sh`, unrelated to these changes.)

### Backward compatibility
- `ElementFingerprint` retained alongside new `IdentityBundle`; runtime falls back to legacy
  `compiled_selectors` / single-string frame selectors when `identity_bundle` is absent.
- GATE/VERIFY are best-effort and no-op when their inputs are missing.
