# Playwright — Architecture Maps

---

## Component Diagram

```mermaid
graph TD
    subgraph "User / Test Author"
        A[Test Script / Claude Desktop]
    end

    subgraph "Client Layer — packages/playwright-core/src/client/"
        B[Page]
        C[Locator]
        D[Frame]
        E[BrowserContext]
        F[connection.ts / channelOwner.ts]
    end

    subgraph "MCP Layer — src/tools/"
        G[createConnection — mcp/index.ts]
        H[filteredTools — backend/tools.ts]
        I[BrowserBackend — backend/browserBackend.ts]
        J[CDPRelayServer — mcp/cdpRelay.ts]
    end

    subgraph "Protocol Layer — src/protocol/"
        K[Serializer / Validator]
    end

    subgraph "Server Layer — src/server/"
        L[BrowserType / Browser Process]
        M[Recorder / Codegen]
        N[Network Interceptor]
        O[Tracer]
    end

    subgraph "Injected Layer — packages/injected/src/"
        P[selectorGenerator.ts]
        Q[injectedScript.ts — actionability]
        R[ariaSnapshot.ts]
        S[roleUtils.ts]
    end

    subgraph "Browser"
        T[Chromium / Firefox / WebKit via CDP]
    end

    A -->|MCP stdio/HTTP| G
    A -->|Node.js API| B
    G --> H
    H --> I
    I --> E
    B --> C
    B --> D
    B & C & D & E --> F
    F --> K
    K --> L
    L -->|CDP / BiDi| T
    T -->|page.evaluate| P
    T -->|page.evaluate| Q
    T -->|page.evaluate| R
    M --> P
    J -.->|WebSocket bridge| T
```

---

## Execution Flow Diagram

```mermaid
sequenceDiagram
    participant User as User / LLM
    participant PW as Playwright Client
    participant Inj as Injected (in-page)
    participant Browser

    User->>PW: locator.click() or MCP tool_call
    PW->>PW: _wrapApiCall (trace + timeout)
    PW->>Browser: RPC → server.resolveSelector(selectorString)
    Browser->>Inj: evaluate selectorEvaluator.querySelectorAll()
    Inj-->>Browser: matching elements[]

    alt Zero matches
        Browser-->>PW: timeout → StrictModeViolation
    else >1 match in strict mode
        Browser-->>PW: StrictModeViolation
    else Exactly 1 match
        Browser->>Inj: injectedScript.waitForElementStates(attached→visible→stable→enabled)
        loop Poll every 100ms
            Inj-->>Browser: state check result
        end
        Browser->>Inj: perform action (click / fill / etc.)
        Browser-->>PW: ActionResult (success, error?)
        PW-->>User: return / MCP CallToolResult
    end
```

---

## Data Flow Diagram — Record → Compile → Execute

```mermaid
flowchart LR
    subgraph "Record (Codegen)"
        A1[User clicks in browser]
        A2[Recorder captures DOM event]
        A3[selectorGenerator.generateSelector\nScores candidates by cost:\nrole+name < label < text < testid < css-id < css-path]
        A4[Codegen serializes:\npage.getByRole('button',{name:'Submit'})]
    end

    subgraph "Selector String — serializable text"
        B['"role=button[name=Submit]"\nor\n"css=button#submit"']
    end

    subgraph "Execute (runtime)"
        C1[Locator holds selector string\n— NOT a DOM node]
        C2[On each action:\nselectorEvaluator.querySelectorAll re-runs]
        C3[injectedScript.waitForStates\nattached→visible→stable→enabled]
        C4[action dispatches]
        C5[ActionResult → response]
    end

    A1 --> A2 --> A3 --> A4 --> B
    B --> C1 --> C2 --> C3 --> C4 --> C5

    style B fill:#f0f4ff,stroke:#4a6fa5
```
