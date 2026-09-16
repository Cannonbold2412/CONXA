"""BUILD-30: compile-time detection of a virtualized-list scroll container
(conxa_compile.compiler.virtualized.detect_virtualized_container).

Pure, single-event, deterministic — same event shape and ancestor-chain walk as
entity_binding.py::detect_entity_binding, which this module runs alongside rather than
duplicates. See that module's own false-positive note (a Bootstrap/Tailwind ".row" repeating
all over an ordinary page) for why the same conservatism matters here.
"""

from __future__ import annotations

from conxa_compile.compiler.virtualized import detect_virtualized_container


def _ev(ancestors):
    return {"ancestors": ancestors}


def test_detects_ag_grid_by_class_marker():
    ev = _ev([
        {
            "tag": "div", "id": "", "classes": ["ag-body-viewport", "ag-layout-normal"],
            "outer_html": '<div class="ag-body-viewport ag-layout-normal"></div>',
        },
        {"tag": "div", "id": "grid1", "classes": [], "outer_html": ""},
    ])
    container = detect_virtualized_container(ev)
    assert container
    assert "ag-body-viewport" in container


def test_detects_react_window_inline_style():
    ev = _ev([
        {
            "tag": "div", "id": "list-viewport", "classes": [],
            "outer_html": '<div id="list-viewport" style="overflow-y: auto; height: 400px;"></div>',
        },
    ])
    container = detect_virtualized_container(ev)
    assert container == "#list-viewport"


def test_detects_aria_rowcount_overcount_only_alongside_overflow_style():
    ev = _ev([
        {
            "tag": "div", "id": "", "classes": ["rows"],
            "outer_html": (
                '<div class="rows" style="overflow-y: auto;" aria-rowcount="500">'
                '<div role="row"></div><div role="row"></div>'
                "</div>"
            ),
        },
    ])
    assert detect_virtualized_container(ev) == "div.rows"


def test_aria_rowcount_alone_never_qualifies():
    """The corroborating-only guarantee: an extreme declared/rendered mismatch with no
    overflow style at all must not fire detection on its own."""
    ev = _ev([
        {
            "tag": "div", "id": "", "classes": ["rows"],
            "outer_html": (
                '<div class="rows" aria-rowcount="500">'
                '<div role="row"></div><div role="row"></div>'
                "</div>"
            ),
        },
    ])
    assert detect_virtualized_container(ev) == ""


def test_ordinary_login_page_row_is_not_flagged():
    """The same false-positive class entity_binding.py's _MAX_ROW_SEARCH_DEPTH comment
    documents: a Bootstrap/Tailwind layout ".row" repeats all over an ordinary page and must
    never be mistaken for a virtualized data grid."""
    ev = _ev([
        {"tag": "div", "id": "", "classes": ["row"], "outer_html": '<div class="row"><span>Sign in</span></div>'},
        {"tag": "body", "id": "", "classes": [], "outer_html": ""},
    ])
    assert detect_virtualized_container(ev) == ""


def test_no_ancestors_returns_empty():
    assert detect_virtualized_container({"ancestors": []}) == ""
    assert detect_virtualized_container({}) == ""
