# Fix Log

> Rotated daily into `docs/archive/fix-log/` — see [INDEX.md](docs/archive/fix-log/INDEX.md) for older entries.

---

## Removed browser-close as the thing that finishes a recording — 2026-07-16

The last two days of fixes (see below) were all chasing the same root problem from different
angles: Build Studio watches the recording browser and, the moment it thinks the browser closed,
automatically wraps up and saves whatever was captured so far. Every patch was really just trying
to make that "is it closed yet?" check harder to fool — first a 2-second grace period, then 8, then
20 — because a slow-loading page could still trick it every so often, and each time it got tricked,
part of the recording was silently lost.

Instead of continuing to tune that check, removed it as a trigger entirely. Closing the browser is
still the natural way to signal "I'm done," and the popup still tells you to do that — but it no
longer *does* anything by itself anymore. After closing the browser (or even before, if you'd
rather), you now have to explicitly click **Save Workflow Now** / **Save Session Now** to keep the
recording, or **Cancel** to throw it away. Both buttons already existed from earlier fixes and
already worked correctly no matter what the browser was doing, so this was mostly about deleting
the automatic trigger and updating the on-screen instructions to match, in both the Workflow and
the Login recording popups. A slow page can no longer destroy a recording — at worst it now just
delays a status message by a few seconds, which nobody will notice, since the real save only ever
happens when you ask for it.

## Widened the recorder's grace period further after a real test proved 8 seconds still wasn't enough — 2026-07-16

Follow-up to yesterday's HubSpot recording fix. The user re-recorded the same "Create a Contact"
workflow three times to test it. First two attempts still cut off instantly right after "Create
new," which turned out to mean Build Studio hadn't actually restarted yet — a code fix on disk
doesn't apply to an already-running process. After a proper restart, the third attempt proved the
fix genuinely works: the browser stayed alive and kept recording for a full minute this time, way
longer than either broken attempt — but it still eventually gave up, right around the 8-second mark
this fix had set as the cutoff. That's not a coincidence; it means HubSpot's "create contact" panel
is a genuinely heavy, slow-loading piece of the page, and it can keep the browser looking
unresponsive to Build Studio for longer than 8 seconds even though nothing is actually wrong.

Widened the patience window from 8 seconds to 20, since a real user closing the browser on purpose
will never confuse the recorder either way — the only cost of a longer window is a few extra
seconds' delay before a genuine close is recognized, and that's invisible in practice. Also added a
note to Build Studio's internal diagnostics recording exactly why it eventually gives up, if it ever
does again, so the next check doesn't require picking apart the recording's video frame-by-frame to
find out.

## Fixed "Cancel" during a workflow recording leaving Build Studio stuck saying a recording is already in progress — 2026-07-16

A user recorded a workflow, closed the browser, then hit "Cancel" instead of "Save Workflow Now" (a button added
in yesterday's fix log). Clicking "Create Workflow" again right after that failed every time with "You already
have a recording in progress," even though no browser window was open anywhere.

The "Cancel" button added yesterday only cleared what the popup itself was showing on screen — it never told
the background process the recording was actually over. Behind the scenes, Build Studio deliberately waits
several seconds after a browser window closes before it fully believes the browser is gone (that patience was
itself a fix from yesterday, for a different bug where a slow-loading page inside the browser was mistaken for
the browser closing). Normally that's invisible — the popup waits it out and finishes on its own. But "Cancel"
skipped past that wait instead of resolving it, so the background process kept the recording marked as active
until its own slow check eventually caught up on its own, sometimes ten-plus seconds later. Any attempt to
start a new recording during that window was correctly, but confusingly, rejected as a duplicate.

Fixed by making "Cancel" (both on the Workflow popup and the matching Login popup) actively tell the background
process to stop and forget that recording right away, instead of just hiding it on screen and hoping the
background process catches up. Cancelling now also throws away the empty workflow placeholder that gets created
the moment recording starts, so a cancelled recording doesn't leave a broken entry behind either. Starting a new
recording immediately after Cancel now works every time.
