"""Tests for accessible-name derivation on elements that have no text of their own.

The-internet.herokuapp.com/hovers regression: a bare <img> carries no aria-label, no
name attribute and no inner text, so the compiler fell through to `label_text` — which
captureAssociatedLabel() fills from the nearest surrounding text. The avatar was named
after the page's paragraph, producing
`internal:role=img[name="Hover over the image for additional information"]`, a name
Playwright never computes. Both the 0.95 role signal and the 0.75 relational signal that
reuses it matched zero elements at replay, and the step failed as "element not found".

Covers:
- An <img> is named from its alt, not from surrounding text.
- label_text names a form control (that IS its accessible name) and nothing else.
- A role selector that matches nothing in the recorded a11y snapshot is dropped rather
  than shipped, taking its relational twin with it.
"""
from __future__ import annotations

from conxa_compile.compiler.identity_bundle import _accessible_name, generate_deterministic_signals

HOVERS_DOM = """
<html><body><div id="content"><div class="example">
  <h3>Hovers</h3>
  <p>Hover over the image for additional information</p>
  <div class="figure"><img src="/img/avatar-blank.jpg" alt="User Avatar">
    <div class="figcaption"><h5>name: user1</h5><a href="/users/1">View profile</a></div>
  </div>
</div></div></body></html>
"""

# What Playwright's accessibility snapshot actually reports for that image — the paragraph
# is its own node, and is never the image's name.
HOVERS_A11Y = {
    "role": "WebArea",
    "name": "The Internet",
    "children": [
        {"role": "heading", "name": "Hovers"},
        {"role": "text", "name": "Hover over the image for additional information"},
        {"role": "img", "name": "User Avatar"},
        {"role": "link", "name": "View profile"},
    ],
}


def _img_event(alt: str | None = "User Avatar") -> dict:
    return {
        "target": {
            "tag": "img",
            "role": "img",
            "inner_text": "",
            "aria_label": None,
            "name": None,
            "placeholder": None,
            "alt": alt,
            "title": None,
            # What captureAssociatedLabel's last-resort "nearest surrounding text" walk finds.
            "label_text": "Hover over the image for additional information",
        },
        "semantic": {"role": "img"},
        "selectors": {
            "css": "div.figure > img",
            "xpath": "/html[1]/body[1]/div[1]/div[1]/div[3]/img[1]",
            "text_based": "",
        },
        "anchors": [{"element": "Hovers"}],
    }


# ---------------------------------------------------------------------------
# _accessible_name
# ---------------------------------------------------------------------------

def test_image_is_named_from_alt_not_surrounding_text():
    assert _accessible_name(_img_event()["target"]) == "User Avatar"


def test_nameless_image_gets_no_name_rather_than_a_borrowed_one():
    """No name is a valid answer — it falls through to structural identity, which is
    strictly better than a name that resolves to nothing."""
    assert _accessible_name(_img_event(alt=None)["target"]) == ""


def test_label_text_still_names_a_form_control():
    target = {
        "tag": "input",
        "role": "textbox",
        "inner_text": "",
        "label_text": "First Name",
    }
    assert _accessible_name(target) == "First Name"


def test_label_text_never_names_a_link():
    target = {"tag": "a", "role": "link", "inner_text": "", "label_text": "Project"}
    assert _accessible_name(target) == ""


# ---------------------------------------------------------------------------
# generate_deterministic_signals
# ---------------------------------------------------------------------------

def test_image_role_signal_uses_alt():
    signals = generate_deterministic_signals(_img_event(), HOVERS_DOM, HOVERS_A11Y)
    role = [s for s in signals if s.engine == "role"]
    assert role, "an <img> with an alt should still get its high-durability role signal"
    assert role[0].selector == 'internal:role=img[name="User Avatar"]'
    assert not any("Hover over the image" in s.selector for s in signals)


def test_fabricated_role_name_is_dropped_with_its_relational_twin():
    """A role+name selector derived from the element's own attributes that matches nothing
    in the very snapshot it came from is fabricated — ship structure instead."""
    ev = _img_event(alt=None)
    ev["target"]["aria_label"] = "Hover over the image for additional information"
    signals = generate_deterministic_signals(ev, HOVERS_DOM, HOVERS_A11Y)
    engines = {s.engine for s in signals}
    assert "role" not in engines
    assert "relational" not in engines
    assert engines, "structural signals must survive so the step is still resolvable"


def test_real_role_name_survives_the_drop():
    signals = generate_deterministic_signals(_img_event(), HOVERS_DOM, HOVERS_A11Y)
    assert any(s.engine == "role" for s in signals)


def test_no_a11y_snapshot_never_drops_a_role_signal():
    """Without an a11y tree a role selector is unverifiable — allow it through rather than
    silently stripping every role signal from packs compiled without a snapshot."""
    ev = _img_event(alt=None)
    ev["target"]["aria_label"] = "Hover over the image for additional information"
    signals = generate_deterministic_signals(ev, HOVERS_DOM, None)
    assert any(s.engine == "role" for s in signals)
