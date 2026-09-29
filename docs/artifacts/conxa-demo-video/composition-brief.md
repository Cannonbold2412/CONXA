# Hyperframes Composition Brief: CONXA

## Objective
A narrated product-launch demo for CONXA: problem → the operating-vs-owning distinction → Record / Compile / Run / Dashboard proof → business value.

## Output
- Composition: `composition/index.html` (single file, monolithic by choice)
- Render: `brag.mp4`, 1920x1080, 30fps, 57.5s (user-requested full story; exceeds brag's 15-25s default)

## Source material
- Real captures (`composition/assets/shots/`), taken at 1920x1080:
  - `home_hero.png`: marketing homepage from the local Next.js dev server (`conxa-cloud/frontend`)
  - `dash_overview.png`: Cloud dashboard Operations overview. The live dashboard needs a Clerk sign-in, so this is the repo's own dashboard design canvas (`docs/artifacts/conxa-dashboard-redesign/Main.dc.html`) with its template placeholders filled. **The figures are sample data**, not real telemetry.
  - `studio_review.png`: Build Studio review screen for the real "Github to Drive File Handoff" workflow (`docs/artifacts/human-edit-redesign/Main.dc.html`)
- Verbatim site copy used: "The work that crosses five systems is the work nobody automated.", the three Problem rows, "One demonstration replaces all three.", "Show it once.", the four clues (Role and name / Visible label / Test id / Position), "Your logins never leave your machine."

## Creative direction
- Cinematic with polished restraint: "the signal in the dark". One cyan accent. Build Studio frames keep Studio's clay accent.
- Claude is named once, neutrally: "AI browser agent (e.g. Claude in Chrome) · operates software live" / "Great for one-off tasks." It's contrasted with, not criticised by, "CONXA skill · Built for the work you repeat."

## Visual identity
Void #06080b, panels #0b0f14 / #0f1620, paper #f4f5f7, fog #9ba3af, cyan #22d3ee, Geist Variable (local woff2).

## Audio
- Narration: Kokoro `af_heart`, 9 lines (`assets/vo/vo1-9.wav`), placed per scene.
- Music: happy-beats-business-moves-vol-1 (120.19 BPM), ducked to 0.13 under narration, lifted under the lockup, faded out at the end.
- Beat locks: 21.01s (title), 17.52s (CONXA column), 52.52s (wordmark). Beat grid used for card, row and tick reveals, at 0.5-1.5s spacing so each line stays readable.
- Audio-reactive: bass drives the ambient glow and the lockup halo only.
- SFX: clicks on cursor actions, soft drops on card/row arrivals, one soft impact on the title, a bong on the lockup.
