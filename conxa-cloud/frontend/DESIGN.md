---
name: Conxa Cloud
description: Any existing web app, made directly operable by AI agents.
colors:
  signal-cyan: "#22d3ee"
  signal-teal: "#5eead4"
  signal-cyan-deep: "#0e7490"
  void-black: "#06080b"
  panel-black: "#0b0f14"
  raised-black: "#0f1620"
  fog-gray: "#9ba3af"
  ash-gray: "#6b7280"
  paper-white: "#f4f5f7"
typography:
  display:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "clamp(1rem, 1.2vw, 1.125rem)"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.1em"
rounded:
  sm: "10px"
  md: "14px"
  lg: "18px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "48px"
  xl: "128px"
components:
  button-primary:
    backgroundColor: "{colors.signal-cyan}"
    textColor: "{colors.void-black}"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.signal-teal}"
    textColor: "{colors.void-black}"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fog-gray}"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
  card-value:
    backgroundColor: "{colors.panel-black}"
    textColor: "{colors.fog-gray}"
    rounded: "{rounded.lg}"
    padding: "24px"
  badge-eyebrow:
    backgroundColor: "{colors.panel-black}"
    textColor: "{colors.signal-cyan}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
---

# Design System: Conxa Cloud

## 1. Overview

**Creative North Star: "The Signal in the Dark"**

The page is a near-silent black canvas — void black behind a stack of only slightly-raised panels — and the cyan-to-teal gradient is the one deliberate signal that breaks the silence. It never appears by accident: not as ambient decoration, not scattered across the page, but reserved for the handful of moments that matter most (the hero's payoff word, the primary CTA, a live status pulse). Everything else recedes into gray text and near-invisible borders so that when the signal does appear, it reads as intentional and rare rather than as "the brand color, applied everywhere."

This restraint is the whole point: a page that wants to be trusted by engineers evaluating infrastructure can't look like it's trying to sell them something. The near-black, glow-not-shadow depth system, and Geist's neutral geometric sans all point toward technical credibility over marketing polish — bold enough to claim a new category, calm enough that an enterprise security reviewer doesn't flinch.

This system explicitly rejects the generic AI/SaaS template look (gradient-clip headline text, tracked uppercase eyebrows on every section, cream/sand backgrounds, identical icon-card grids) and the legacy-enterprise-RPA look (dense brochure layouts, feature-matrix tables, stock photography). Two patterns that currently ship — the gradient-clip hero headline and the per-section eyebrow badge — are flagged below as Don'ts for new work even though they're live in the current build; see §6.

**Key Characteristics:**
- Void-black canvas, panels only one or two steps lighter — never a bright surface at rest.
- One accent, used rarely: the cyan→teal gradient signals "this is the important thing," nothing else.
- Depth from glow and tonal shift, not drop shadows — see §4.
- Geist Variable throughout; no secondary display face. The type carries the technical register alone.
- Gray text does the talking; color is reserved for the signal.

## 2. Colors

A near-monochrome dark canvas with a single accent gradient held in reserve.

### Primary
- **Signal Cyan** (#22d3ee): The accent's cold edge. Primary CTA fill, eyebrow badge text/border, live-status pulses, and the leading half of every gradient use.
- **Signal Teal** (#5eead4): The accent's warm edge. Always paired with Signal Cyan in a 135° gradient — never used alone. Trailing color of the hero gradient-text and the primary button fill.

### Neutral
- **Void Black** (#06080b): Page background. The deepest surface; nothing sits behind it.
- **Panel Black** (#0b0f14): Section and card backgrounds — one step up from Void Black, still read as "resting."
- **Raised Black** (#0f1620): Hover / nested-element background — a card's icon tile, or a card on hover. The lightest neutral surface in the system.
- **Fog Gray** (#9ba3af): Secondary text — subheadlines, card body copy, ghost-button labels.
- **Ash Gray** (#6b7280): Tertiary / meta text — timestamps, "scroll" hints, the smallest supporting labels.
- **Paper White** (#f4f5f7): Headline and primary text color. Never pure white (#fff) — kept one step warm-gray from true white to stay part of the same neutral family.

### Named Rules
**The Rare Signal Rule.** The cyan→teal gradient appears in at most one or two places per screen: the primary CTA and one hero payoff moment. If a section needs a second accent touch, reach for a border/background tint at low opacity (e.g. `cyan-400/6`, `cyan-400/20`) rather than a second full-saturation gradient.

## 3. Typography

**Display Font:** Geist Variable (with sans-serif fallback)
**Body Font:** Geist Variable (with sans-serif fallback)

**Character:** A single geometric-humanist sans carries the entire system — display, body, and label all vary only in size and weight, never in family. That consistency is what keeps the page feeling like infrastructure rather than a marketing composition.

### Hierarchy
- **Display** (600, `clamp(2.5rem, 6.5vw, 5.5rem)`, line-height 1.08, tracking -0.02em): The hero headline only. One per page.
- **Headline** (600, `clamp(1.875rem, 4vw, 3rem)`, line-height 1.15, tracking -0.02em): Section headers (`SectionHeader`'s `headline` prop). One per section.
- **Body** (400, `clamp(1rem, 1.2vw, 1.125rem)`, line-height 1.625): Subheadlines and card copy, in Fog Gray. Cap prose measure at 65–75ch even though most instances here are short (2xl max-width containers already keep this in range).
- **Label** (500, 0.75rem, tracking 0.1em, uppercase): Eyebrow badges and the smallest meta text ("scroll" hint). The only place uppercase tracking is used — see §6 for its status as a Don't for new work.

### Named Rules
**The One-Family Rule.** Every text role uses Geist Variable. A second typeface — serif, mono, or a different sans — is a signal this system doesn't currently make; don't introduce one without a deliberate reason tied to a specific new surface (e.g. a code sample block).

## 4. Elevation

There is no traditional box-shadow elevation scale. Depth reads through two mechanisms instead: a **tonal shift** (Panel Black → Raised Black on hover, border `white/6` → `white/12`) for structural surfaces like cards, and a **glow** (a soft cyan `box-shadow` blur, `0 0 32px rgba(34,211,238,0.45)`) reserved for the primary CTA's hover state. Cards additionally lift 2px on hover (`translateY(-2px)`) to reinforce the tonal shift with motion. Nothing in the system uses a conventional dark drop-shadow.

### Shadow Vocabulary
- **cta-glow** (`box-shadow: 0 0 32px rgba(34,211,238,0.45)`): Hover state on the primary gradient CTA only. Never used on secondary buttons, cards, or badges.

### Named Rules
**The Glow-Not-Shadow Rule.** If a component needs to signal "this is elevated" or "this is interactive," reach for a tonal background shift or (for the one primary CTA) the cyan glow — never a generic dark drop-shadow. A drop-shadow on a near-black surface reads as muddy, not elevated.

## 5. Components

### Buttons
- **Shape:** Rounded corners, 10px radius (`{rounded.sm}`).
- **Primary:** 135° linear-gradient fill from Signal Cyan to Signal Teal, Void Black text, `12px 24px` padding, `font-semibold`. Hover: scale to 1.02 plus the cta-glow shadow. Active: scale to 0.98.
- **Ghost:** Transparent background, `white/10` border, Fog Gray text, same padding and radius. Hover: border brightens to `white/20`, text goes to Paper White. No glow on ghost buttons — glow is exclusive to the primary gradient CTA.

### Chips / Badges
- **Eyebrow badge:** Full-radius pill, `cyan-400/6` background, `cyan-400/20` border, Signal Cyan text, uppercase, 0.1em tracking, 0.75rem size. Currently used above most section headlines — flagged as a Don't for new sections; see §6.

### Cards / Containers
- **Corner Style:** 18px radius (`{rounded.lg}`) for value cards; 14px (`{rounded.md}`) for the smaller icon tile nested inside.
- **Background:** Panel Black at rest, Raised Black on hover.
- **Shadow Strategy:** None — see §4. Depth comes from the background/border shift plus a 2px hover lift.
- **Border:** `white/6` at rest, `white/12` on hover.
- **Internal Padding:** 24px (`{spacing.md}`).

### Inputs / Fields (product surfaces — Dashboard, Billing, Team, Settings)
- **Style:** shadcn/ui defaults on the dark theme tokens (`--input`, `--border`, `--ring`) — not the marketing hex palette directly, but tuned to the same near-black family.
- **Focus:** `ring-3` in `--ring` at 50% opacity plus a border color shift to `--ring`.
- **Error / Disabled:** Destructive-tinted ring/border for invalid state (`aria-invalid`); 50% opacity + no pointer events when disabled.

### Navigation
- **Marketing nav:** Void Black background, Fog Gray link color at rest, Paper White on hover/active. No underline; color shift only.
- **Product sidebar (dashboard):** Uses the shadcn `--sidebar` token family — one step darker than `--background` — with the same restrained, mostly-monochrome treatment as the marketing nav.

## 6. Do's and Don'ts

### Do:
- **Do** keep the cyan→teal gradient rare — one primary CTA, one hero moment, per screen (The Rare Signal Rule).
- **Do** signal elevation with tonal shifts and the reserved cyan glow, never a generic drop-shadow (The Glow-Not-Shadow Rule).
- **Do** keep every text role in Geist Variable; introduce a second family only for a deliberate new surface like a code block (The One-Family Rule).
- **Do** use Void Black / Panel Black / Raised Black as the only three background steps at rest — resist introducing a fourth "just slightly different" dark gray.
- **Do** cap accent-color usage per screen: if a section wants a second cyan touch, use a low-opacity tint (`cyan-400/6`–`/20`) rather than a second full-strength gradient.

### Don't:
- **Don't** use gradient-clip text (`background-clip: text` with the cyan→teal gradient) on new headlines going forward. The current hero headline does this; it's a known exception being phased out, not a pattern to repeat.
- **Don't** add a new uppercase-tracked eyebrow badge above a section headline. The pattern currently ships on most sections but reads as generic AI/SaaS-template scaffolding; new sections should find a different way to signal context (a headline that states it directly, a supporting stat, or nothing at all).
- **Don't** default to a cream/sand/warm-neutral background under any circumstance — this system is void-black or nothing.
- **Don't** introduce a conventional dark drop-shadow for elevation; use the tonal-shift + glow system instead.
- **Don't** use border-left or border-right as a colored accent stripe on cards or callouts.
- **Don't** build dense feature-matrix tables or brochure-style layouts — that's the legacy-RPA anti-reference this system explicitly rejects.
