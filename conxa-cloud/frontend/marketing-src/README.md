# Marketing source assets — NOT served

Original, full-window product captures. This folder sits outside `public/`, so nothing
here is reachable over the web. Only the cropped derivatives in
`public/marketing/screenshots/` are published.

Keep it that way. Two of these originals should never be served:

- `execution_claude_desktop.png` — the Claude Desktop sidebar in this capture lists real,
  private conversation titles. The published crop (`shot_execution.png`) removes that rail.
- `dashboard.png` — shows a red "Attention needed" banner, a 36% success rate, and
  single-digit workspace counts from a dev workspace. Not homepage material until the
  numbers reflect real, healthy usage.

To update a published screenshot: drop the new full capture here, crop it to the region
that stays legible at roughly half-page width, and write the result to
`public/marketing/screenshots/shot_<name>.png`.
