# Brag Plan: Conxa

## What is this app?
Conxa records a person doing a real cross-system software workflow once, compiles that recording into a self-healing skill, and hands it to Claude and other AI agents to run reliably forever — on software nobody has to modify, executing locally on the customer's own machine.

## The angle
Most AI-and-software demos show an agent *thinking*. This one shows an agent *finishing*. The whole video is the product's own hero moment, played straight: one typed sentence on the left, and on the right three separate internal systems getting driven to completion by something that already knows the way. No API was built. Nothing was modified. The punchline isn't a joke — it's the durability claim: the screens will get redesigned, and the skill will still find its way.

This is specific to Conxa because the source project literally ships a frame-by-frame simulation of this exact run (the hero's execution script and chat steps) — an HR Portal, an Access Control console, and an Onboarding Docs uploader, with a named employee, Priya Shah. The video recreates that run, not a metaphor for it.

## Hook (first 2-3 seconds)
Total void black. A single chat input, cyan caret blinking. One sentence types itself out with dry key ticks:

> Prepare onboarding for the new employee.

Then the cursor hits send. That's the hook: the smallest possible input, on a black screen, promising a lot.

## Key moments (the middle)
- **Three systems, one run.** The browser panel wakes beside the chat. Tab chips light one by one — `HR Portal` then `Access Control` then `Onboarding Docs` — each with a real internal-looking URL (`hr.acmecorp.internal`). A cursor moves, clicks, and fills real fields: `Priya` / `Shah` / `priya.shah@acmecorp.com` / `Product`.
- **The agent narrates its own work.** On the chat side, tool rows tick in as the browser acts: *Create employee record*, *Assign access permissions*, *Upload onboarding documents*, *Send welcome email*. Each row gets a check.
- **The payoff is a toast, not a metric.** `Onboarding complete for Priya Shah.` Understated, the way a real product does it.
- **The durability beat.** A recorded step's button quietly changes — label and position both — and the step resolves anyway, marked `recovered / Tier A`. This is Conxa's actual differentiator and the one thing a viewer should remember.

## Outro / punchline
Black. The wordmark, then the product's own line:

> Teach AI once.
> Let it execute the workflow forever.

## User flow worth showing
Entry → key action → result, taken from the project's own hero simulation:
1. **Entry:** a person types one plain-language request into the agent chat.
2. **Key action:** the agent drives three unrelated internal web apps in sequence — creating a record, assigning permissions, uploading documents, sending an email — with a visible cursor doing visible work.
3. **Result:** a success toast confirming the whole cross-system process finished, plus one step that healed itself along the way.

## Tone
- Preset: `app-store`
- Creative direction: **"Product Launch"** (user-specified) — read as an infrastructure launch film in the project's own register: *the signal in the dark*.
- Interpretation: Clean, feature-forward, present tense, third person. Motion is precise rather than energetic — slides and smooth wipes, nothing dramatic. Colour is rationed: the frame stays near-black and grey, and cyan appears only on the caret, the active tab, the success state, and the final lockup. No superlatives, no invented metrics, no gradient-clip text. The confidence comes from showing the mechanism, not from adjectives.

## Format: landscape — 1920x1080
## Duration: 22s target (scene sum below = 22.0s, flexed to the generated voiceover)

## Visual identity (from the project)
- Background: `#06080b` (Void Black); panels `#0b0f14` (Panel Black); raised/nested `#0f1620`
- Accent: `#22d3ee` (Signal Cyan) to `#5eead4` (Signal Teal), always a 135deg gradient, never cyan plus a second accent
- Text: `#f4f5f7` (Paper White) headlines, `#9ba3af` (Fog Gray) body, `#6b7280` (Ash Gray) meta
- Display font: Geist (Geist Variable), 600 weight, tracking -0.02em
- Body font: Geist (Geist Variable), 400 weight
- Strongest visual element: the hero's two-panel split — agent chat on the left, a simulated browser being driven on the right, with tab chips, a moving cursor, and a success toast. Borders are `white/6`; depth comes from tonal shift and a soft cyan glow, never a drop shadow.

## Share copy (draft)
Record a workflow once. Your AI agent runs it across five systems forever — no API, no integration, and it survives the redesign.

## Audio direction
- Role: Sparse professional accents over a low, steady bed, with narration carrying the story.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (1:58, 109.96 BPM, "steady and clean")
- Music treatment: starts at 0.0 with a short fade-in; bed sits at ~0.30 normally and **ducks to 0.13 for the whole voiceover**, returning up under the final lockup; fades out over the last ~1.2s so the closing line rings into quiet.
- Music cue guidance: bundled preset read — `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`. Tempo 109.96 BPM. Strong cues to target: **13.11s** (the success toast landing) and **18.56s** (the wordmark lockup). Optional third: 8.74s (third tab activating). Beat-grid windows for sequential reveals: tab chips at **4.39 / 7.64 / 9.83**, chat tool rows at **7.09 / 9.29 / 10.37 / 11.46** (about 1.0–1.1s apart — above the reading floor, do not tighten to every beat).
- Audio-reactive treatment: subtle. Use music RMS to let the hero glow behind the panels and the active-tab cyan presence breathe, and bass to give the final wordmark a touch of weight. No waveform bars, no equalizer, no particles. Never let it move text scale.
- SFX posture: sparse and motion-matched — a light consistent interface layer, nothing percussive. All SFX 0.55–0.75.
- Audio-coupled moments: the hook line types character-by-character (randomized keypress ticks, thinned out — not one per character at full volume); send click; each tab chip activation; each chat tool row arriving; the success toast; one soft bell on the wordmark.
- Restraint rule: no drum-fill hits, no whoosh transitions, no error or glitch sounds. The recovery beat is **silent except for one very soft accent** — Conxa's claim is that self-healing is boring and routine, so it must not sound like an alarm. Nothing may compete with the narration.

## Voiceover script
Kokoro voice `af_heart`. Lines map to scenes; scene durations flex to the generated WAV.

1. *(Scene 1)* "This is everything a person types."
2. *(Scene 2)* "Conxa watched someone do this once. Now an agent runs it, across three systems that were never built to talk to each other."
3. *(Scene 3)* "No API. No integration. Nothing to change in the software."
4. *(Scene 4)* "And when the screens change, the skill finds its way."
5. *(Scene 5)* "Conxa. Teach AI once."

## Storyboard

### Scene 1 — One sentence — 3.4s
Void black. Centred, a single agent chat input in a Panel Black card, `white/6` border, cyan caret blinking. The line `Prepare onboarding for the new employee.` types itself out, then a small cursor arrives and clicks send; the line lifts into a user bubble. Nothing else on screen — no logo yet, no chrome.
Sequential/interaction: yes — per-character typing of the request, then a simulated cursor click on send.
Audio intent: quiet, intimate, low-stakes. The smallest possible action.
Audio-coupled idea: randomized `keyboard/keypress-*` ticks thinned across the characters; one `ui/mouseclick1` on send.
Music: bed fading in, already ducked under narration.
Transition mood: clean → Scene 2

### Scene 2 — Three systems, one run — 6.4s
The frame widens into the product's two-panel hero: agent chat left (narrow), simulated browser right (wide). Three tab chips activate in sequence with their real URLs — `HR Portal / hr.acmecorp.internal`, `Access Control / access.acmecorp.internal`, `Onboarding Docs / docs.acmecorp.internal/onboarding`. In the active tab, a cursor moves and fills real fields (`Priya`, `Shah`, `priya.shah@acmecorp.com`, `Product`) and clicks `Save Employee`. On the left, tool rows tick in and check off: *Create employee record*, *Assign access permissions*, *Upload onboarding documents*, *Send welcome email*. Only the active tab carries cyan.
Sequential/interaction: yes — 3 tab chips on the beat grid (4.39 / 7.64 / 9.83), 4 chat tool rows on the beat grid (7.09 / 9.29 / 10.37 / 11.46), each row held at least 0.8s; plus a simulated cursor typing and clicking inside the browser panel.
Audio intent: competent, procedural, unhurried. The sound of work getting done, not of a demo showing off.
Audio-coupled idea: a soft `interface/drop_*` per tab chip; a lighter `interface/select_008` or `ui/click*` per chat tool row; sparse key ticks under the field fills. Accent the first and last of each set, not every item at full volume.
Music: steady bed, ducked.
Transition mood: smooth wipe → Scene 3

### Scene 3 — It finished — 4.2s
The browser panel settles and a success toast slides in over it: `Onboarding complete for Priya Shah.` — the one place a full-saturation cyan-to-teal edge is allowed. Beneath the two panels, one restrained line of Fog Gray body text fades up: `No API. Nothing modified. Running on your machine.` The chat's final assistant line is visible behind it.
Sequential/interaction: yes — toast slides in, then the supporting line fades up 0.6s later (not simultaneously).
Audio intent: the payoff. Confirmation, not celebration.
Audio-coupled idea: one `impact/impactBell_heavy_000` at the toast's first visible frame, short and clean. Nothing on the text line — let the toast carry it.
Music: bed continues, ducked. **Toast beat-locked to the 13.11s strong cue.**
Transition mood: clean → Scene 4

### Scene 4 — Six months later — 4.6s
Same browser panel, dimmed one step to read as "later". A recorded step's target button visibly changes — its label and its position both shift — and a thin cyan trace re-finds it. A small meta chip resolves beside the step: `recovered / Tier A / no AI cost`. Above it, one line of Paper White: `The interface changes. The skill still finds it.`
Sequential/interaction: yes — the button mutates first, then the trace re-finds it, then the chip resolves. Three distinct beats, not one.
Audio intent: deliberately undramatic. Self-healing should sound like routine, not rescue.
Audio-coupled idea: one very soft `interface/drop_001` when the trace lands on the moved button. No error sound, no glitch, no alarm.
Music: bed continues, ducked; a small natural swell is fine but no added hit.
Transition mood: soft → Scene 5

### Scene 5 — Lockup — 3.4s
Cut to void black. The `CONXA` wordmark settles in Paper White with a single soft cyan glow behind it, then the product's own line resolves underneath in two lines:
`Teach AI once.` / `Let it execute the workflow forever.`
A small Ash Gray meta line sits at the bottom: `conxa.io — start free`. Long final hold on near-empty space.
Sequential/interaction: yes — wordmark, then headline line 1, then line 2, then the meta line; each held to the reading floor.
Audio intent: quiet confidence. The bed comes back up, then leaves.
Audio-coupled idea: one `interface/bong_001` under the wordmark, soft; nothing after it.
Music: **wordmark beat-locked to the 18.56s strong cue**; bed returns to ~0.30 as the narration ends, then fades out over the final ~1.2s.
Transition mood: hold to black (end)

**Music mood for this video:** steady, clean, corporate-adjacent but restrained — present enough to carry pace, quiet enough that a security reviewer would not call it a hype reel.
**Audio summary:** A low steady bed ducked under a calm narration, with a precise interface-sound layer matched to real simulated actions — key ticks, tab activations, tool rows — building to a single bell on the success toast, going deliberately quiet through the self-healing beat, and closing with one soft bell under the wordmark as the music fades.

---

## Timing, flexed to the generated voiceover

Kokoro produced: `vo1` 1.8s · `vo2` 7.2s · `vo3` 4.2s · `vo4` 2.9s · `vo5` 1.8s (17.9s of speech). Scene lengths were re-flowed around them, per the voiceover rule that the voice sets the pace. Final render length **24.2s** (still inside the 15–25s law).

| Scene | Window | Length | VO in | VO out |
|---|---|---|---|---|
| 1 One sentence | 0.0 – 3.6 | 3.6s | 0.8 | 2.6 |
| 2 Three systems, one run | 3.6 – 11.5 | 7.9s | 3.9 | 11.1 |
| 3 It finished | 11.5 – 16.2 | 4.7s | 11.7 | 15.9 |
| 4 Six months later | 16.2 – 20.6 | 4.4s | 16.5 | 19.4 |
| 5 Lockup | 20.6 – 24.2 | 3.6s | 20.9 | 22.7 |

Beat locks moved with the re-flow — three, all from the vol-12 preset:
- **13.11s** strong cue — the success toast lands.
- **18.56s** strong cue — the `recovered / Tier A` chip resolves.
- **22.37s** strong cue — the closing line `Let it execute the workflow forever.` resolves.

Sequential reveals stay on the beat grid: tab chips **4.39 / 7.64 / 9.83**, chat tool rows **7.09 / 9.29 / 10.37 / 11.46**.
