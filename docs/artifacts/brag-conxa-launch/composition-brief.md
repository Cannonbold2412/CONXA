# Hyperframes Composition Brief: Conxa

## Objective
Create a short launch-style brag video for Conxa — an infrastructure launch film that shows one typed sentence turning into a finished, cross-system business process, and then shows that the skill survives the interface changing.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 24.2s (flexed to the generated voiceover; inside the 15–25s law)

## Source Material
- Project root: `C:/Users/Lenovo/Desktop/CONXA`
- Primary files read:
  - `conxa-cloud/frontend/src/components/marketing/hero/Hero.tsx` (headline, subheadline, CTAs)
  - `conxa-cloud/frontend/src/components/marketing/hero/executionScript.ts` (the frame-by-frame simulated run + the agent chat steps)
  - `conxa-cloud/frontend/src/components/marketing/sections/*.tsx` (section headlines)
  - `conxa-cloud/frontend/DESIGN.md` (colors, type, elevation, the "Rare Signal Rule")
  - `conxa-cloud/frontend/PRODUCT.md` (positioning, belief ladder, anti-references)
  - `CLAUDE.md`, `docs/` (what the product actually is)
- Product name: **Conxa**
- Tagline / strongest claim: *Teach AI Once. Let It Execute The Workflow Forever.*
- Key UI moment to recreate: the marketing hero's **two-panel split** — the agent chat panel on the left and the simulated browser on the right, with tab chips, a moving cursor filling real fields, and a success toast. This is the product's own hero, recreated in the product's own palette.
- Copy that must appear verbatim (all of it is the project's own text):
  - `Prepare onboarding for the new employee.`
  - `HR Portal` · `hr.acmecorp.internal`
  - `Access Control` · `access.acmecorp.internal`
  - `Onboarding Docs` · `docs.acmecorp.internal/onboarding`
  - `Priya` · `Shah` · `priya.shah@acmecorp.com` · `Product`
  - `Save Employee`
  - `Create employee record` · `Assign access permissions` · `Upload onboarding documents` · `Send welcome email`
  - `Onboarding complete for Priya Shah`
  - `Teach AI once.` / `Let it execute the workflow forever.`

## Creative Direction
- Tone preset: `app-store`
- Creative direction: **"Product Launch"** (user-specified), read in the project's own register — *the signal in the dark*.
- Interpretation: Clean, feature-forward, present tense. Precise motion, not energetic motion — slides and smooth wipes at 0.35–0.5s, nothing dramatic. Colour is rationed hard: the frame stays void-black and grey, and the cyan→teal signal is allowed on only four things across the whole video (the caret, the active tab, the success toast, the final lockup glow). Depth comes from tonal shift and one soft glow, never a drop shadow.
- Angle: Most AI-and-software demos show an agent *thinking*; this one shows an agent *finishing*. One sentence goes in; three unrelated internal systems get driven to completion by something that already knows the way. No API was built, nothing was modified. The close isn't a joke — it's the durability claim: the screens get redesigned and the skill still finds its way.
- Hook: void black, a single chat input with a blinking cyan caret, and `Prepare onboarding for the new employee.` typing itself out with dry key ticks. Nothing else on screen.
- Outro / punchline: `CONXA` wordmark on black, then `Teach AI once.` / `Let it execute the workflow forever.`
- Avoid:
  - Generic SaaS language ("streamline", "supercharge", "next-gen", "10x")
  - **Any invented metric.** The project's own reliability figures are labelled illustrative in source; do not put a percentage, uptime number, or "88%" on screen.
  - Gradient-clip headline text and per-section uppercase tracked eyebrows (both are explicit Don'ts in the project's design system)
  - Abstract filler visuals, particle fields, waveform bars, equalizers
  - Drop shadows on near-black surfaces
  - Unrelated visual redesign — this is Conxa's palette, not a new one

## Visual Identity
- Background: `#06080b` (Void Black); panels `#0b0f14` (Panel Black); nested/raised `#0f1620`
- Text: `#f4f5f7` (Paper White) / `#9ba3af` (Fog Gray) / `#6b7280` (Ash Gray)
- Accent: `#22d3ee` (Signal Cyan) → `#5eead4` (Signal Teal), 135° gradient, never cyan plus a second accent
- Borders: `rgba(255,255,255,0.06)`, hover/active `rgba(255,255,255,0.12)`
- Glow (the only elevation): `0 0 32px rgba(34,211,238,0.45)`
- Display font: **Geist Variable**, 600, tracking -0.02em — shipped locally at `assets/fonts/geist-var.woff2` with an in-file `@font-face` (lint requires this for a named family)
- Body font: **Geist Variable**, 400
- Radii: 10 / 14 / 18px
- Visual references from the project: the hero's chat panel + browser sim, tab chips with internal URLs, the success toast, the cursor, the `white/6` card border language

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract, including its `## Timing, flexed to the generated voiceover` table.

Scene summary:
1. **One sentence** — 0.0–3.6s (3.6s) — void black; one chat input; `Prepare onboarding for the new employee.` types itself; cursor clicks send.
2. **Three systems, one run** — 3.6–11.5s (7.9s) — the two-panel hero; three tab chips activate in sequence with their real URLs; cursor fills `Priya`/`Shah`/`priya.shah@acmecorp.com`/`Product` and clicks `Save Employee`; four agent tool rows tick in and check off on the left.
3. **It finished** — 11.5–16.2s (4.7s) — success toast `Onboarding complete for Priya Shah`, then one Fog Gray line: `No API. Nothing modified. Running on your machine.`
4. **Six months later** — 16.2–20.6s (4.4s) — same panel, dimmed; a recorded step's button changes label *and* position; a thin cyan trace re-finds it; a chip resolves: `recovered · Tier A · no AI cost`; one Paper White line above: `The interface changes. The skill still finds it.`
5. **Lockup** — 20.6–24.2s (3.6s) — black; `CONXA` wordmark with one soft cyan glow; `Teach AI once.` / `Let it execute the workflow forever.`; small meta line `conxa.io — start free`.

## Audio
- Audio role: sparse professional accents over a low steady bed, with narration carrying the story.
- Audio arc: quiet and intimate → procedural and rhythmic → one confirming bell → deliberately undramatic → one warm bell, then the bed leaves.
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM, "steady and clean")
- Music treatment: fade in 0→0.9s; sits at **0.13 under the narration** for almost the whole film; comes up to ~0.30 at 22.7s once the last line ends; fades to 0 across 23.0→24.2s so the closing line rings into quiet. Implemented with the `data-automation` volume lane (a single lane, never a lane plus a `volume` tween).
- Music cue guidance: bundled preset — `<brag-skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`. Three strong-cue locks, all marked in the source with `// beat-locked`:
  - **13.11s** — the success toast lands
  - **18.56s** — the `recovered · Tier A` chip resolves
  - **22.37s** — `Let it execute the workflow forever.` resolves
  Beat-grid snaps, marked `// beat-grid`: tab chips **4.39 / 7.64 / 9.83**; agent tool rows **7.09 / 9.29 / 10.37 / 11.46** (≈1.1–2.2s apart, deliberately every-other-beat so each readable row clears the reading floor — do not tighten).
- Audio-reactive treatment: **subtle**. Music RMS modulates (a) the opacity/blur of the soft cyan glow behind the panels and (b) the final wordmark's glow presence. Nothing else. No waveform, no equalizer, no particles, and never text scale. If extraction is unavailable, document it and render without it — do not block.
- Audio-coupled moments:
  - Scene 1 — per-character typing → thinned randomized `keyboard/keypress-*` ticks; send click → `interface/click_003.ogg`
  - Scene 2 — 3 tab-chip activations → `interface/click_002.ogg`; 4 agent tool rows → `interface/drop_001.ogg`; field fills → 4 quiet key ticks; `Save Employee` → `interface/click_003.ogg`
  - Scene 3 — success toast first visible frame → `impact/impactBell_heavy_000.ogg`
  - Scene 4 — the trace landing on the moved button → `impact/impactSoft_medium_001.ogg`, **very soft**
  - Scene 5 — wordmark → `interface/bong_001.ogg`, soft; nothing after it
- SFX selection guidance: motion-matched and low-risk-biased. Navigation gets clicks, arrivals get drops, the payoff gets one bell, the close gets one bong. Volumes 0.30–0.62 — nothing percussive, nothing bright and repeated.
- SFX analysis guidance: `<brag-skill-dir>/assets/sfx/sfx-analysis.md`. All picks are from its low/medium HF-risk sets (`click_002`/`click_003` low, `impactSoft_medium_001` low, `bong_001` low, `impactBell_heavy_000` medium and isolated).
- Restraint rule: no whooshes, no drum fills, no error or glitch sounds. **The recovery beat must not sound like an alarm** — Conxa's claim is that self-healing is routine, and a rescue sting would contradict the product.
- Voiceover: enabled (`--voice`). Kokoro `af_heart`, five separate clips already generated at `assets/vo/vo1..vo5.wav` (1.8 / 7.2 / 4.2 / 2.9 / 1.8s). Each on its own track at volume 1.0; the music lane ducks around them. Scene lengths were flexed to these durations — do not re-tighten scenes under the voice.
- Audio files: music, SFX, fonts, and voiceover are already copied into `brag-output/composition/assets/`.

## Hyperframes Instructions
Composition authored against `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec / audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), `hyperframes-cli` (lint/check/render). This is the `/brag` workflow — not the `hyperframes` entry-point interview and not its generic promo/launch-video workflow.

Requirements:
- Show real UI, copy, and visual elements from the source project — the hero's two-panel split, its tab chips and URLs, its field values, its toast text, its headline.
- Keep all text readable: short labels hold ≥0.8s settled; full sentences ≥0.3s per word with a 1.2s floor. The hook line gets the most.
- Keep the video inside 15–25s (target 24.2s).
- Include the planned music, SFX, and voiceover layer.
- Treat the audio notes as guidance; choose exact timestamps against the implemented animation.
- Treat the cue metadata as optional timing hints — 3 strong-cue locks, marked in source. Ignore any cue that hurts readability or the product story.
- One paused GSAP timeline registered on `window.__timelines["main"]`, built after `document.fonts.ready` and registered only at the end of that callback.
- No render-time clocks, no unseeded randomness, no `repeat: -1`, no `visibility`/`autoAlpha` tweens on a `.clip`, no CSS initial transform paired with a GSAP tween on the same property.
- Local assets only — relative paths from `composition/`. No absolute paths, no `crossorigin` on media, every `<audio>` carries an `id`.
- Run `npx hyperframes check` before render — it is brag's single gate.

## Catalog search (required step, recorded)
Searched before hand-authoring: `npx hyperframes catalog --query "browser window mockup with tabs and a moving mouse cursor clicking a button"` (tier `words`, 45 of 401 shown). Top hits were `browser-device-stage`, `simulated-cursor`, `tabs-slide-indicator`. Decision: **hand-author**. The scenes are a faithful recreation of one specific product's panels in that product's exact token values, and the cursor is ~10 lines of GSAP; wiring three registry components' token contracts would be more code and more risk than the thing it replaces, not less. No catalog gap to report — the components exist and are good, they are just less specific than this brief needs.
