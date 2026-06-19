# SeleniumBase-master

## Repository Summary

- **Purpose**: Mature Python browser automation and testing framework layered on top of Selenium WebDriver. Emphasizes reliability (built-in smart waits, retry on stale elements), stealth automation (CDP mode, undetected-chromedriver), and simplified syntax (`self.click()`, `self.type()`). Targets both automated testing (pytest integration) and scraping/crawling use cases.
- **Estimated size**: ~565 Python files; `seleniumbase/fixtures/base_case.py` alone is 17,413 lines
- **Main language**: Python 3.6+
- **Architectural style**: Class-based (`BaseCase` inherits `unittest.TestCase`); plugin architecture via pytest; modular core utilities; parallel CDP mode for stealth

---

## Entry Points

| Entry | File/Command | Purpose |
|-------|-------------|---------|
| Test class | `from seleniumbase import BaseCase` | Primary API — inherit and write test methods |
| pytest plugin | `seleniumbase/plugins/pytest_plugin.py` | Auto-configures WebDriver, injects fixtures |
| CLI | `sbase` / `seleniumbase` commands | Record, generate, run, translate tests |
| CDP mode | `self.driver.cdp` | Direct CDP async access via `CDPMethods` |
| Script mode | `from seleniumbase import SB` (context manager) | Non-test script usage |

---

## Core Components

| Module | Path | Purpose |
|--------|------|---------|
| **BaseCase** | `seleniumbase/fixtures/base_case.py` | 17K-line main API class — all user-facing methods |
| **sb_cdp** | `seleniumbase/core/sb_cdp.py` | `CDPMethods` — async CDP access, bot-detection bypass, element interaction via CDP |
| **browser_launcher** | `seleniumbase/core/browser_launcher.py` | Launches Chrome/Edge/Firefox/Safari with correct capabilities; integrates undetected-chromedriver |
| **sb_driver** | `seleniumbase/core/sb_driver.py` | `SbDriver` — WebDriver wrapper with smart-wait methods |
| **pytest_plugin** | `seleniumbase/plugins/pytest_plugin.py` | pytest hooks; injects `sb` fixture; CLI arg parsing |
| **recorder_helper** | `seleniumbase/core/recorder_helper.py` | Records user interactions → generates Python test code |
| **page_actions** | `seleniumbase/fixtures/page_actions.py` | Low-level Selenium page interaction primitives |
| **js_utils** | `seleniumbase/fixtures/js_utils.py` | JavaScript execution helpers, XPath-to-CSS conversion |
| **visual_helper** | `seleniumbase/core/visual_helper.py` | Screenshot-based visual regression testing |
| **undetected** | `seleniumbase/undetected/` | Bot-detection evasion (undetected-chromedriver + CDP driver) |
| **capabilities_parser** | `seleniumbase/core/capabilities_parser.py` | Parses browser capability configs |
| **proxy_helper** | `seleniumbase/core/proxy_helper.py` | Proxy configuration for all browser types |

---

## Important Files

### HIGH VALUE

| File | Why |
|------|-----|
| `seleniumbase/fixtures/base_case.py` | **THE API** — 17K lines; every user-facing method (`goto`, `click`, `type`, `assert_*`, `highlight`, `wait_for`, `cdp`). Understanding this file defines the entire user surface. Read structurally (method names + signatures) rather than line-by-line. |
| `seleniumbase/core/sb_cdp.py` | `CDPMethods` class — CDP-based browser control; `__add_sync_methods()` wraps async CDP calls synchronously; click, type, scroll, screenshot via CDP bypass |
| `seleniumbase/core/browser_launcher.py` | Browser initialization with all options (headless, proxy, extension, undetected, CDP mode); integrates 8+ driver types |
| `seleniumbase/core/sb_driver.py` | `SbDriver` — the augmented WebDriver object; smart waits before every action |
| `seleniumbase/plugins/pytest_plugin.py` | pytest integration; `sb` fixture; all CLI flags (`--headless`, `--cdp-mode`, `--proxy`, etc.) |
| `seleniumbase/core/recorder_helper.py` | Recording logic — captures user actions and generates Python test code |
| `seleniumbase/fixtures/page_actions.py` | Underlying WebDriver actions called by BaseCase |

### MEDIUM VALUE

| File | Why |
|------|-----|
| `seleniumbase/fixtures/js_utils.py` | JS injection utilities; XPath→CSS conversion |
| `seleniumbase/core/visual_helper.py` | Visual regression baseline comparison |
| `seleniumbase/core/proxy_helper.py` | Proxy setup across browser types |
| `seleniumbase/core/capabilities_parser.py` | Browser capability YAML/JSON parsing |
| `seleniumbase/undetected/cdp_driver/` | Alternative CDP driver (undetected mode) |
| `seleniumbase/core/session_helper.py` | Session persistence, cookie management |
| `seleniumbase/core/log_helper.py` | Test failure logging, screenshot capture on fail |
| `seleniumbase/fixtures/constants.py` | Browser name constants, timeout values |
| `seleniumbase/config/settings.py` | Default settings and environment variable overrides |
| `seleniumbase/common/decorators.py` | Test decorators (`@retry`, `@slow`, `@flaky`) |

### LOW VALUE

| File | Why |
|------|-----|
| `seleniumbase/core/mysql.py` | MySQL test result storage — rare usage |
| `seleniumbase/core/s3_manager.py` | AWS S3 screenshot storage — deployment concern |
| `seleniumbase/translate/` | Multi-language test code translation |
| `seleniumbase/behave/` | Behave BDD runner integration |
| `seleniumbase/masterqa/` | Manual QA hybrid tool |
| `seleniumbase/resources/` | Static JS files for framework features |
| `seleniumbase/utilities/` | Selenium Grid setup utilities |
| `seleniumbase/extensions/` | Bundled browser extensions |
| `help_docs/` | Documentation markdown |
| `mkdocs_build/` | Documentation build artifacts |
| `integrations/` | CI/CD platform configs (Jenkins, GitHub Actions, etc.) |
| `examples/` | Example test scripts |

---

## Architecture-Relevant Areas

**Execution logic**
- `fixtures/base_case.py` → `self.click()`, `self.type()`, `self.goto()` — all smart-wait wrappers over Selenium
- `fixtures/page_actions.py` → raw WebDriver action primitives
- `core/sb_driver.py` → driver with auto-retry on `StaleElementReferenceException`

**Locator logic**
- `fixtures/base_case.py` — accepts CSS, XPath, text-contains (`:contains()`), link text
- `fixtures/js_utils.py` → `convert_to_css_selector()` — XPath to CSS converter
- `core/sb_driver.py` → `wait_for_element()` with timeout + polling

**Recording logic**
- `core/recorder_helper.py` — captures browser events (click, type, navigate) and generates Python test code
- CLI: `sbase record` command starts the recorder

**CDP / stealth logic**
- `core/sb_cdp.py` → `CDPMethods` — async CDP operations via `mycdp`; bypass bot detection, handle CAPTCHAs
- `core/browser_launcher.py` → `--cdp-mode` flag; also `--uc` (undetected chromedriver)
- `seleniumbase/undetected/` — undetected-chromedriver integration

**Reliability logic**
- `core/sb_driver.py` — smart waits before every action
- `fixtures/base_case.py` — all methods retry on `StaleElementReferenceException`, `ElementNotInteractableException`
- `common/decorators.py` → `@retry` for flaky test recovery

---

## Ignore Recommendations

| Area | Reason | Estimated % |
|------|--------|------------|
| `examples/` | Example scripts | ~8% |
| `help_docs/` | Documentation markdown | ~5% |
| `mkdocs_build/` | Documentation build artifacts | ~5% |
| `integrations/` | CI platform configs | ~3% |
| `seleniumbase/translate/` | Multi-language support | ~3% |
| `seleniumbase/behave/` | BDD framework integration | ~3% |
| `seleniumbase/masterqa/` | Manual QA tool | ~2% |
| `seleniumbase/resources/` | Static JS files | ~2% |
| `seleniumbase/extensions/` | Bundled extensions | ~3% |
| `seleniumbase/utilities/` | Grid setup | ~2% |
| `seleniumbase/core/mysql.py`, `s3_manager.py` | Backend storage | ~1% |

**Estimated ignorable: ~37%**. The value is concentrated in 7 files: `base_case.py`, `sb_cdp.py`, `browser_launcher.py`, `sb_driver.py`, `pytest_plugin.py`, `recorder_helper.py`, `page_actions.py`.

> **Note**: `base_case.py` at 17,413 lines is the single most information-dense file in the corpus — it IS the API. Read it structurally (scan method signatures) rather than linearly. Key method groups: navigation (`goto`, `open`), interaction (`click`, `type`, `hover`, `drag`), assertions (`assert_element`, `assert_text`, `assert_url`), waits (`wait_for_element`, `sleep`), CDP access (`cdp.click`, `cdp.type`), and utilities (`highlight`, `screenshot`, `save_teardown_screenshot`).
