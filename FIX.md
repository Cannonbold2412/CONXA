# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Rebuilt the customer dashboard into an operations control center — 2026-08-07
The dashboard customers see after logging in was written for engineers: a wall of counters and lists that told you what had broken, but never whether things were actually going well. It is now organised around the questions a manager or executive actually asks, each with its own page — is the platform healthy, what needs attention right now, which workflows are slipping, is the self-repair working, and what is all of this worth in saved time and money. A single health score sits at the top, and unlike most such scores it shows its own workings: the five things that produced it are listed underneath, so "we dropped four points" immediately becomes "our checks started failing." A live feed shows work as it happens, and everything is clickable down to a single run, step by step.
Two things were deliberately kept honest. The "hours saved" figure needs someone to say how long the task used to take a person — the software has no way of knowing that — so the assumption is printed right next to the number and anyone in charge can edit it, and it is labelled an estimate. Numbers that come purely from real activity are labelled measured, and kept separate. The dashboard also flags problems in plain language ("this new version is failing more often than the one before it — consider rolling back") using fixed rules rather than an AI, so every warning can be traced to a number and clicked through to the proof.
 — 2026-08-07

## Fixed the "free repairs" count being roughly double the real figure — 2026-08-07
While building the new dashboard, a number turned out to be wrong in a way that flattered us. When a workflow repairs itself, it tries the cheap local methods first and only calls on an AI model if those fail. We report how many repairs were handled free of charge — but the old count added up attempts rather than outcomes, so one step that tried two free methods was counted twice, and a step that tried a free method, failed, and then needed a paid AI call was still counted as free. On real data it reported 96 free repairs out of 64 total repairs, which is impossible on the face of it. It now counts what it says: steps that genuinely finished without ever needing a paid AI call. The same figure appears on two different pages, and both now read from one source so they can never disagree.
 — 2026-08-07

## Put the real demo video and product screenshots on the new homepage — 2026-08-07
The rebuilt homepage had blank spaces reserved for a demo video and pictures of the product. Both are now in: the video plays when you click it (it doesn't slow the page down before that), and four screenshots walk you through recording a task, the finished workflow, publishing it, and an AI actually running it. Two things needed care before publishing. The picture of the AI running a task also captured a sidebar full of private chat titles, so that strip was trimmed off. And a dashboard picture was left out on purpose, because it happened to show a bad run — a red warning and a 36% success rate from a test account — which is the last thing a cautious buyer should see.
 — 2026-08-07
