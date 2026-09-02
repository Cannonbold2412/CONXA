"""PROD-3 entity binding: repeating-container detection, identifier selection, and the
danger-classification + serializer wiring that makes the runtime halt actually fire."""

from __future__ import annotations

from conxa_compile.compiler.destructive_semantics import classify_consequence
from conxa_compile.compiler.entity_binding import (
    collect_input_literal_values,
    detect_entity_binding,
    upgrade_entity_binding_identifiers,
)
from conxa_compile.skill_package_builder_saved_skill import _copy_saved_common

_POLICY: dict = {}


def _row(tag: str, classes: list[str], text: str) -> str:
    cls = f' class="{" ".join(classes)}"' if classes else ""
    return f"<{tag}{cls}>{text}</{tag}>"


def _table_event(rows: list[str], target_row_index: int, *, parent_id: str = "invoices") -> dict:
    row_tag = "tr"
    row_classes = ["invoice-row"]
    ancestors = [
        {"tag": row_tag, "id": "", "classes": row_classes, "outer_html": rows[target_row_index]},
        {"tag": "tbody", "id": parent_id, "classes": [],
         "outer_html": f'<tbody id="{parent_id}">{"".join(rows)}</tbody>'},
        {"tag": "table", "id": "", "classes": [], "outer_html": ""},
    ]
    return {
        "action": {"action": "click", "value": None},
        "semantic": {"final_intent": "delete_invoice_row", "llm_intent": "delete_invoice_row"},
        "ancestors": ancestors,
    }


class TestDetectEntityBinding:
    def test_detects_repeating_row_and_picks_digit_identifier(self):
        rows = [
            _row("tr", ["invoice-row"], "Invoice #12344 Delete"),
            _row("tr", ["invoice-row"], "Invoice #12345 Delete"),
            _row("tr", ["invoice-row"], "Invoice #12346 Delete"),
        ]
        ev = _table_event(rows, target_row_index=1)
        eb = detect_entity_binding(ev)
        assert eb is not None
        assert "tr" in eb.container_selector
        assert "invoices" in eb.container_selector or "invoice-row" in eb.container_selector
        assert "12345" in eb.identifier
        assert eb.source == "literal"
        assert eb.confirmed is False

    def test_identifier_never_picks_the_action_button_label(self):
        rows = [_row("tr", ["invoice-row"], f"Invoice #{n} Delete") for n in (1, 2, 3)]
        ev = _table_event(rows, target_row_index=0)
        eb = detect_entity_binding(ev)
        assert eb is not None
        assert eb.identifier.lower() != "delete"

    def test_no_repeating_siblings_returns_none(self):
        ev = {
            "action": {"action": "click"},
            "semantic": {"final_intent": "delete_account"},
            "ancestors": [
                {"tag": "div", "id": "", "classes": ["danger-zone"], "outer_html": "<div>Delete my account</div>"},
                {"tag": "section", "id": "", "classes": [],
                 "outer_html": '<section><div class="danger-zone">Delete my account</div></section>'},
            ],
        }
        assert detect_entity_binding(ev) is None

    def test_no_ancestors_returns_none(self):
        assert detect_entity_binding({"action": {"action": "click"}, "ancestors": []}) is None

    def test_single_sibling_below_minimum_returns_none(self):
        rows = [_row("tr", ["invoice-row"], "Invoice #1 Delete")]
        ev = _table_event(rows, target_row_index=0)
        assert detect_entity_binding(ev) is None

    def test_ignores_layout_grid_siblings_far_up_the_tree(self):
        # Regression: a login button on a page built with a Foundation/Bootstrap-style CSS
        # framework, where <body> happens to have two unrelated `<div class="row">` children
        # (a flash-messages banner and the page's own content wrapper) purely for layout.
        # Unbounded ancestor search used to treat that coincidence as a 2-row "list" and pick a
        # fragment of the page's own help text as the record identifier, turning an ordinary
        # button into a phantom record lookup that halts execution with "could not be uniquely
        # located". The real target sits tightly inside its own (non-repeating) form, several
        # levels below body — the row match must not reach that far up the tree.
        ancestors = [
            {"tag": "form", "id": "login", "classes": [], "outer_html": "<form id=\"login\"></form>"},
            {"tag": "div", "id": "", "classes": ["example"], "outer_html": "<div class=\"example\"></div>"},
            {"tag": "div", "id": "content", "classes": ["large-12", "columns"], "outer_html": "<div id=\"content\"></div>"},
            {"tag": "div", "id": "", "classes": ["row"], "outer_html": "<div class=\"row\">page content</div>"},
            {"tag": "body", "id": "", "classes": [],
             "outer_html": (
                 '<body>'
                 '<div class="row"><div id="flash-messages"></div></div>'
                 '<div class="row"><div id="content"></div></div>'
                 '</body>'
             )},
        ]
        ev = {"action": {"action": "click"}, "semantic": {"final_intent": "click_login_button"}, "ancestors": ancestors}
        assert detect_entity_binding(ev) is None


class TestIdentifierUpgrade:
    def test_prefers_declared_input_over_literal(self):
        rows = [
            _row("tr", ["invoice-row"], "Invoice #12344 Delete"),
            _row("tr", ["invoice-row"], "Invoice #12345 Delete"),
        ]
        ev = _table_event(rows, target_row_index=1)
        eb = detect_entity_binding(ev)
        assert eb is not None

        class _Step:
            def __init__(self, entity_binding):
                self.entity_binding = entity_binding

        step = _Step(eb)
        input_values = {"invoice_no": "12345"}
        upgrade_entity_binding_identifiers([step], input_values)
        assert step.entity_binding.identifier == "{{invoice_no}}"
        assert step.entity_binding.source == "input"

    def test_no_match_leaves_literal_untouched(self):
        class _Step:
            def __init__(self, entity_binding):
                self.entity_binding = entity_binding

        from conxa_core.models.skill_spec import EntityBinding
        eb = EntityBinding(container_selector="tr", identifier="Invoice #99999", source="literal", confirmed=False)
        step = _Step(eb)
        upgrade_entity_binding_identifiers([step], {"invoice_no": "12345"})
        assert step.entity_binding.identifier == "Invoice #99999"
        assert step.entity_binding.source == "literal"

    def test_collect_input_literal_values_reads_recorded_fill_events(self):
        events = [
            {
                "action": {"action": "type", "value": "12345"},
                "target": {"tag": "input", "label_text": "Invoice number"},
                "semantic": {},
            },
        ]
        values = collect_input_literal_values(events, _POLICY)
        assert "12345" in values.values()


class TestClassifyConsequence:
    def test_delete_click_is_irreversible(self):
        step = {"action": {"action": "click"}, "semantic": {"final_intent": "delete_invoice"}}
        assert classify_consequence(step, _POLICY) == "irreversible"

    def test_scroll_is_read_only(self):
        step = {"action": {"action": "scroll"}, "semantic": {}}
        assert classify_consequence(step, _POLICY) == "read_only"

    def test_ordinary_click_is_reversible(self):
        step = {"action": {"action": "click"}, "semantic": {"final_intent": "open_menu"}}
        assert classify_consequence(step, _POLICY) == "reversible"

    def test_fill_is_never_irreversible_even_with_destructive_text(self):
        # Irreversible mirrors destructive_compiler_step's click-only gate — a fill/select can
        # feed a later irreversible click but is not itself the point of no return.
        step = {"action": {"action": "fill"}, "semantic": {"final_intent": "delete_confirmation_text"}}
        assert classify_consequence(step, _POLICY) != "irreversible"


class TestSerializerWiring:
    """The bug PROD-3 fixes: identity_bundle.destructive was always False (RecordedEvent has no
    `destructive` field), and even a True value never reached the runtime step's top-level
    `destructive` key that cascade.js actually reads."""

    def test_destructive_identity_bundle_reaches_top_level_execution_step(self):
        step = {"identity_bundle": {"destructive": True, "signals": []}}
        out = _copy_saved_common(step, {"type": "click", "selector": "#delete-btn"})
        assert out["destructive"] is True

    def test_non_destructive_identity_bundle_omits_the_flag(self):
        step = {"identity_bundle": {"destructive": False, "signals": []}}
        out = _copy_saved_common(step, {"type": "click", "selector": "#save-btn"})
        assert "destructive" not in out

    def test_entity_binding_reaches_top_level_execution_step(self):
        step = {
            "identity_bundle": {"destructive": True, "signals": []},
            "entity_binding": {
                "container_selector": "table#invoices tr",
                "identifier": "Invoice #12345",
                "source": "literal",
                "confirmed": True,
            },
        }
        out = _copy_saved_common(step, {"type": "click", "selector": "#delete-btn"})
        assert out["entity_binding"]["identifier"] == "Invoice #12345"

    def test_incomplete_entity_binding_is_not_emitted(self):
        step = {"entity_binding": {"container_selector": "", "identifier": "", "source": "literal"}}
        out = _copy_saved_common(step, {"type": "click", "selector": "#delete-btn"})
        assert "entity_binding" not in out
