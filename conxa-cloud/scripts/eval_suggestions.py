"""Eval harness for the compiler's second opinion (BUILD-25).

Joins compile_report["second_opinion"] — what the pass actually wrote onto the
compiled steps — against each skill's edits.jsonl (editor/edit_log.py) to answer
"did that prompt change help or hurt?" without guesswork.

The join changed meaning when the pass went from suggesting to applying. An edit
on a (step_key, field) the pass wrote is now a reviewer **overriding** it — the
pass got that one wrong. So the headline number is `override_rate` (lower is
better), not a precision score. `miss_rate` is unchanged: edits on the same
fields where the pass said nothing at all.

Neither number is a verdict on its own. A reviewer renaming `sender_email` to
`from_address` is an override that cost nobody anything; one undoing a wrong
`parameterize_literal` is an override that would have shipped a broken input.
The log does not distinguish them — read the actual before/after pairs before
concluding a prompt change helped.

Sits alongside recompile_session.py and needs the same PYTHONPATH.

Usage: PYTHONPATH=../conxa-builder/python python scripts/eval_suggestions.py [--skill <id>]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

# Which reviewer-editable field (edit_log.py's _TRACKED_FIELDS) each applied kind
# is judged against. label_phase has no corresponding single-field edit today, so
# it is reported by volume only, never joined.
_KIND_TO_FIELD = {
    "rename_binding": "input_binding",
    "parameterize_literal": "input_binding",
    "suggest_optional": "optional_hint",
}


def _skill_ids() -> list[str]:
    from conxa_core.storage.json_store import list_skill_summaries

    return [str(s.get("skill_id") or "") for s in list_skill_summaries() if s.get("skill_id")]


def eval_skill(skill_id: str) -> dict[str, Any] | None:
    from conxa_compile.editor.edit_log import read_edits
    from conxa_core.storage.json_store import read_skill

    doc = read_skill(skill_id)
    if not doc:
        return None
    applied = ((doc.get("compile_report") or {}).get("second_opinion")) or []
    edits = read_edits(skill_id)
    if not applied or not edits:
        return None

    edited_pairs = {(e.get("step_key"), e.get("field")) for e in edits}
    joinable = [a for a in applied if a.get("kind") in _KIND_TO_FIELD]
    overrides = sum(1 for a in joinable if (a.get("step_key"), _KIND_TO_FIELD[a["kind"]]) in edited_pairs)

    applied_pairs = {(a.get("step_key"), _KIND_TO_FIELD[a["kind"]]) for a in joinable}
    editable_edits = [e for e in edits if e.get("field") in _KIND_TO_FIELD.values()]
    missed = [e for e in editable_edits if (e.get("step_key"), e.get("field")) not in applied_pairs]

    return {
        "skill_id": skill_id,
        "applied_total": len(applied),
        "applied_joinable": len(joinable),
        "override_rate": round(overrides / len(joinable), 3) if joinable else None,
        "miss_rate": round(len(missed) / len(editable_edits), 3) if editable_edits else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skill", default=None)
    args = parser.parse_args()

    skill_ids = [args.skill] if args.skill else _skill_ids()
    results = [r for sid in skill_ids if (r := eval_skill(sid)) is not None]

    if not results:
        print("No skill has both an applied second opinion and a non-empty edit log yet.")
        return 0

    for r in results:
        print(
            f"{r['skill_id']}: applied={r['applied_total']} "
            f"(joinable={r['applied_joinable']}) "
            f"override_rate={r['override_rate']} miss_rate={r['miss_rate']}"
        )

    rates = [r["override_rate"] for r in results if r["override_rate"] is not None]
    if rates:
        print(f"\nOverall override rate: {round(sum(rates) / len(rates), 3)} across {len(rates)} workflow(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
