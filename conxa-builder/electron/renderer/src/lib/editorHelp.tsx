import type { ReactNode } from "react"

/**
 * Single source of truth for the contextual help shown on the Human Edit page.
 *
 * Each entry feeds an <InfoHint>: `summary` is the plain-language line everyone
 * sees; `details` is the optional technical deep-dive behind "Technical details".
 * Keep copy here (not inline) so wording stays consistent and editable in one place.
 */
export type HelpEntry = {
  label: string
  summary: ReactNode
  details?: ReactNode
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.7rem] text-zinc-300">
      {children}
    </code>
  )
}

export const editorHelp = {
  // ── "No skill" landing ────────────────────────────────────────────────
  openSkill: {
    label: "Editing a skill",
    summary:
      "A skill is one recorded workflow turned into repeatable steps. Open it here to fine-tune those steps before you build the installer.",
    details: (
      <p>
        Recording then compiling produces a skill package on disk. Editing updates that{" "}
        <em>same</em> package (same id and title). Use “Rebuild from recording” only to discard
        your edits and regenerate from the raw captured events.
      </p>
    ),
  },
  resume: {
    label: "Resume a skill",
    summary:
      "Pick a saved skill from the dropdown, or paste its id, then choose “Load and edit”.",
    details: (
      <p>
        The dropdown lists every compiled skill in this workspace with its version and step count.
        The id field accepts a raw skill id (e.g. <Mono>skill_abc123</Mono>) when you’re linking
        from elsewhere.
      </p>
    ),
  },
  diagnostics: {
    label: "Diagnostics",
    summary:
      "Behind-the-scenes numbers from the editor and compiler. Handy when something looks off — most people can ignore this.",
    details: (
      <p>
        Raw JSON from the backend metrics endpoint: counts, cache hits, and any recent errors.
        Share it when reporting a compile or edit issue.
      </p>
    ),
  },

  // ── Right-rail tools ──────────────────────────────────────────────────
  toolValidation: {
    label: "Validation",
    summary:
      "Shows whether each step is expected to succeed, and explains anything that needs a closer look.",
    details: (
      <p>
        Reports the outcome checks the compiler planned for this workflow (the assertions a run must
        satisfy) plus any failures captured during a test run.
      </p>
    ),
  },
  toolSuggestions: {
    label: "Suggestions",
    summary:
      "AI-generated tips to make this workflow more reliable. Review each one and apply the ones that fit.",
    details: (
      <p>
        Suggestions come from analysing the recorded steps — e.g. brittle selectors, missing waits,
        or values worth turning into inputs. They’re advisory; nothing changes until you act on it.
      </p>
    ),
  },
  toolVariables: {
    label: "Input variables",
    summary:
      "Turn fixed values (like a name or amount) into inputs your customers fill in each run.",
    details: (
      <p>
        Replaces a literal in one or more steps with a <Mono>{`{{variable}}`}</Mono> placeholder.
        At run time the runtime prompts for, or is handed, those values and substitutes them back in.
      </p>
    ),
  },
  toolScreenshots: {
    label: "Recording screenshots",
    summary:
      "Five frames captured around each step (just before to just after). Click or drag one to set the picture used for that step.",
    details: (
      <p>
        Frames span roughly −0.5 s to +0.5 s of the action. The chosen frame anchors visual
        recovery; drag “No image” onto a step to detach it and clear those visual anchors.
      </p>
    ),
  },
  toolSelectors: {
    label: "Compiled selectors",
    summary:
      "The ways the runtime will find this element on the page, listed strongest first.",
    details: (
      <p>
        Each selector is scored by confidence and tried in order. They power Tier&nbsp;1–2 recovery,
        which runs with zero AI cost before any model is consulted.
      </p>
    ),
  },

  // ── Workflow list / step editor ───────────────────────────────────────
  workflowTips: {
    label: "Working with steps",
    summary:
      "Drag steps to reorder them. Select a step to edit it on the right; use the trash icon to remove one.",
    details: (
      <p>
        From <strong>Tools → Recording screenshots</strong>, drag a frame (or “No image”) onto a
        step to swap or clear its screenshot and the anchors derived from it.
      </p>
    ),
  },
  actionStep: {
    label: "This step",
    summary:
      "One action in the workflow — like clicking a button or typing into a field. Edit its details below.",
    details: (
      <p>
        Each step carries a human description, the element it targets, compiled selectors, optional
        visual anchors, and any outcome checks. Edits are saved per step.
      </p>
    ),
  },
  bbox: {
    label: "Visual region",
    summary:
      "The area of the screenshot we matched for this step — a backup way to find the element if the page changes.",
    details: (
      <p>
        Stored as page-level pixels (<Mono>x</Mono>, <Mono>y</Mono>, <Mono>w</Mono>, <Mono>h</Mono>).
        It feeds Tier&nbsp;3 visual recovery: when selectors miss, the runtime looks for this region
        on screen. A region under 2×2&nbsp;px is treated as unusable.
      </p>
    ),
  },
  matchThreshold: {
    label: "Match threshold",
    summary:
      "How close the on-screen picture must be to the saved one to count as a match. Higher is stricter.",
    details: (
      <p>
        A value from 0–1 (default <Mono>0.9</Mono> = 90% similarity). Raise it to avoid false
        matches on busy pages; lower it if a valid element is being missed.
      </p>
    ),
  },
  semanticDescription: {
    label: "Semantic description",
    summary:
      "A plain-English description of the element, used by AI recovery as a last resort.",
    details: (
      <p>
        Consulted at Tier&nbsp;3+ when selectors and visual anchors don’t resolve the element. Clear,
        specific wording improves the model’s chance of finding the right target.
      </p>
    ),
  },
} satisfies Record<string, HelpEntry>

export type EditorHelpKey = keyof typeof editorHelp
