"""PROD-3 publish-time gate: WorkflowsMixin._require_confirmed_entity_bindings — the check that
actually stops an unconfirmed entity binding on a destructive step from reaching a customer
install (patch_gate's invariant only fires on an edit, not on publish)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from handlers.protocol import _CommandError
from handlers.workflows import WorkflowsMixin


def _skill(steps: list[dict]) -> dict:
    return {"skills": [{"steps": steps}]}


def _delete_step(entity_binding: dict | None) -> dict:
    step = {
        "action": {"action": "click"},
        "semantic": {"final_intent": "delete_invoice_row"},
    }
    if entity_binding is not None:
        step["entity_binding"] = entity_binding
    return step


def _call(skill: dict | None):
    with patch("conxa_core.storage.json_store.read_skill", return_value=skill):
        WorkflowsMixin()._require_confirmed_entity_bindings("skill-1", "delete-invoice")


def test_unconfirmed_binding_on_destructive_step_blocks_publish():
    skill = _skill([_delete_step({
        "container_selector": "table#invoices tr", "identifier": "Invoice #12345",
        "source": "literal", "confirmed": False,
    })])
    with pytest.raises(_CommandError) as exc_info:
        _call(skill)
    assert exc_info.value.code == "irreversible_step_requires_confirmed_entity_binding"


def test_confirmed_binding_on_destructive_step_allows_publish():
    skill = _skill([_delete_step({
        "container_selector": "table#invoices tr", "identifier": "Invoice #12345",
        "source": "literal", "confirmed": True,
    })])
    _call(skill)  # must not raise


def test_destructive_step_with_no_detected_container_allows_publish():
    skill = _skill([_delete_step(None)])
    _call(skill)  # nothing to confirm — no binding was ever detected


def test_non_destructive_step_is_never_gated():
    skill = _skill([{
        "action": {"action": "click"},
        "semantic": {"final_intent": "open_menu"},
        "entity_binding": {"container_selector": "", "identifier": "", "source": "literal", "confirmed": False},
    }])
    _call(skill)  # not destructive — irrelevant even with an (empty) binding present


def test_missing_skill_is_a_no_op():
    _call(None)  # nothing compiled yet — cmd_publish_skill_pack's own earlier check handles this
