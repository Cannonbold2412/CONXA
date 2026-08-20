# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Fixed "Build Installer" crashing with a missing-argument error — 2026-08-21
Clicking Build Installer in Build Studio failed immediately with a technical error instead of building anything. This was a leftover from yesterday's cleanup of how accounts are filed internally — one internal handoff still expected an old piece of information that nothing was sending anymore. Build Installer now works again.
 — 2026-08-21

## The empty "Default" folder is gone, and the Workflows top bars now read as a proper toolbar — 2026-08-21
Every workspace opened with an empty folder called "Default" that nobody asked for and nobody could delete — like a new filing cabinet that ships with one permanently glued-in, empty drawer. That folder is now hidden until something actually lives in it; it still quietly catches any automation that has no folder of its own, so nothing can ever get lost. Separately, the two strips across the top of the Workflows screen were fighting each other: the usage numbers sat in two large boxes that shouted "Unlimited" louder than anything else on the page. They're now compact chips on a single slim toolbar, with the full detail on hover, and the account area got a small avatar and a divider — the screen reads like business software instead of a demo.
 — 2026-08-21

## Simplified how a company's automations are organized behind the scenes — 2026-08-21
Every paying account used to have an extra, invisible layer in how its automations were filed away — as if each customer's filing cabinet had a second, redundant label taped over the real one. That extra label added complexity without giving anyone a feature they actually used, so it's been removed: an account's automations are now filed directly under the account itself, nothing else. This is a behind-the-scenes cleanup — the folders, downloads, and released versions you see in Build Studio and on the web dashboard look and behave the same, just with one less moving part underneath that could someday drift out of sync.
 — 2026-08-21
