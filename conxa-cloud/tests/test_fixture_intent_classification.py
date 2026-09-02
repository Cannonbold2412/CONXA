"""The H-1 drift fixture must not look like a commit action to the compiler.

`docs/testing/fixtures/mutator.html` exists to prove the runtime HEALS an element whose id,
class, label and DOM position all drift (test H-1 in `docs/testing/01-WORKFLOWS-TO-TEST.md`).
That only works if recovery is allowed to re-resolve the step.

PROD-3 gives an irreversible step Layer 1 and nothing more — no a11y re-resolution, no agent
park, at any tier (`runtime/app/cascade.js`, `runtime/app/server.js`). So the moment the fixture's
button reads as a commit action, H-1 becomes unwinnable by construction: the step can only ever
fail closed. That is exactly what happened while the button was labelled "Submit" — the compiled
intent was `click_submit_button`, `commit_intent_hit` matched the default
`commit_intent_substrings`, and every replay ended in `destructive_recovery_halted`.

These tests pin the fixture's vocabulary to the policy so that regresses loudly instead of
silently. They deliberately assert against the LIVE policy file rather than a copied list — if
`submit_text_tokens` ever grows to cover one of the fixture's labels, this fails too.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from conxa_compile.compiler.action_semantics import commit_intent_hit
from conxa_compile.compiler.destructive_semantics import classify_consequence

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = REPO_ROOT / "docs" / "testing" / "fixtures" / "mutator.html"
POLICY = (
    REPO_ROOT / "conxa-builder" / "python" / "conxa_compile" / "policy" / "default_policy.json"
)


def _js_string_array(source: str, name: str) -> list[str]:
    """Pull `const <name> = ['a','b'];` out of the fixture's inline script."""
    match = re.search(rf"const\s+{re.escape(name)}\s*=\s*\[(.*?)\]\s*;", source, re.S)
    assert match, f"{name} array not found in {FIXTURE}"
    return re.findall(r"'([^']*)'", match.group(1))


@pytest.fixture(scope="module")
def fixture_source() -> str:
    assert FIXTURE.is_file(), f"missing fixture: {FIXTURE}"
    return FIXTURE.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def workflow_policy() -> dict:
    return json.loads(POLICY.read_text(encoding="utf-8")).get("workflow", {})


def _click_event(label: str, *, intent: str, tag: str = "button", typ: str = "button") -> dict:
    """A recorded click on the fixture's button, in the shape classify_consequence reads."""
    return {
        "action": {"action": "click"},
        "target": {"tag": tag, "type": typ, "inner_text": label, "role": "button"},
        "semantic": {"normalized_text": label, "role": "button", "final_intent": intent},
    }


def test_no_fixture_label_collides_with_the_commit_vocabulary(fixture_source, workflow_policy) -> None:
    labels = _js_string_array(fixture_source, "labels")
    assert labels, "fixture must still rotate through several labels"

    commit = [s.lower() for s in workflow_policy.get("commit_intent_substrings", [])]
    submit_text = [s.lower() for s in workflow_policy.get("submit_text_tokens", [])]
    banned = set(commit) | set(submit_text)
    assert banned, "policy vocabularies must be non-empty or this test proves nothing"

    for label in labels:
        hits = sorted(t for t in banned if t in label.lower())
        assert not hits, (
            f"fixture label {label!r} contains commit/submit vocabulary {hits} — the compiler will "
            f"classify that click irreversible and PROD-3 will refuse to re-resolve it, so the "
            f"H-1 drift test can never heal. Pick a label outside {sorted(banned)}."
        )


def test_no_fixture_element_id_collides_with_the_commit_vocabulary(fixture_source, workflow_policy) -> None:
    """The element id feeds intent derivation too — `btn-submit` is as bad as the label."""
    ids = _js_string_array(fixture_source, "names")
    commit = [s.lower() for s in workflow_policy.get("commit_intent_substrings", [])]
    for element_id in ids:
        hits = sorted(t for t in commit if t in element_id.lower())
        assert not hits, f"fixture id {element_id!r} contains commit vocabulary {hits}"


def test_every_fixture_label_compiles_to_a_recoverable_step(fixture_source, workflow_policy) -> None:
    """End of the chain: whichever label the fixture happens to be showing when the click is
    recorded, the compiled step must be re-resolvable by recovery."""
    policy = {"workflow": workflow_policy}
    for label in _js_string_array(fixture_source, "labels"):
        intent = "click_" + re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") + "_button"
        event = _click_event(label, intent=intent)
        assert not commit_intent_hit(event, policy), f"{label!r} reads as a commit action"
        assert classify_consequence(event, policy) != "irreversible", (
            f"{label!r} compiles to an irreversible step — recovery would be halted at Layer 1"
        )


def test_the_old_submit_label_would_still_be_rejected(workflow_policy) -> None:
    """Guards the guard: proves the assertions above can actually fail. This is the exact shape
    that shipped and produced `destructive_recovery_halted` on every run."""
    policy = {"workflow": workflow_policy}
    event = _click_event("Submit", intent="click_submit_button", typ="submit")
    assert commit_intent_hit(event, policy)
    assert classify_consequence(event, policy) == "irreversible"
