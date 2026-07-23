# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Fixed several bugs in the new "fill-in-the-blank" skill variables feature, and caught a scare with leaked passwords before it went anywhere — 2026-07-23

The in-progress feature that lets a skill ask for a value at run time (like a database name or account number) instead of having it baked in had a handful of rough edges. Editing a step's typed value could leave it pointing at the wrong variable after a rename. The "replace everywhere" tool used to be able to accidentally corrupt the invisible instructions that tell Conxa where to click, not just the visible text — it's now scoped to only touch what you typed, and it tells you how many spots it actually changed. Trying to run a skill without filling in a value it needs now fails immediately with a clear message, instead of running partway and failing somewhere confusing. The Human Edit screen also got a "default value" box and a "sensitive" checkbox for each variable, though the sensitive checkbox is a promise we still need to keep — right now it doesn't hide anything yet, it's a decoration.

While reviewing this work, we found a separate file sitting in the project (not yet saved to permanent history) that had real login keys for several AI services typed out in plain text. It's being kept out of version control and those keys should be treated as compromised and replaced.

Two smaller, unrelated fixes rode along: recording a login could occasionally lose track of whether the save actually finished, and the system that picks which AI account to use for behind-the-scenes work now properly skips an account that just failed instead of immediately trying it again.

---

## Conxa can now configure itself into 24 different AI assistants, not just Claude — and the dangling-connection bug from yesterday is fixed for real — 2026-07-21

Yesterday's entry was the plan; today it's built. The installer now safely turns on Conxa inside Cursor, VS Code, Windsurf, and twenty other assistants the same way it already did for Claude, and every one of those changes is now crash-proof and never overwrites a setting that belongs to something else. The bug where uninstalling a test version left a broken, permanently-failing connection behind is fixed and proven fixed with a test that reproduces the exact scenario. We also added a short note inside each assistant explaining what Conxa can do, so it actually reaches for the tools instead of just having them switched on unannounced.

---

## Caught two build-pipeline gaps that would have made yesterday's feature quietly not work for real customers — 2026-07-21

Yesterday's assistant-connection work was checked by running it directly, but not by running it through the exact packaging steps a real release build uses — the equivalent of testing a recipe by tasting the ingredients raw instead of after cooking. Doing that check today found two problems, both fixed. First, one of the new files (the one that writes a short "here's what Conxa can do" note into each assistant) was never actually included in the small package that ships to customers — it would have silently done nothing, every time, for every customer. Second, fixing that uncovered a related packaging gap in a shared helper file, also now fixed. Also added an automatic check that runs this whole feature's test suite every time we build a release, so a mistake like this gets caught before it ships, not after.
