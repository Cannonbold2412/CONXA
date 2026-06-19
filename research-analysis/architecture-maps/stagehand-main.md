# Stagehand — Architecture Maps

---

## Component Diagram

```mermaid
graph TD
    subgraph "Public API"
        A[stagehand.act / extract / agent]
    end

    subgraph "Agent Loop — lib/v3/agent/"
        B[AgentClient abstract\nAgentClient.ts]
        C[AnthropicCUAClient\nOpenAICUAClient\nGoogleCUAClient]
        D[agent tools:\nact / extract / ariaTree / screenshot\ngoto / scroll / type / wait / think]
        E[actionMapping.ts\nconvertToolUseToAction]
    end

    subgraph "Grounding — lib/v3/dom/ + utils/"
        F[captureAriaTreeProbe.ts\nindependent ARIA snapshot]
        G[ARIA tree serializer\ntextual page representation]
    end

    subgraph "Cache — lib/v3/cache/"
        H[ActCache\ninstruction→Action replay]
        I[AgentCache\ntrajectory replay]
        J[CacheStorage\nfilesystem / memory]
    end

    subgraph "Verifier — lib/v3/verifier/"
        K[rubricVerifier\noffline trajectory QA]
        L[errorTaxonomy\n8-category failure codes]
    end

    subgraph "Inference — lib/inference.ts"
        M[buildActSystemPrompt\nstructured LLM call]
    end

    subgraph "Browser — Playwright"
        N[Playwright Page\ncontext + actions]
    end

    A --> B
    B --> C
    C --> D
    D --> E
    E --> N
    D --> F
    F --> G
    G --> M
    M --> C
    H & I --> J
    H -.->|cache hit: replay| N
    H -.->|cache miss / drift: re-ground| M
    K --> L
    K -.->|offline eval| I
```

---

## Execution Flow Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant SH as Stagehand.act()
    participant Cache as ActCache
    participant PW as Playwright
    participant LLM as CUA Model
    participant V as Verifier (offline)

    U->>SH: act("click Login button")
    SH->>Cache: tryReplay(sha256(instruction+url+vars))
    alt Cache HIT
        Cache->>PW: waitForCachedSelector + takeDeterministicAction
        PW-->>SH: ActionResult
        alt Selector drifted
            SH->>LLM: re-ground (live act() path)
            LLM-->>SH: new Action
            SH->>Cache: refreshCacheEntry (update in place)
        end
    else Cache MISS
        SH->>LLM: buildActSystemPrompt + ARIA tree
        LLM-->>SH: Action {selector, method, arguments}
        SH->>PW: execute Action
        PW-->>SH: ActionResult
        SH->>Cache: writeEntry (selector + instruction + url)
    end
    SH-->>U: ActionResult

    Note over V: Offline (later)
    V->>V: rubricVerifier(trajectory, rubric)
    V-->>V: CriterionScore[] + Finding[] (errorTaxonomy codes)
```

---

## Data Flow Diagram

```mermaid
flowchart LR
    subgraph "Intent"
        A[instruction: string\nurl: string\nvariableKeys: string[]] -->|sha256| B[CacheKey]
    end

    subgraph "Compiled Action"
        C[Action\n{selector, method, arguments[], description}]
    end

    subgraph "Cache"
        B -->|lookup| D{HIT?}
        D -->|yes| E[CachedActEntry\n{version, actions[], variableKeys[]}]
        D -->|no| F[LLM grounding path]
        F -->|inference.ts| G[structured output → Action]
        G --> C
        E --> C
        C -->|write if miss/drift| D
    end

    subgraph "Replay"
        C -->|waitForCachedSelector| H[Playwright waitForSelector]
        H -->|takeDeterministicAction| I[Browser action]
        I -->|ActionResult| J[success / selector_drift?]
        J -->|drift detected| F
    end

    subgraph "Verifier Evidence"
        K[TrajectoryStep\nagentEvidence: what LLM saw\nprobeEvidence: what harness captured\ntoolOutput]
        K --> L[rubricVerifier\ncriterion × evidence → CriterionScore\nerrorTaxonomy code]
    end

    style C fill:#d1e7dd,stroke:#0a3622
    style B fill:#cff4fc,stroke:#055160
```
