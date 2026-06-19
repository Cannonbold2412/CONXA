# SeleniumBase — Architecture Maps

---

## Component Diagram

```mermaid
graph TD
    subgraph "Public API"
        A[BaseCase self.click/type/assert\nfixtures/base_case.py]
        B[SB context manager\nseleniumbase/sb.py]
    end

    subgraph "Driver Layer — seleniumbase/core/"
        C[browser_launcher.py\n8+ driver types: chrome/firefox/uc/cdp/…]
        D[sb_driver.py\nSB smart-wait wrapper around WebDriver]
        E[sb_cdp.py\nCDPMethods — async CDP via cdp_use]
    end

    subgraph "Reliability Layer"
        F[Fallback Ladder\nnative click → re-find → JS click → jQuery click]
        G[Poll Loop 100ms\nexception-classified retry]
        H[Deferred Asserts\ndeferred_assert_element / assert_all]
    end

    subgraph "Recording — seleniumbase/core/"
        I[recorder_helper.py\ninjected JS event capture]
        J[Codegen output\nPython / pytest script]
    end

    subgraph "CDP / Stealth"
        K[CDPMethods\nasync cdp_use bridge]
        L[UC Mode\nundetected-chromedriver wrapper]
        M[CDP Mode\nraw Chrome DevTools access]
    end

    subgraph "Browser"
        N[Chrome/Firefox/Edge/Safari\nvia WebDriver + CDP]
    end

    A --> D
    B --> C
    C --> N
    D --> F
    F --> G
    D --> E
    E --> K
    K --> M
    C --> L
    L --> N
    I --> J
    H --> A
    D --> N
```

---

## Execution Flow Diagram

```mermaid
sequenceDiagram
    participant Test as Test / BaseCase
    participant SB as sb_driver.py
    participant CDP as CDPMethods
    participant BL as browser_launcher
    participant Browser as Chrome/WebDriver

    Test->>SB: self.click(selector)
    SB->>Browser: WebDriver.find_element(selector)
    alt Element found + clickable
        SB->>Browser: element.click()
        Browser-->>SB: success
    else StaleElementReferenceException
        SB->>Browser: re-find element
        Browser-->>SB: fresh ref
        SB->>Browser: element.click()
    else ElementClickInterceptedException
        SB->>Browser: execute_script("arguments[0].click()")
        Browser-->>SB: JS click result
    else JS click fails
        SB->>Browser: jQuery .click() fallback
        Browser-->>SB: jQuery result
    end
    SB-->>Test: success / raise assertion

    Note over CDP: CDP Mode (bot-detection bypass)
    Test->>SB: self.cdp.click(selector)
    SB->>CDP: CDPMethods.click(selector)
    CDP->>Browser: CDP: Runtime.evaluate + dispatchMouseEvent
    Browser-->>CDP: event result
    CDP-->>Test: ActionResult
```

---

## Data Flow Diagram

```mermaid
flowchart LR
    subgraph "Selector Input"
        A[selector: string\ncss / xpath / text / name / id]
    end

    subgraph "Resolution"
        B[sb_driver.find_element\nWebDriver.find_element]
        C{Exception?}
        D[StaleElement → re-find]
        E[Intercepted → JS click]
        F[JS fail → jQuery click]
    end

    subgraph "CDP Path"
        G[CDPMethods\n__convert_to_css_if_xpath]
        H[cdp_use async client\nRuntime.evaluate]
        I[dispatchMouseEvent / Input.dispatchKeyEvent]
    end

    subgraph "Recording"
        J[injected JS\ndocument event listeners]
        K[action tuple\n{selector, action, value}]
        L[recorder_helper\nPython / pytest codegen]
    end

    subgraph "Deferred Assertions"
        M[deferred_assert_element\ncollect failures]
        N[assert_all\nraise combined AssertionError]
    end

    A --> B --> C
    C -->|clean| B
    C -->|StaleElement| D --> B
    C -->|Intercepted| E
    E -->|fail| F
    A --> G --> H --> I
    J --> K --> L
    M --> N

    style G fill:#fff3cd,stroke:#856404
    style B fill:#d1e7dd,stroke:#0a3622
```
