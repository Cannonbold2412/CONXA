# EXEC-11 MEGA-WORKFLOW: One Recording, One Replay Gauntlet

> **Naming note:** named as the successor to `exec-10-long-chain-workflows.md`. Despite the
> similar ID it has nothing to do with the retired `TODO.md` EXEC-11 backlog item (duplicate-
> download overwrites, resolved 2026-08-15). Run results and failures log under `TODO.md`
> **TEST-12**; governance-flavored gaps also feed `TODO.md` **PROD-18**.

This is **one long recording** plus a scripted set of things YOU do by hand around its replays.
One skill, ~60 steps, 6 domains, 4 tabs — then a replay gauntlet (R1–R8) that turns that single
skill into every hard-mode test:

| Tag | What the tag means | Exercised by |
|---|---|---|
| H-1 | Selector durability — DOM mutates between record & replay | Segment A, R1 |
| H-2 | Late-rendered / scroll-loaded elements + timeout headroom | Segment B, R3 |
| H-3 | Mid-run session death must fail honestly | R4 |
| H-4 | Replay inputs differ from recorded data (interpolation) | Segment E, R2 |
| H-5 | Entity binding — right row, always (PROD-3 criterion) | Segment D, R2 probe |
| H-6 | Cross-skill output→input chaining via `execute_sequence` | Segment F, R2 |
| H-7/H-8 | Concurrent runs: same-platform serialization, cross-platform parallelism | R5, R6 |
| H-9 | Endurance + retry-budget poisoning over 20 runs | R8 |
| H-10 | Iframe chain under rapid alternation | Segment C |
| H-11/H-12 | Canvas + CAPTCHA boundaries refuse cleanly | R7 |

**Total manual time:** ~45 min setup + ~15 min recording + ~30 min replay gauntlet + optional
overnight run for the endurance leg.

---

## PHASE 0 — Setup (do once, by hand)

### 0.1 Build the mutator fixture

1. Create folder `docs/testing/fixtures/`.
2. Save the following as `docs/testing/fixtures/mutator.html`:

```html
<!doctype html>
<html><body>
<h1 id="title">Shapeshifter</h1>
<form onsubmit="event.preventDefault(); show();">
  <input id="f-name" placeholder="name" />
  <input id="f-email" placeholder="email" />
  <button id="btn-submit">Submit</button>
</form>
<div id="out" hidden>Thanks, <span id="out-name"></span>!</div>
<script>
  // Every 700 ms: rewrite every id/class, move the button in the DOM,
  // and change its label — while keeping it clickable.
  const names = ['btn-submit','cta-go','act-send','do-it'];
  const labels = ['Submit','Go','Send','Do It'];
  let i = 0;
  setInterval(() => {
    i++;
    document.querySelectorAll('[id]').forEach((el, k) => {
      el.id = el.id.replace(/-(v\d+)?$/, '') + '-v' + i;
      el.className = 'c' + ((i + k) % 7) + ' mut-' + (i % 3);
    });
    const btn = document.getElementById(names[i % 4] + '-v' + i) ||
                document.querySelector('button');
    labels.forEach(l => { if (btn.textContent !== l && Math.random() < .25) btn.textContent = l; });
    document.body.appendChild(btn); // move button to end of body every tick
  }, 700);
  function show(){
    document.getElementById('out').hidden = false;
    document.getElementById('out-name').textContent =
      document.querySelector('input[placeholder="name"]').value;
  }
</script>
</body></html>
```

3. Serve it and leave the server running:
   ```powershell
   cd docs\testing\fixtures
   npx serve -l 3000 .
   ```
   Confirm `http://localhost:3000/mutator.html` opens and the Submit button visibly jumps /
   relabels roughly every 0.7 s.

### 0.2 Accounts ready

| Site | Credentials | Note |
|---|---|---|
| saucedemo.com | `standard_user` / `secret_sauce` | used in the recording |
| demo.owasp-juice.shop | register a throwaway account | only if it forces login; browsing usually works without |
| computer-database.gatling.io | none | nothing to do |

### 0.3 Studio + evidence plumbing

1. Build Studio running (`cd conxa-builder/electron && npm run dev`), signed in.
2. Create group `MEGA-11`, complete its auth step if prompted.
3. Open a terminal tailing sessions for evidence:
   ```powershell
   Get-ChildItem "$env:USERPROFILE\.conxa-build-studio-dev\data\sessions" -Directory |
     Sort-Object LastWriteTime -Descending | Select-Object -First 1
   ```
4. Have your MCP client (Claude Desktop / Codex Desktop) connected to the runtime with
   `list_skills` working.
5. Print or open the scorecard at the bottom — you'll fill it after every replay.

---

## PHASE 1 — The single recording (~60 steps, do in exactly this order)

Start recording in Studio against `http://localhost:3000/mutator.html`. Do NOT stop recording
between segments. New tabs stay open unless told otherwise.

### Segment A — Mutator page (tab 1) · ~6 steps · covers H-1

1. Type `Mega Test Run` into the **name** field.
2. Type `mega@test.local` into the **email** field.
3. Click **Submit** (whatever its current label says).
4. Wait until the confirmation block appears showing `Thanks, Mega Test Run!`.

> The page keeps mutating while you record. That's the point — the compiler must bind stable
> signals, not the ids you happened to see.

### Segment B — Scroll-load + late-render (new tab 2) · ~8 steps · covers H-2

5. Open a new tab → `https://the-internet.herokuapp.com/infinite_scroll`.
6. Scroll down, wait for new blocks, repeat until **4 blocks** have loaded.
7. Assert the page now shows 4+ loaded blocks.
8. Same tab, navigate to `https://the-internet.herokuapp.com/dynamic_loading/2`.
9. Click **Start**.
10. Wait out the spinner; click the **Hello World!** element once it renders.

### Segment C — Iframe ping-pong + deep-iframe datepicker (same tab) · ~10 steps · covers H-10

11. Navigate to `https://the-internet.herokuapp.com/nested_frames`.
12. Click/act on an element inside the **LEFT** frame.
13. Click/act on an element inside the **RIGHT** frame.
14. Drop to the **BOTTOM** frame and act there.
15. Navigate to `https://jqueryui.com/datepicker/`.
16. Click the date input (widget lives one iframe deep).
17. Pick a specific day from the calendar popup.

### Segment D — Entity-specific cart action (new tab 4) · ~14 steps · covers H-5

18. New tab → `https://www.saucedemo.com`.
19. Log in: type `standard_user`, type `secret_sauce`, click Login.
20. Add to cart: **Sauce Labs Backpack**, **Sauce Labs Bike Light**, **Sauce Labs Bolt T-Shirt**
    (three separate Add buttons).
21. Open the cart.
22. Remove **Sauce Labs Backpack specifically** (its own Remove button — not the first row).
23. Assert the cart badge reads `2`.

### Segment E — Search with a typed value (new tab 5) · ~6 steps · covers H-4

24. New tab → `https://demo.owasp-juice.shop`.
25. Dismiss any welcome banner if shown.
26. Type `Apple` into the search box, press Enter.
27. Assert results appeared.
28. Click the first result and confirm it is an Apple product.

### Segment F — Data source for chaining (same tab) · ~10 steps · covers H-6

29. Navigate to `https://computer-database.gatling.io`.
30. Type `MacBook` (or any computer you like) into the filter box.
31. Open the matching computer's detail page.
32. Read/note the introduced date on that page (the recorder captures it).

33. **Stop recording.** Expect ~55–65 raw events.

---

## PHASE 2 — Compile & install

34. Compile in Studio. While reviewing, verify:
    - No raw dynamic-looking ids survived as sole selectors (Segment A especially).
    - Tab markers exist for every segment boundary.
    - Frame markers exist for Segment C's left/right/bottom hops and the datepicker iframe.
    - Step count ≥ 50 — confirm compile didn't truncate (compare against the event count).
35. Build the skill package → publish → sync to runtime → `list_skills` shows `mega-11`.
36. Grep the generated bundle folder for `secret_sauce` — **found = STOP, critical bug** (auth
    exclusion invariant broken).

---

## PHASE 3 — The replay gauntlet (all manual, in order)

Every replay below reuses the SAME compiled skill. After each, fill a scorecard line.

### R1 — Baseline clean pass *(proves the recording itself)*

37. `execute_skill` mega-11 with no overrides. Expect full end-to-end success: mutator echoes the
    name, cart badge `2`, Apple product clicked, computer detail opened.
38. Check telemetry showed one `run_success`; recovery log shows Tier ≤ 2 only; **zero LLM calls**.

### R2 — Different data, same skill *(H-4 parameterization)*

39. Re-run, overriding the inputs: name → `Second Pass`, email → `second@test.local`,
    Juice Shop search → `Banana`, computer filter → `ASCI White`.
40. Verify EVERY value followed your override: confirmation says `Second Pass`, a Banana product
    was clicked (not Apple), ASCI White detail opened.
41. **Zero-result probe:** run once more with search → `zzzqqqxxx`. Expected: a LOUD failure at
    the results step — never clicking whatever card happens to be on screen.

### R3 — Throttled network *(H-2 hard variant + W-6 headroom)*

42. Set Chrome DevTools network throttling… actually the runtime runs headless-ish Playwright —
    instead throttle at the OS level OR simply re-run R1 while `npx serve` is paused/slowed for
    Segment A, and accept slower loads elsewhere. Simplest honest version: re-run R1 with
    `CONXA_ACTION_TIMEOUT_MS` deliberately lowered to 1200 to shrink headroom artificially.
43. Watch which steps needed recovery, which tier they reached, and confirm still zero LLM calls.

### R4 — Session killed mid-run *(H-3 auth honesty)*

44. Start R1 again. While Segment D is executing, log saucedemo out from a separate normal
    Chrome window sharing the profile is NOT possible (fresh runtime context) — instead the
    reliable sabotage: close the runtime's browser window mid-run, or block network after
    Segment C completes.
45. Expected: run fails cleanly naming the step where the world ended. NOT success, NOT a hang,
    NOT attempts to "heal" into a login form.

### R5 — Two runs, same skill, same platforms *(H-7 serialization)*

46. Fire TWO `execute_skill` mega-11 calls back-to-back in one message.
47. From `get_execution_status` + telemetry timestamps, confirm they ran strictly sequentially.
48. Both must succeed with correct final states (badge `2` twice, no interleaved flakiness).

### R6 — Two runs, different platforms *(H-8 parallelism + cancel)*

49. Make a tiny throwaway skill beforehand: 4 steps on `https://en.wikipedia.org` (open, click
    Random article, assert article body exists).
50. Fire mega-11 AND the wiki skill simultaneously. Confirm timestamp OVERLAP (true parallelism).
51. Mid-flight, call `cancel_execution` with the wiki run's `run_id`. Wiki run dies, mega run
    finishes untouched.

### R7 — Boundary contracts *(H-11, H-12 — two tiny throwaway recordings)*

52. Record 6 steps on `https://excalidraw.com` (draw rectangle, move, delete). Compile, run.
    Expected: fast clean refusal at the first canvas-only action, minimal token burn.
53. Record 6 steps submitting the form at
    `https://www.google.com/recaptcha/api2/demo`. Compile, run.
    Expected: immediate explained refusal; recovery cascade stops early.

### R8 — Overnight endurance + poison combo *(H-9)*

54. Loop mega-11 ×20 consecutive runs in one MCP session, unattended. Sabotage run 7: start it
    with `CONXA_ACTION_TIMEOUT_MS=400` so it fails.
55. After each run, capture: wall-clock seconds, runtime process memory (Task Manager),
    recovery-log size, leftover folders under `{CONXA_DATA_DIR}/runs/`.
56. THE key check: run 8 behaves like run 1 (full recovery budget available). If run 8 fails
    faster/with less recovery than run 1, retry budget poisoning (W-4) is live — capture both
    runs' recovery logs as evidence.

---

## Scorecard (fill one line per replay)

```
R#  Result: PASS | PASS-WITH-NOTES | FAIL | CRASH
    Execute: __s   Max recovery tier: __   LLM calls at runtime: __ (must be 0 except R7 notes)
    Evidence: screenshot / events.jsonl excerpt / recovery log excerpt
```

## Exit criteria

- R1, R2, R5, R6 pass outright.
- R2's zero-result probe and R4 fail loudly and honestly.
- R7 produces clean refusals.
- R8 flat memory trend + run 8 ≈ run 1.

**Where misses go:** log under `TODO.md` TEST-12, attach evidence (screenshot / events.jsonl
excerpt / recovery-log excerpt). Specific routing: H-5 wrong-row removal → `PROD-3` immediately
(sales blocker); governance/evidence gaps from R4 → `PROD-18`; retry-budget poisoning in R8 →
W-4 follow-up; anything else stays under TEST-12. Promote a passing shape into
`runtime/test/gate-skill/` once it passes three consecutive times.
