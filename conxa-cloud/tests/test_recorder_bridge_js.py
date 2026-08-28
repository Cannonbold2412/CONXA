from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

import pytest

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import Browser, Page, sync_playwright

import conxa_compile.recorder as _recorder

BRIDGE_JS = (Path(_recorder.__file__).parent / "bridge.js").read_text(encoding="utf-8")


def _existing_chromium_executable(playwright_chromium) -> str | None:
    default = Path(playwright_chromium.executable_path)
    if default.is_file():
        return str(default)

    candidates: list[Path] = []
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        root = Path(local_app_data) / "ms-playwright"
        candidates.extend(sorted(root.glob("chromium-*/chrome-win64/chrome.exe"), reverse=True))

    for env_name in ("ProgramFiles", "ProgramFiles(x86)"):
        base = os.environ.get(env_name)
        if not base:
            continue
        candidates.append(Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe")
        candidates.append(Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe")

    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


@pytest.fixture(scope="module")
def browser() -> Iterator[Browser]:
    with sync_playwright() as p:
        executable_path = _existing_chromium_executable(p.chromium)
        if not executable_path:
            pytest.skip("Chromium unavailable for recorder bridge tests")
        try:
            browser = p.chromium.launch(headless=True, executable_path=executable_path)
        except Exception as exc:  # pragma: no cover - depends on local browser install
            pytest.skip(f"Chromium unavailable for recorder bridge tests: {exc}")
        try:
            yield browser
        finally:
            browser.close()


@pytest.fixture()
def page(browser: Browser) -> Iterator[Page]:
    page = browser.new_page()
    try:
        yield page
    finally:
        page.close()


def _install_bridge(page: Page, html: str, profile: dict | None = None) -> None:
    page.set_content(html)
    capture_profile = {"input_debounce_ms": 20, "hover_dwell_ms": 35}
    if profile:
        capture_profile.update(profile)
    page.evaluate(
        """args => {
            window.__events = [];
            window.__SKILL_CAPTURE_PROFILE__ = args.profile;
            window.__skillReport = (payload) => window.__events.push(payload);
        }""",
        {"profile": capture_profile},
    )
    page.evaluate(BRIDGE_JS)


def _events(page: Page) -> list[dict]:
    return page.evaluate("() => window.__events")


def _type_events(page: Page) -> list[dict]:
    return [event for event in _events(page) if event["action"]["action"] == "type"]


def _action_events(page: Page, action: str) -> list[dict]:
    return [event for event in _events(page) if event["action"]["action"] == action]


def test_native_input_records_single_debounced_type(page: Page) -> None:
    _install_bridge(page, '<input id="email" name="email" aria-label="Email" />')

    page.click("#email")
    page.keyboard.type("person@example.com")
    page.wait_for_timeout(200)

    events = _type_events(page)
    assert len(events) == 1
    assert events[0]["action"]["value"] == "person@example.com"
    assert events[0]["target"]["tag"] == "input"
    assert events[0]["semantic"]["intent_hint"] == "provide_input"


def test_role_textbox_records_type(page: Page) -> None:
    _install_bridge(
        page,
        '<div id="company" role="textbox" contenteditable="true" aria-label="Company"></div>',
    )

    page.click("#company")
    page.keyboard.type("Acme")
    page.wait_for_timeout(80)

    events = _type_events(page)
    assert len(events) == 1
    assert events[0]["action"]["value"] == "Acme"
    assert events[0]["target"]["role"] == "textbox"


def test_contenteditable_records_type(page: Page) -> None:
    _install_bridge(page, '<div id="notes" contenteditable="true" aria-label="Notes"></div>')

    page.click("#notes")
    page.keyboard.type("Follow up")
    page.wait_for_timeout(80)

    events = _type_events(page)
    assert len(events) == 1
    assert events[0]["action"]["value"] == "Follow up"


def test_open_shadow_root_input_records_type_through_composed_path(page: Page) -> None:
    _install_bridge(
        page,
        """
        <shadow-field id="field"></shadow-field>
        <script>
          customElements.define('shadow-field', class extends HTMLElement {
            connectedCallback() {
              const root = this.attachShadow({ mode: 'open' });
              root.innerHTML = '<input id="inner" name="shadow_email" aria-label="Shadow email" />';
            }
          });
        </script>
        """,
    )

    page.locator("shadow-field input").fill("shadow@example.com")
    page.wait_for_timeout(80)

    events = _type_events(page)
    assert len(events) == 1
    assert events[0]["action"]["value"] == "shadow@example.com"
    assert events[0]["target"]["tag"] == "input"
    assert events[0]["target"]["name"] == "shadow_email"


def test_custom_drawer_role_button_records_click(page: Page) -> None:
    _install_bridge(
        page,
        '<aside role="dialog"><div id="create" role="button" aria-label="Create">Create</div></aside>',
    )

    page.click("#create")
    page.wait_for_timeout(30)

    events = _events(page)
    assert len(events) == 1
    assert events[0]["action"]["action"] == "click"
    assert events[0]["target"]["role"] == "button"
    assert events[0]["target"]["aria_label"] == "Create"


def test_click_that_synchronously_reveals_element_is_captured_in_dom_diff(page: Page) -> None:
    # The click listener runs in the capture phase — before the page's own bubble-phase handler
    # fires. If finalizeState() ran synchronously right there (the historical bug), the "after"
    # snapshot would be taken before this handler's appendChild ever executes, so dom_diff would
    # always come back empty even though the click plainly revealed something.
    _install_bridge(
        page,
        """
        <button id="opener">Open</button>
        <script>
          document.getElementById('opener').addEventListener('click', () => {
            const panel = document.createElement('div');
            panel.setAttribute('data-testid', 'reveal-panel');
            panel.textContent = 'Revealed content';
            document.body.appendChild(panel);
          });
        </script>
        """,
    )

    page.click("#opener")
    page.wait_for_timeout(120)

    click_events = _action_events(page, "click")
    assert len(click_events) == 1
    dom_diff = click_events[0]["state_change"]["dom_diff"]
    assert dom_diff is not None
    added = "\n".join(dom_diff["added"])
    assert "reveal-panel" in added


def test_sidebar_form_fields_and_focusable_button_are_recorded(page: Page) -> None:
    _install_bridge(
        page,
        """
        <button id="createContacts">Create contacts</button>
        <div id="menu" hidden>
          <button id="newContact">New</button>
        </div>
        <aside id="drawer" class="right-sidebar" hidden>
          <label>Name <input id="name" name="contact_name" /></label>
          <label>Email <input id="email" name="email" /></label>
          <div id="submitContact" class="primary-action" tabindex="0">Create</div>
        </aside>
        <div id="toast" hidden>Created contact</div>
        <script>
          document.getElementById('createContacts').addEventListener('click', () => {
            document.getElementById('menu').hidden = false;
          });
          document.getElementById('newContact').addEventListener('click', () => {
            document.getElementById('drawer').hidden = false;
          });
          document.getElementById('submitContact').addEventListener('click', () => {
            document.getElementById('toast').hidden = false;
          });
        </script>
        """,
    )

    page.click("#createContacts")
    page.wait_for_timeout(180)
    page.click("#newContact")
    page.wait_for_timeout(180)
    page.fill("#name", "Ada Lovelace")
    page.fill("#email", "ada@example.com")
    page.wait_for_timeout(80)
    page.click("#submitContact")
    page.wait_for_timeout(180)

    events = _events(page)
    actions = [
        (event["action"]["action"], event["target"]["id"], event["action"]["value"])
        for event in events
        if event["action"]["action"] != "hover"
    ]
    assert actions == [
        ("click", "createContacts", None),
        ("click", "newContact", None),
        ("type", "name", "Ada Lovelace"),
        ("type", "email", "ada@example.com"),
        ("click", "submitContact", None),
    ]


def test_generic_text_click_without_ui_change_is_not_recorded(page: Page) -> None:
    _install_bridge(page, '<div id="plain">Plain text</div>')

    page.click("#plain")
    page.wait_for_timeout(180)

    assert _events(page) == []


def test_iframe_sidebar_form_records_when_bridge_runs_as_init_script(browser: Browser) -> None:
    context = browser.new_context()
    init_script = (
        "window.__SKILL_CAPTURE_PROFILE__ = { input_debounce_ms: 20, hover_dwell_ms: 35 };"
        "window.__skillReport = payload => {"
        "  window.top.__events = window.top.__events || [];"
        "  window.top.__events.push(payload);"
        "};\n"
        + BRIDGE_JS
    )
    context.add_init_script(init_script)
    page = context.new_page()
    try:
        page.set_content(
            """
            <script>window.__events = [];</script>
            <iframe
              id="object-builder-ui"
              data-test-id="object-builder-ui-iframe"
              data-selenium-test="associate-panel-iframe"
              data-iframe-ready="true"
              width="600"
              srcdoc='
              <label>First name <input id="firstName" name="firstname" /></label>
              <button id="create">Create</button>
            '></iframe>
            """
        )

        sidebar = page.frame_locator("#object-builder-ui")
        sidebar.locator("#firstName").fill("Ada")
        page.wait_for_timeout(80)
        sidebar.locator("#create").click()
        page.wait_for_timeout(80)

        actions = page.evaluate(
            "() => window.__events.map(event => [event.action.action, event.target.id, event.action.value])"
        )
        # click() moves the real pointer to #create first, which now also records a
        # legitimate "hover" — filter to the type/click pair this test actually covers.
        type_and_click = [a for a in actions if a[0] in ("type", "click")]
        assert type_and_click == [
            ["type", "firstName", "Ada"],
            ["click", "create", None],
        ]
    finally:
        context.close()


def test_focusable_button_click_records_without_immediate_ui_change(page: Page) -> None:
    _install_bridge(page, '<div id="submitContact" class="primary-action" tabindex="0">Create</div>')

    page.click("#submitContact")
    page.wait_for_timeout(40)

    events = _events(page)
    assert len(events) == 1
    assert events[0]["action"]["action"] == "click"
    assert events[0]["target"]["id"] == "submitContact"


def test_password_input_redacts_value(page: Page) -> None:
    _install_bridge(page, '<input id="password" type="password" name="password" />')

    page.fill("#password", "super-secret")
    page.wait_for_timeout(80)

    events = _type_events(page)
    assert len(events) == 1
    assert events[0]["action"]["value"] == "{{REDACTED}}"
    assert "super-secret" not in str(events[0])


def test_focusout_fallback_records_changed_value_without_input_event(page: Page) -> None:
    _install_bridge(page, '<input id="name" name="name" /><button id="next">Next</button>')

    page.click("#name")
    page.eval_on_selector("#name", "el => { el.value = 'Programmatic change'; }")
    page.click("#next")
    page.wait_for_timeout(80)

    events = _type_events(page)
    assert len(events) == 1
    assert events[0]["action"]["value"] == "Programmatic change"


def test_hover_reveals_menu_records_hover(page: Page) -> None:
    _install_bridge(
        page,
        """
        <nav>
          <div id="crm" role="menuitem" tabindex="0">CRM</div>
        </nav>
        <aside id="drawer" hidden>
          <a href="/contacts" id="contacts">Contacts</a>
        </aside>
        <script>
          document.getElementById('crm').addEventListener('mouseover', () => {
            document.getElementById('drawer').hidden = false;
          });
        </script>
        """,
    )

    page.hover("#crm")
    page.wait_for_timeout(120)

    events = _action_events(page, "hover")
    assert len(events) == 1
    assert events[0]["target"]["id"] == "crm"


def test_hover_reveals_unmarked_css_only_sibling_records_hover(page: Page) -> None:
    # Mirrors the-internet.herokuapp.com/hovers: a bare <img> with no tag/role/ARIA/class
    # hint reveals a hidden sibling purely via CSS :hover — no JS mouseover listener at all.
    _install_bridge(
        page,
        """
        <style>
          .figcaption { display: none; }
          .figure:hover .figcaption { display: block; }
        </style>
        <div class="figure">
          <img id="avatar" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="80" height="80" />
          <div class="figcaption">
            <a href="/users/1" id="view-profile">View profile</a>
          </div>
        </div>
        """,
    )

    page.hover("#avatar")
    page.wait_for_timeout(120)

    events = _action_events(page, "hover")
    assert len(events) == 1
    assert events[0]["target"]["id"] == "avatar"


def test_css_only_hover_style_change_records_nothing(page: Page) -> None:
    _install_bridge(
        page,
        """
        <style>
          #plain:hover { color: rgb(255, 0, 0); background: rgb(240, 240, 240); }
        </style>
        <button id="plain">Plain button</button>
        """,
    )

    page.hover("#plain")
    page.wait_for_timeout(120)

    assert _events(page) == []


def test_hover_target_that_collapses_before_emit_records_nothing(page: Page) -> None:
    _install_bridge(
        page,
        """
        <div id="loading" role="status" style="width: 80px; height: 24px;">Loading</div>
        <aside id="drawer" hidden>
          <button>Ready</button>
        </aside>
        <script>
          document.getElementById('loading').addEventListener('mouseover', () => {
            document.getElementById('loading').style.width = '0px';
            document.getElementById('loading').style.height = '0px';
            document.getElementById('drawer').hidden = false;
          });
        </script>
        """,
    )

    page.dispatch_event("#loading", "mouseover", {"bubbles": True})
    page.wait_for_timeout(120)

    assert _action_events(page, "hover") == []


def test_hover_then_click_revealed_child_records_hover_before_click(page: Page) -> None:
    _install_bridge(
        page,
        """
        <nav>
          <div id="crm" role="menuitem" tabindex="0">CRM</div>
        </nav>
        <aside id="drawer" hidden>
          <button id="contacts">Contacts</button>
        </aside>
        <script>
          document.getElementById('crm').addEventListener('mouseover', () => {
            document.getElementById('drawer').hidden = false;
          });
        </script>
        """,
        profile={"hover_dwell_ms": 1000},
    )

    page.hover("#crm")
    page.wait_for_timeout(80)
    page.click("#contacts")
    page.wait_for_timeout(80)

    actions = [event["action"]["action"] for event in _events(page)]
    assert actions[:2] == ["hover", "click"]
    assert _events(page)[0]["target"]["id"] == "crm"
    assert _events(page)[1]["target"]["id"] == "contacts"


def test_repeated_hover_over_unchanged_target_does_not_duplicate(page: Page) -> None:
    _install_bridge(
        page,
        """
        <nav>
          <div id="crm" role="menuitem" tabindex="0">CRM</div>
        </nav>
        <aside id="drawer" hidden>
          <button id="contacts">Contacts</button>
        </aside>
        <script>
          document.getElementById('crm').addEventListener('mouseover', () => {
            document.getElementById('drawer').hidden = false;
          });
        </script>
        """,
    )

    page.hover("#crm")
    page.wait_for_timeout(120)
    page.mouse.move(5, 5)
    page.wait_for_timeout(100)
    page.hover("#crm")
    page.wait_for_timeout(120)

    events = _action_events(page, "hover")
    assert len(events) == 1


def test_hover_over_static_heading_on_a_link_rich_page_records_nothing(page: Page) -> None:
    # The mouse rests on a static heading for longer than the dwell timer on its way to a real
    # target. Nothing is revealed, so nothing should be recorded — the page's OWN links must
    # never be mistaken for something the hover surfaced.
    #
    # The bridge is installed against an EMPTY document and the content added afterwards, which
    # is what document_start injection looks like in production: the script loads while the page
    # is still parsing. The reveal baseline must be taken once the document is ready, not while
    # it is blank — against a blank baseline every link the page renders counts as "revealed",
    # and the first hover after any page load was recorded as a step.
    _install_bridge(page, "<div id='root'></div>")
    page.evaluate(
        """() => {
            const links = Array.from({length: 40}, (_, i) =>
                `<li><a href="/x${i}">Example ${i}</a></li>`).join("");
            document.getElementById("root").innerHTML =
                `<h2 id="title">Available Examples</h2><ul>${links}</ul>`;
        }"""
    )
    page.wait_for_timeout(150)

    page.hover("#title")
    page.wait_for_timeout(200)

    assert _action_events(page, "hover") == []


def test_hover_after_scrolling_records_nothing(page: Page) -> None:
    # Scrolling brings dozens of off-screen links on screen. A viewport-clipped visibility test
    # reads that as "newly revealed", so the next element the mouse rested on was recorded as a
    # hover step that revealed nothing. Reveal detection must be scroll-independent.
    links = "".join(f'<li><a href="/x{i}">Example {i}</a></li>' for i in range(120))
    _install_bridge(
        page,
        f"<div style='height:1200px'>spacer</div><ul>{links}</ul><h2 id='footer-title'>The End</h2>",
    )

    page.mouse.wheel(0, 3000)
    page.wait_for_timeout(120)
    page.hover("#footer-title")
    page.wait_for_timeout(200)

    assert _action_events(page, "hover") == []
