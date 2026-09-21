"use strict";
const { chromium } = require("./host_bridge").hostRequire("playwright");
const fs   = require("fs");
const path = require("path");
const hostBrowser = require("./host_browser");
const sessions = require("./browser_session");

// How often a pending sign-in is checked, how long after success we wait for post-login JS to write
// its tokens before capturing, and how long a closed login tab may still be followed by a success
// elsewhere before it counts as abandoned. Env-overridable so tests don't sit through the defaults.
const LOGIN_POLL_MS = Number(process.env.CONXA_LOGIN_POLL_MS) || 1500;
const LOGIN_SETTLE_MS = Number(process.env.CONXA_LOGIN_SETTLE_MS) || 1500;
const LOGIN_CLOSE_GRACE_MS = Number(process.env.CONXA_LOGIN_CLOSE_GRACE_MS) || 3000;

// env.js is authoritative (see server.js note): process.env is already normalized
// under the host exe; the resolve() fallback only serves standalone dev mode.
const _envInfo       = global.__conxaEnv || require("./env").resolve();
const CONXA_DIR      = process.env.CONXA_DIR || _envInfo.conxaDir;
const CONXA_DATA_DIR = process.env.CONXA_DATA_DIR || _envInfo.dataDir;
const SESSIONS_DIR = path.join(CONXA_DATA_DIR, "cache", "sessions");
const LOGIN_URL_PATTERNS = [
  "login", "signin", "sign-in", "auth", "oauth", "sso",
  "session/new", "account/login", "accountchooser", "account-chooser",
];

// Shared context options for any Chromium instance that talks to a real target site
// (interactive login, session validation) — matches a normal desktop browser closely
// enough that bot-protected sites (Render, Google OAuth) don't reject it outright.
const STEALTH_CONTEXT_OPTIONS = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 720 },
  locale: "en-US",
  timezoneId: "America/New_York",
};

async function _maskAutomation(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
  });
}

function _loadPack(workspace_id) {
  const packPath = path.join(CONXA_DIR, "skill-packs", workspace_id, "pack.json");
  try { return JSON.parse(fs.readFileSync(packPath, "utf8")); } catch (_) { return {}; }
}

// Has the page reached protectedUrl's own host and left any login/auth path? Scoped to the
// target site's hostname so an OAuth leg through a different host (e.g. accounts.google.com,
// whose URLs contain "auth"/"oauth"/"signin") is never mistaken for "still logging in".
// Deliberately narrower than run.js's AUTH_FAILURE_URL_RE (no "auth"/"logout", anchored at
// path start) — this answers "has login-completion happened yet", not "did we just hit a
// login wall mid-run", so it's intentionally NOT the same pattern; don't merge them.
const LOGIN_PATH_RE = /^\/(login|signin|sign-in|session-expired)(\/|$|\?)/i;
function _reachedProtectedUrl(url, protectedUrl) {
  if (!protectedUrl) return false;
  try {
    const u = new URL(url);
    const p = new URL(protectedUrl);
    return u.hostname === p.hostname && !LOGIN_PATH_RE.test(u.pathname);
  } catch (_) {
    return false;
  }
}

// ─── Multi-app group auth ─────────────────────────────────────────────────
// A WorkflowGroup's session files are keyed `${workspace_id}__${appId}` (see
// auth_manager.js — every save/load function already takes the key as its
// first argument, so keying is purely a call-site convention). Merging N
// per-app storageStates into one lets a single Chromium context stay signed
// in to every app the group's workflows need. Python twin:
// packages/conxa-core/conxa_core/storage/storage_state.py::merge_storage_states.
function mergeStorageStates(states) {
  const cookies = [];
  const seenCookies = new Set();
  const originsByUrl = new Map();

  for (const state of states) {
    if (!state) continue;
    for (const cookie of state.cookies || []) {
      const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
      if (seenCookies.has(key)) continue;
      seenCookies.add(key);
      cookies.push(cookie);
    }
    for (const origin of state.origins || []) {
      if (!origin.origin) continue;
      const existing = originsByUrl.get(origin.origin);
      if (!existing) {
        originsByUrl.set(origin.origin, { origin: origin.origin, localStorage: [...(origin.localStorage || [])] });
        continue;
      }
      const merged = new Map(existing.localStorage.map((item) => [item.name, item]));
      for (const item of origin.localStorage || []) merged.set(item.name, item);
      existing.localStorage = [...merged.values()];
    }
  }

  return { cookies, origins: [...originsByUrl.values()] };
}

// Does a cookie/origin `domain` (".salesforce.com" parent-scoped, or "login.salesforce.com"
// host-only) belong with `host`? Same site, or either side a dot-boundary subdomain of the other —
// bare endsWith would let "evilforce.com" match "force.com".
function _domainBelongsToHost(domain, host) {
  const d = String(domain || "").replace(/^\./, "").toLowerCase();
  const h = String(host || "").toLowerCase();
  return !!d && !!h && (d === h || h.endsWith("." + d) || d.endsWith("." + h));
}

// Slice ONE app's storageState out of a shared-context snapshot. Logins land in the same context
// the workflow runs in, so it holds every app's cookies at once; writing it whole into each app's
// file would let a stale sibling copy shadow a fresh login on the next merge (mergeStorageStates
// keeps the FIRST cookie seen per name|domain|path). Owned = domains/origins `previous` already
// had, plus anything on `hosts` (the app's login/success hosts) — the fallback is what makes an
// app's very first login attributable, when there is no previous file. Anything else is dropped —
// unless `claimedElsewhere` (the OTHER group apps' hosts) is given, in which case a cookie no app
// claims (an SSO identity provider's, say) is kept too: the old separate login window saved it, and
// it is what makes the next re-login one click. Python twin:
// packages/conxa-core/conxa_core/storage/storage_state.py::refresh_app_state (no `hosts` there).
function refreshAppState(previous, current, hosts = [], claimedElsewhere = null) {
  const ownedDomains = new Set(((previous && previous.cookies) || []).map((c) => c.domain));
  const ownedOrigins = new Set(((previous && previous.origins) || []).map((o) => o.origin));
  const on = (list, domain) => list.some((h) => _domainBelongsToHost(domain, h));
  const keep = (domain, owned) => owned || on(hosts, domain) || (claimedElsewhere !== null && !on(claimedElsewhere, domain));
  return {
    cookies: ((current && current.cookies) || []).filter((c) => keep(c.domain, ownedDomains.has(c.domain))),
    origins: ((current && current.origins) || []).filter((o) => keep(_hostOf(o.origin), ownedOrigins.has(o.origin))),
  };
}

// Resolve a workspace's WorkflowGroup from pack.json's `groups` block. null means the pack has no
// `groups` (built before Workflow Groups) or not this group — getAuthContext reports that as a
// pack that needs rebuilding; captureReAuth and target_hosts.js treat it as "no group info".
function _resolveGroup(workspace_id, groupId) {
  const pack = _loadPack(workspace_id);
  const groups = Array.isArray(pack.groups) ? pack.groups : [];
  if (groups.length === 0) return null;
  if (groupId) return groups.find((g) => g.id === groupId) || null;
  return groups[0];
}

// ─── Auth-validation TTL cache ────────────────────────────────────────────
// A successful network validation is stamped per app key; repeat runs within
// CONXA_AUTH_VALIDATION_TTL_MS (default 6h) skip the live check entirely. The
// stamp records the session file's mtime — a fresh interactive login rewrites
// that file, invalidating the cached verdict (which described the OLD state).
const AUTH_VALIDATION_TTL_MS = Number(process.env.CONXA_AUTH_VALIDATION_TTL_MS) || 6 * 60 * 60 * 1000;
function _authValidationCachePath() {
  return path.join(SESSIONS_DIR, "_auth_validation_cache.json");
}
function _readValidationCache(key, sessionPath) {
  try {
    const entry = JSON.parse(fs.readFileSync(_authValidationCachePath(), "utf8"))[key];
    if (!entry || typeof entry.validatedAt !== "number") return 0;
    if (Date.now() - entry.validatedAt > AUTH_VALIDATION_TTL_MS) return 0;
    const mtime = fs.statSync(sessionPath).mtimeMs;
    if (Math.abs(mtime - entry.sessionMtimeMs) > 1) return 0;
    return entry.validatedAt;
  } catch (_) {
    return 0;
  }
}
function _writeValidationCache(key, sessionPath) {
  try {
    let cache = {};
    try { cache = JSON.parse(fs.readFileSync(_authValidationCachePath(), "utf8")); } catch (_) {}
    cache[key] = { validatedAt: Date.now(), sessionMtimeMs: fs.statSync(sessionPath).mtimeMs };
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.writeFileSync(_authValidationCachePath(), JSON.stringify(cache));
  } catch (_) {}
}

function _mtimeOrZero(p) {
  try { return fs.statSync(p).mtimeMs; } catch (_) { return 0; }
}

// Resolve a session for `key` (a bare workspace_id, or `${workspace_id}__${appId}` for a
// group app) WITHOUT launching a browser, preferring whichever of the encrypted/raw files
// was written most recently — not always the encrypted file. A raw file newer than the
// encrypted one means something other than this runtime process wrote a fresher session
// since the encrypted file was last produced (Build Studio's _stage_runtime_auth
// re-staging a freshly re-authenticated group app, or a save that fell back to
// saveRawSession) — reading the encrypted file unconditionally in that case serves a
// stale, already-expired session until the next process restart runs
// auth_manager.reencryptPlaintextSessions. A winning raw file is promoted into the
// encrypted one on the spot (same steps the startup sweep runs), so this is a one-time
// cost paid only by the first read after a fresh raw write, not every call. Returns the
// session's file path too so callers can key mtime-sensitive caches on it.
async function _loadSessionForKey(key, authManager, logFn) {
  const encPath = path.join(SESSIONS_DIR, `${key}_state.json`);
  const rawPath = path.join(SESSIONS_DIR, `${key}_raw_state.json`);
  const encMtime = _mtimeOrZero(encPath);
  const rawMtime = _mtimeOrZero(rawPath);

  if (rawMtime > 0 && rawMtime > encMtime) {
    let stored = null;
    try { stored = JSON.parse(fs.readFileSync(rawPath, "utf8")); } catch (_) {}
    if (stored) {
      if (authManager) {
        try {
          const token = await authManager.getSessionKey(key, logFn);
          if (authManager.saveEncryptedSession(key, stored, token, SESSIONS_DIR, logFn)) {
            fs.unlinkSync(rawPath);
            return { stored, sessionPath: encPath };
          }
        } catch (_) {}
      }
      return { stored, sessionPath: rawPath };
    }
  }

  if (encMtime > 0 && authManager) {
    try {
      const token = await authManager.getSessionKey(key, logFn);
      if (token) {
        const stored = authManager.loadDecryptedSession(key, token, SESSIONS_DIR);
        if (stored) return { stored, sessionPath: encPath };
      }
    } catch (_) {}
  }

  if (rawMtime > 0) {
    try {
      const stored = JSON.parse(fs.readFileSync(rawPath, "utf8"));
      return { stored, sessionPath: rawPath };
    } catch (_) {}
  }

  return { stored: null, sessionPath: null };
}

// Thin per-app wrapper over _loadSessionForKey — kept as its own name since
// getGroupAuthContext's caller comments and tests refer to "loading a group app session".
async function _loadGroupAppSession(workspace_id, app, authManager, logFn) {
  return _loadSessionForKey(`${workspace_id}__${app.id}`, authManager, logFn);
}

// Scopes a group's apps down to the ones a skill's manifest.required_apps actually
// declared. undefined requiredAppIds (pre-field manifest) means "gate on every app" —
// the pre-existing behavior. Pulled out of getGroupAuthContext so it's unit-testable
// without touching Playwright/chromium.
function _filterRequiredApps(groupApps, requiredAppIds) {
  return Array.isArray(requiredAppIds)
    ? groupApps.filter((a) => requiredAppIds.includes(a.id))
    : groupApps;
}

/** Group-aware auth resolution: gate on the REQUIRED apps only, but seed the
 * merged context from every app with a stored session. This mirrors what
 * recording already does (handlers/session.py seeds every captured app) — a
 * workflow that wanders into a sibling app mid-run arrives already signed in
 * instead of hitting a login wall, even though that app wasn't gated on up front.
 *
 * Cost model: only REQUIRED apps pay a live network validation (one shared
 * headless browser for the whole batch). Siblings are seeded without a check —
 * merging expired cookies is harmless since they're never gated. A required app
 * whose session validated within CONXA_AUTH_VALIDATION_TTL_MS (default 6h, see
 * _readValidationCache) skips its network check too.
 *
 * Any missing/expired REQUIRED app opens its own login window — ALL of them
 * at once, not one at a time, so a run with N broken apps costs the user one
 * interruption instead of N. Each app is keyed `${workspace_id}__${app.id}` in
 * _pendingAuth, so the parallel opens never collide.
 *
 * opts.requiredAppIds scopes the gate to the apps the executing skill's manifest
 * actually declared (matched by hostname against its own target_url/protected_url
 * *and* every host the recording actually visited — see skill_package_builder.py
 * and SkillMeta.visited_hosts). undefined means the manifest predates this field:
 * fall back to gating on every app in the group (old behavior). An explicit empty
 * list means this skill touches none of the group's apps, so it runs with no
 * group auth gate at all (but still seeds every other valid app's session, in
 * case it wanders into one anyway). */
async function getGroupAuthContext(workspace_id, group, authManager, opts = {}) {
  const headless = opts.headless !== false;
  const logFn = opts.logFn;
  const required = _filterRequiredApps(group.apps, opts.requiredAppIds);
  const requiredIds = new Set(required.map((a) => a.id));
  const key = _sessionKey(workspace_id, opts, headless);

  // opts.authOnly: the `authenticate` tool only wants to know whether sign-in is complete (opening
  // login tabs for whatever is missing) — never a run context, so every site that would build
  // one returns { authenticated: true } instead.
  if (opts.authOnly && (group.apps.length === 0 || (Array.isArray(opts.requiredAppIds) && opts.requiredAppIds.length === 0))) {
    return { authenticated: true };
  }
  if (group.apps.length === 0) {
    return _openSessionResult(key, undefined, headless, opts, { protectedUrl: "", sessionSource: "group-no-apps" });
  }

  // A manifest that EXPLICITLY declares zero required apps (opts.requiredAppIds is an
  // array, just empty — not undefined, which means a legacy pre-field manifest and must
  // still fall through to gate+seed everything below) means this skill is not expected to
  // touch any sibling app in the group, ever. Validating every sibling anyway (below) exists
  // purely to pre-seed sessions for a workflow that unexpectedly wanders into one mid-run —
  // that's not a real risk for a skill that declares it won't, so skip paying for N real,
  // up-to-30s-timeout network checks (one per group app, every single execution) that this
  // run has no chance of needing. If such a skill does wander somewhere unexpected despite
  // its own manifest, it hits a normal auth failure there instead of arriving pre-authenticated.
  if (Array.isArray(opts.requiredAppIds) && opts.requiredAppIds.length === 0) {
    return _openSessionResult(key, undefined, headless, opts, { protectedUrl: "", sessionSource: "group-no-required-apps" });
  }

  // Load every app's stored session first (no browser), then decide who pays a
  // live network check.
  //
  // Cost model (see the TTL-cache helpers above): only REQUIRED apps pay a live
  // network validation. Sibling sessions are seeded unconditionally without one —
  // merging expired cookies is harmless since siblings are never gated (worst case
  // a mid-run wander arrives unauthenticated there, identical to today's
  // invalid-sibling outcome). Legacy manifests (requiredAppIds undefined) gate on
  // every app, so they still validate everything. A fresh TTL stamp on a required
  // app's exact session file skips its network check too.
  const _groupAuthT0 = Date.now();
  if (logFn) logFn("info", "test_phase", { phase: `group_auth_validate_start:${group.apps.map((a) => a.name).join(",")}`, ms: 0 });
  const loaded = await Promise.all(group.apps.map((app) => _loadGroupAppSession(workspace_id, app, authManager, logFn)));
  const results = [];
  const batch = [];
  group.apps.forEach((app, i) => {
    const { stored, sessionPath } = loaded[i];
    if (!stored) {
      results.push({ app, stored: null, valid: false });
      return;
    }
    const key = `${workspace_id}__${app.id}`;
    const isRequired = requiredIds.has(app.id);
    if (!isRequired || (sessionPath && _readValidationCache(key, sessionPath))) {
      results.push({ app, stored, sessionPath, valid: true, fromCache: isRequired });
      return;
    }
    batch.push({ key, stored, protectedUrl: app.success_url || app.login_url, sessionPath, label: app.name });
    results.push({ app, stored, sessionPath, valid: null, _batchIndex: batch.length - 1 });
  });
  // The `authenticate` tool with nothing to probe and nothing missing: report success without
  // building any browser at all.
  const missingStored = results.some((r) => requiredIds.has(r.app.id) && !r.stored);
  if (opts.authOnly && batch.length === 0 && !missingStored) return { authenticated: true };

  // ONE Chromium for the whole session (see browser_session.js). Every stored session is seeded
  // into it; a required app that still needs a live check is probed in a throwaway tab of it; an
  // app that is missing or expired gets a sign-in tab in it. So the browser a login lands in is the
  // browser the workflow runs in — nothing is re-seeded from disk and nothing is re-validated.
  // Newest session file first: mergeStorageStates keeps the FIRST cookie per name|domain|path, so a
  // stale sibling's copy of a shared cookie (an SSO identity provider's) must not beat a fresh login.
  const seed = mergeStorageStates(results.filter((r) => r.stored)
    .sort((a, b) => _mtimeOrZero(b.sessionPath) - _mtimeOrZero(a.sessionPath))
    .map((r) => r.stored));
  let opened;
  try {
    opened = await _openSession(key, seed, headless, opts);
  } catch (e) {
    // Chromium itself won't start (missing / mid-install). If a required app needed the browser for
    // a check or a sign-in, report it the way a failed login-window launch always was — a
    // `launch_failed` sign-in result callers surface at once instead of waiting on a window that
    // never opened. With nothing to check it is a plain run-context failure: propagate.
    const needy = results.filter((r) => requiredIds.has(r.app.id) && !r.valid);
    if (needy.length === 0) throw e;
    return {
      authPending: true,
      loginUrl: needy[0].app.login_url,
      message: e.message,
      apps: needy.map((r) => ({
        id: r.app.id, name: r.app.name, loginUrl: r.app.login_url,
        authPending: true, key: `${workspace_id}__${r.app.id}`, reason: "launch_failed", launchFailed: true, message: e.message,
      })),
    };
  }
  if (opened.refused) return opened;
  const { session, id } = opened;
  const protectedUrlOf = () => (required[0] && (required[0].success_url || required[0].login_url))
    || (results.find((r) => r.valid) && (results.find((r) => r.valid).app.success_url || results.find((r) => r.valid).app.login_url))
    || "";
  // A warm session of this key that another call parked in the meantime already passed pre-flight.
  if (opened.reused) return _sessionResult(session, id, { sessionSource: "group" });

  try {
    if (batch.length > 0) {
      const outcomes = await _probeInSession(session, batch);
      for (const r of results) {
        if (r.valid !== null) continue;
        const entry = batch[r._batchIndex];
        r.valid = outcomes.get(entry.key);
        if (r.valid && entry.sessionPath) _writeValidationCache(entry.key, entry.sessionPath);
        delete r._batchIndex;
      }
    }
    const validatedCount = results.filter((r) => r.valid).length;
    if (logFn) logFn("info", "test_phase", {
      phase: `group_auth_validate_done:${validatedCount}/${results.length}_valid`,
      ms: Date.now() - _groupAuthT0,
      network_checked: batch.length,
      ttl_cached: results.filter((r) => r.fromCache).length,
    });
    const missingRequired = results.filter((r) => requiredIds.has(r.app.id) && !r.valid);

    if (missingRequired.length === 0) {
      if (opts.authOnly) {
        // Nothing to run — park the warm, signed-in browser for the next call (an Execute view is
        // released outright: it belongs to that one run).
        sessions.release(id, { closeNow: Boolean(session.hostOwned) });
        return { authenticated: true };
      }
      return _sessionResult(session, id, { protectedUrl: protectedUrlOf(), sessionSource: "group" });
    }

    const names = missingRequired.map((r) => r.app.name);
    const plural = missingRequired.length === 1;
    const message =
      `This workflow belongs to the ${group.name} group and requires authentication to ` +
      `${required.length} application${required.length === 1 ? "" : "s"}. Sign in to ` +
      `${names.join(", ")} in the window${plural ? "" : "s"} that just opened, then run the skill again.`;
    const alreadyOpenMessage =
      `Sign-in for ${names.join(", ")} is already waiting in ${plural ? "an open window" : "open windows"} ` +
      `— finish signing in there, then run the skill again.`;

    // An unattended (scheduled) run has nobody to sign in: opening a login window on a machine no one
    // is sitting at only strands it. Report which app needs a person instead, and close the session.
    if (opts.noPrompt) {
      sessions.release(id, { closeNow: true });
      return {
        authPending: false,
        expiredApps: names,
        message: `${names.join(", ")} ${plural ? "is" : "are"} not signed in — the saved sign-in is missing or has expired — and a scheduled run has nobody to sign in. ` +
          `Sign in on this machine (run the skill once, or use the authenticate tool); it will run on schedule again after that.`,
      };
    }

    // A headless browser cannot show a login page, so an unattended run that needs a human still
    // opens its own visible window (the one case that costs a second Chromium) and this session —
    // useless once the login lands somewhere else — is closed rather than kept warm.
    const inSession = !headless;
    if (!inSession) sessions.release(id, { closeNow: true });

    // While sign-in is pending the session stays leased (it holds the login tabs). The last app to
    // settle parks it warm — the caller's next getCachedBrowser reuses it, already signed in — or
    // closes it if anything went wrong or a login ended up in someone else's window.
    const hold = { remaining: missingRequired.length, clean: true };
    const settleOne = () => {
      if (--hold.remaining > 0 || !inSession) return;
      sessions.release(id, { closeNow: !hold.clean });
    };
    const hostsOf = (a) => [_hostOf(a.login_url), _hostOf(a.success_url)].filter(Boolean);
    const pendings = await Promise.all(missingRequired.map((r) =>
      beginInteractiveAuth(`${workspace_id}__${r.app.id}`, r.app.login_url, {
        label: r.app.name,
        storedState: r.stored,
        protectedUrl: r.app.success_url || r.app.login_url,
        authManager,
        sessionsDir: SESSIONS_DIR,
        logFn,
        runId: opts.runId,
        ...(inSession ? {
          session,
          hosts: hostsOf(r.app),
          claimedElsewhere: group.apps.filter((a) => a.id !== r.app.id).flatMap(hostsOf),
          onSettled: (h) => { if (h.outcome !== "captured") hold.clean = false; settleOne(); },
        } : {}),
      })
    ));
    if (inSession) {
      // Apps whose login is not ours to settle (already open in another session's window, or it
      // never launched) count down here instead; the session is then not worth keeping.
      for (const p of pendings) {
        if (p.reason === "already_open" || p.reason === "launch_failed" || !p.authPending) { hold.clean = false; settleOne(); }
      }
    }
    const allPending = pendings.every((p) => p.authPending);
    // A real launch failure (chromium missing/mid-install, etc.) on any one app must win
    // over the generic "windows just opened" message — it's the actionable diagnosis.
    const failed = pendings.find((p) => p.launchFailed);
    return {
      authPending: allPending,
      loginUrl: pendings[0] && pendings[0].loginUrl,
      message: failed ? failed.message
        : (allPending ? (pendings.every((p) => p.reason === "already_open") ? alreadyOpenMessage : message)
          : pendings.find((p) => !p.authPending)?.message),
      apps: missingRequired.map((r, i) => ({ id: r.app.id, name: r.app.name, loginUrl: r.app.login_url, ...pendings[i] })),
    };
  } catch (e) {
    sessions.release(id, { closeNow: true });
    throw e;
  }
}

async function _persistSession(workspace_id, state, authManager, sessionsDir, logFn) {
  if (authManager) {
    try {
      const sessionKey = await authManager.getSessionKey(workspace_id, logFn);
      const encrypted = authManager.saveEncryptedSession(workspace_id, state, sessionKey, sessionsDir, logFn);
      if (!encrypted) authManager.saveRawSession(workspace_id, state, sessionsDir, logFn);
    } catch (_) {
      authManager.saveRawSession(workspace_id, state, sessionsDir, logFn);
    }
  } else {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, `${workspace_id}_raw_state.json`), JSON.stringify(state, null, 2), { mode: 0o600 });
  }
}

// ─── Browser sessions (registry in browser_session.js) ─────────────────────────
// EVERY live Chromium — headless or visible — is a registered session, so the 5-instance cap holds
// for all of them. A session is a LEASE (RT-3): a run holds it `busy` for the whole execution (and
// through a parked recovery); the idle timer only starts once it is released; two concurrent runs
// never share one live context (tabs.js's popup registry and the per-run download listener both
// assume exactly one run per context), so a call that finds its session leased gets its own.
//
// A parked session skips pre-flight on reuse — it only proves the browser is still alive, not that
// the logins are, a real staleness window (authentication is pre-flight-only, so an expiry inside
// it surfaces mid-run instead). Kept short rather than re-validating on every hit, which would add
// a probe's worth of latency to the common nothing-expired case. A visible run's session is not
// parked: server.js closes its browser at teardown and release() then drops the dead entry at once.

// A session is one Chromium keyed by what it is authenticated for: requiredAppIds is part of the
// key because two skills in the same group can depend on different app subsets, so a context built
// (or auth-gated) for one must never be reused for the other. A host-owned (Execute) session also
// carries its run id — its views live under that id in Execute's panel, so another run must not
// inherit them.
function _sessionKey(workspace_id, opts, headless) {
  const appsKey = Array.isArray(opts.requiredAppIds) ? `[${[...opts.requiredAppIds].sort().join(",")}]` : "*";
  const host = !headless && opts.runId && hostBrowser.endpoint() ? `::host:${opts.runId}` : "";
  return `${workspace_id}::${opts.groupId || ""}::${appsKey}::${headless ? "h" : "w"}${host}`;
}

// Registers a new Chromium (or Execute view) for `key`, seeded with `stored`. Reuses a parked one if
// there is one; refuses (-> { refused, message }) when every slot is leased. The session object
// carries its own close(), which is the ONE teardown seam (teardownExecBrowser).
function _openSession(key, stored, headless, opts = {}) {
  return sessions.acquire(key, {
    create: async () => {
      const built = await _buildExecContext(stored, headless, opts);
      const session = { ...built, hostRunId: built.hostOwned ? opts.runId : undefined };
      session.close = () => teardownExecBrowser({
        browser: session.browser, context: session.context, hostOwned: session.hostOwned, runId: session.hostRunId,
      });
      return session;
    },
  });
}

// What every caller of getCachedBrowser/getAuthContext gets for a ready session. `leaseKey` is the
// registry id server.js hands back to releaseCachedBrowser.
function _sessionResult(session, id, extra = {}) {
  if (extra.protectedUrl !== undefined) session.protectedUrl = extra.protectedUrl;
  return {
    browser: session.browser, context: session.context, page: session.page,
    hostOwned: session.hostOwned, hostRunId: session.hostRunId,
    protectedUrl: session.protectedUrl || "", leaseKey: id, ...extra,
  };
}
async function _openSessionResult(key, stored, headless, opts, extra) {
  const r = await _openSession(key, stored, headless, opts);
  return r.refused ? r : _sessionResult(r.session, r.id, extra);
}

// A throwaway or sign-in tab inside a session. A launched context makes its own page; Execute's
// Electron target can't (see host_browser.js), so it asks Execute for a labelled view instead and
// keeps the tab id, which is what lets just this one view be closed later.
async function _newSessionPage(session, { label, focus } = {}) {
  if (session.hostOwned) {
    const { page, tabId } = await hostBrowser.openTab({ context: session.context, runId: session.hostRunId, label, focus });
    return { page, hostTabId: tabId };
  }
  return { page: await session.context.newPage() };
}
async function _closeSessionPage(session, { page, hostTabId }) {
  try { if (!page.isClosed()) await page.close(); } catch (_) {}
  if (session.hostOwned && hostTabId) await hostBrowser.release({ runId: session.hostRunId, tabId: hostTabId });
}

// Live-check stored sessions in throwaway tabs of the session's own context — no separate browser.
// Each entry: { key, protectedUrl, label }. A failure on one entry marks just that entry invalid.
async function _probeInSession(session, entries) {
  const outcomes = new Map();
  await Promise.all(entries.map(async (entry) => {
    let tab;
    try {
      tab = await _newSessionPage(session, { label: entry.label, focus: false });
      await tab.page.goto(entry.protectedUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      outcomes.set(entry.key, await _isAuthenticated(tab.page, entry.protectedUrl));
    } catch (_) {
      outcomes.set(entry.key, false);
    } finally {
      if (tab) await _closeSessionPage(session, tab);
    }
  }));
  return outcomes;
}

async function getCachedBrowser(workspace_id, authManager, opts = {}) {
  const headless = opts.headless !== false; // default true
  // A parked session of this key skips pre-flight entirely — it only proves the browser is still
  // alive, not that the logins are, which is a real staleness window kept short by the registry's
  // idle timeout (authentication is meant to be pre-flight-only).
  const hit = sessions.reuse(_sessionKey(workspace_id, opts, headless));
  if (hit) return { ..._sessionResult(hit.session, hit.id), cached: true };
  const result = await getAuthContext(workspace_id, authManager, {
    headless, logFn: opts.logFn, groupId: opts.groupId, requiredAppIds: opts.requiredAppIds, runId: opts.runId, noPrompt: opts.noPrompt,
  });
  // authPending / refused mean no browser was handed out — nothing to lease.
  return { ...result, cached: false, leaseKey: result.leaseKey || null };
}

// Ends a run's lease on a session (no-op for a null leaseKey). Re-arms the idle timer from this
// moment, not from when the lease was acquired, so a long execution is never reaped mid-run.
function releaseCachedBrowser(leaseKey, opts) {
  if (!leaseKey) return;
  sessions.release(leaseKey, opts);
}

// ─── Session management ───────────────────────────────────────────────────────

function _isBlankUrl(url) {
  const value = String(url || "").trim().toLowerCase();
  return !value || value === "about:blank" || value === "chrome://newtab/";
}

function _rejectReasonForProtectedUrl(url) {
  const value = String(url || "").trim();
  if (_isBlankUrl(value)) {
    return "No authenticated page URL was captured. Log in, navigate to the page where workflows should start, then close Chromium.";
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    return "The captured protected URL is not valid.";
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    return "The captured protected URL must be an http or https page.";
  }
  const lowered = value.toLowerCase();
  if (LOGIN_URL_PATTERNS.some(marker => lowered.includes(marker))) {
    return "The final page still looks like a login/auth page. Navigate to the authenticated app page, then close Chromium.";
  }
  return "";
}

async function _isAuthenticated(page, protectedUrl) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (_reachedProtectedUrl(page.url(), protectedUrl)) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

// opts.runId, when set, is Execute's cue to borrow its own browser view instead of
// launching one (see host_browser.js). Only reachable when headless is false — a
// borrowed browser is always visible, by definition of what Execute uses it for —
// and only when CONXA_HOST_BROWSER_CDP is actually set, so every other client
// (Claude Desktop, the scheduler, the Build Studio sandbox) never even attempts it.
// A failure at any step (connect, view creation, seeding) falls through to the
// normal launch below and logs why — a run must never hard-fail over Execute's
// panel being unavailable.
async function _buildExecContext(stored, headless = false, opts = {}) {
  if (!headless && opts.runId && hostBrowser.endpoint()) {
    try {
      return await hostBrowser.acquire({ runId: opts.runId, storageState: stored, label: opts.label });
    } catch (e) {
      if (opts.logFn) opts.logFn("warn", "host_browser_fallback", { run_id: opts.runId, error: e.message });
    }
  }
  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({ storageState: stored, acceptDownloads: true });
  return { browser, context };
}

// Launch the headed login window and navigate to targetUrl. Kept separate from
// _waitForInteractiveAuth() so beginInteractiveAuth() can await just this fast part —
// a chromium.launch()/goto() failure surfaces to the caller immediately instead of
// being swallowed by a detached background task (see beginInteractiveAuth).
async function _openInteractiveAuthWindow(workspace_id, targetUrl, opts = {}) {
  const { storedState, runId, logFn, label, session } = opts;
  // In-session (the normal case): a sign-in is just another tab of the session's own context, so
  // the cookies it earns are already where the workflow will run. One trade-off, the same one the
  // host branch below documents: the context was built for the RUN, so it does not carry
  // STEALTH_CONTEXT_OPTIONS (a fixed UA/locale/timezone would change the environment the run
  // reports against its recording). A visible Chromium's own UA is not a headless tell, and
  // _maskAutomation still applies per page.
  if (session) {
    const tab = await _newSessionPage(session, { label, focus: true });
    try {
      await _maskAutomation(tab.page);
      await tab.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e) {
      await _closeSessionPage(session, tab);
      throw e;
    }
    return { session, loginPage: tab.page, hostTabId: tab.hostTabId };
  }
  // EXEC-41 Stage 2: a login window is just another headed browser, so it gets the exact
  // same host branch as a skill run's own context (see _buildExecContext) — Execute's panel,
  // not a separate OS window, when Execute is the client. One real, accepted trade-off: the
  // launch path below applies STEALTH_CONTEXT_OPTIONS (a desktop-Chrome UA, viewport, locale,
  // timezone) via browser.newContext(), which the host branch cannot do — Electron's CDP
  // target has no Target.createBrowserContext (Stage-0 spike), so this reuses Execute's own
  // single context as-is. A bot-protection screen that specifically distrusts Electron's own
  // UA string may reject a host-owned login page more often than the launched one; this is
  // caught the same way any login failure is — the retry in beginInteractiveAuth, and a
  // connect failure here falling straight through to the launch path below.
  if (runId && hostBrowser.endpoint()) {
    try {
      const { browser: loginBrowser, context: loginCtx, page: loginPage, hostTabId } =
        await hostBrowser.acquire({ runId, storageState: storedState, label, focus: true });
      await _maskAutomation(loginPage);
      await loginPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      return { loginBrowser, loginCtx, loginPage, hostOwned: true, hostRunId: runId, hostTabId };
    } catch (e) {
      if (logFn) logFn("warn", "host_browser_fallback", { run_id: runId, phase: "login", error: e.message });
    }
  }
  const loginBrowser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const loginCtx = await loginBrowser.newContext({
    ...STEALTH_CONTEXT_OPTIONS,
    acceptDownloads: true,
    // Seed with the last known session (even if expired) so a partially-stale session
    // (e.g. one cookie refreshed, others still good) can skip straight past steps the
    // site would otherwise re-prompt for, instead of forcing a full fresh login.
    ...(storedState ? { storageState: storedState } : {}),
  });
  const loginPage = await loginCtx.newPage();
  // Mask Playwright detection at the JS level — prevents "browser not secure" errors
  await _maskAutomation(loginPage);
  await loginPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  return { loginBrowser, loginCtx, loginPage };
}

// How long a login window may sit open before it is given up on.
const LOGIN_WAIT_MS = 10 * 60 * 1000;

// Wait for the user to finish signing in (or close the window) and return the
// captured session. Runs in the background — see beginInteractiveAuth.
async function _waitForInteractiveAuth(workspace_id, opened, opts = {}) {
  if (opened.session) return _waitForSessionLogin(workspace_id, opened, opts);
  const { protectedUrl, waitMs = LOGIN_WAIT_MS } = opts;
  const { loginBrowser, loginCtx, loginPage, hostOwned, hostRunId, hostTabId } = opened;
  let lastUrl = "";
  let lastState = null;
  let _autoCloseScheduled = false;

  // Shared close point for both the auto-close-on-success timer below and the final
  // fallback close — mirrors teardownExecBrowser's reasoning exactly: loginBrowser.close()
  // on a CDP connection only ever disconnects (never kills Execute's browser process), but
  // a host-owned login still needs Execute told to actually destroy the view, or it leaks
  // until Execute's own idle cleanup reclaims it.
  const _closeLoginBrowser = async () => {
    try { if (loginBrowser.isConnected()) await loginBrowser.close(); } catch (_) {}
    if (hostOwned && hostRunId) await hostBrowser.release({ runId: hostRunId, tabId: hostTabId });
  };

  // Capture storageState when the user lands on an authenticated page. Scoped to
  // protectedUrl's own hostname when known — an OAuth leg through a different host
  // (accounts.google.com, whose URLs contain "auth"/"oauth"/"signin") is never mistaken
  // for "still on the login page". Falls back to the old whole-URL heuristic when
  // protectedUrl isn't known yet.
  // On first successful capture, schedule auto-close after 1.5 s so the user
  // does not need to close the window manually.  The 1.5 s gap lets the
  // periodic interval fire once more to pick up any localStorage tokens
  // written by post-login JS after the redirect completes.
  // If the user closes the window before the timer fires, `disconnected`
  // resolves the outer promise and the already-captured state is used.
  const _captureIfAuthenticated = async () => {
    const reached = protectedUrl
      ? _reachedProtectedUrl(lastUrl, protectedUrl)
      : !_rejectReasonForProtectedUrl(lastUrl);
    if (!reached) return;
    try { lastState = await loginCtx.storageState(); } catch (_) { return; }
    if (lastState && !_autoCloseScheduled) {
      _autoCloseScheduled = true;
      setTimeout(() => { _closeLoginBrowser().catch(() => {}); }, 1500);
    }
  };

  const rememberPage = async (page) => {
    if (!page) return;
    try {
      if (page.isClosed()) return;
      const url = page.url();
      if (!_isBlankUrl(url)) lastUrl = url;
    } catch (_) {}
  };

  const attachPage = (page) => {
    rememberPage(page).catch(() => {});
    page.on("framenavigated", (frame) => {
      try {
        if (!frame.parentFrame()) {
          rememberPage(page)
            .then(() => _captureIfAuthenticated())
            .catch(() => {});
        }
      } catch (_) {}
    });
    // Capture right before the page closes — covers the case where the user closes
    // the browser immediately after landing on the authenticated page, before the
    // next framenavigated capture has a chance to run.
    page.on("close", () => { _captureIfAuthenticated().catch(() => {}); });
  };

  loginCtx.on("page", attachPage);
  attachPage(loginPage);

  // Wait for the user to close all browser windows (event-driven).
  // Also run a periodic re-capture every 1.5 s for apps that write session tokens
  // into localStorage/sessionStorage via client JS after the page has loaded —
  // framenavigated fires before that JS runs, so the one-shot capture misses them.
  // Bounded: a host-owned login shares a CDP connection with Execute's whole process, so
  // "disconnected" never fires when the person just walks away from the panel — without a
  // deadline that login stays pending forever and _pendingAuth turns every later run into
  // "a login window is already open".
  let timedOut = false;
  await new Promise(resolve => {
    const interval = setInterval(() => {
      _captureIfAuthenticated().catch(() => {});
      // A host-owned login shares Execute's CDP connection, so closing just this tab never fires
      // "disconnected" — notice it here instead of waiting out the 10-minute deadline.
      // ponytail: gives up if the user closes the ORIGINAL page after signing in via an OAuth
      // popup; beginInteractiveAuth's one-shot reopen covers that.
      if (hostOwned && loginPage.isClosed()) { clearInterval(interval); clearTimeout(deadline); resolve(); }
    }, 1500);
    const deadline = setTimeout(() => { timedOut = true; clearInterval(interval); resolve(); }, waitMs);
    loginBrowser.on("disconnected", () => { clearInterval(interval); clearTimeout(deadline); resolve(); });
  });

  // Last-resort fallback: try once more in case context is still accessible.
  if (lastState === null) {
    try { lastState = await loginCtx.storageState(); } catch (_) {}
  }

  await _closeLoginBrowser();

  if (timedOut && !lastState) {
    throw Object.assign(
      new Error(`The login window for ${workspace_id} timed out before sign-in finished. Run the skill again to get a new one.`),
      { loginTimedOut: true },
    );
  }

  const rejectReason = _rejectReasonForProtectedUrl(lastUrl);
  if (rejectReason) throw new Error(rejectReason);
  if (!lastState) throw new Error(`Authentication session was not captured for ${workspace_id}. Please try again.`);
  return { state: lastState, protectedUrl: lastUrl };
}

// _waitForInteractiveAuth for a sign-in TAB inside a session (see _openInteractiveAuthWindow).
// Detection is a poll over EVERY page of the shared context rather than events on one window: it
// is what makes "finished in a different tab", an OAuth popup, a multi-hop SSO redirect and a login
// page that closes itself all look the same — some page of this context is on the app, off its
// login path (_reachedProtectedUrl, host-scoped, so an OAuth leg through another host never counts).
// Only the login tab and pages it opened (page.opener() chain) are closed afterwards; another
// app's concurrent login tab, and tabs the user opened themselves, are never touched.
// Resolves { state, protectedUrl } — `state` is already sliced to this app (refreshAppState).
async function _waitForSessionLogin(key, opened, opts = {}) {
  const { session, loginPage, hostTabId } = opened;
  const { protectedUrl, waitMs = LOGIN_WAIT_MS, storedState, hosts = [], claimedElsewhere = null } = opts;
  const ctx = session.context;

  const mine = new Set([loginPage]);
  const adopt = async (page) => {
    try { const from = await page.opener(); if (from && mine.has(from)) mine.add(page); } catch (_) {}
  };
  ctx.on("page", adopt);

  const isClosed = (p) => { try { return p.isClosed(); } catch (_) { return true; } };
  // A launched session's context is private to this run, so any page in it counts (that is what
  // makes a login finished in another tab work). A host-owned context is Execute's single shared
  // one — every run's views live in it — so only pages this login created may count, or another
  // run's already-signed-in page would be mistaken for this sign-in and its session captured (EXEC-45).
  const candidates = () => (session.hostOwned ? [...mine] : ctx.pages());
  const reached = () => candidates().find((p) => {
    if (isClosed(p)) return false;
    try { return protectedUrl ? _reachedProtectedUrl(p.url(), protectedUrl) : !_rejectReasonForProtectedUrl(p.url()); } catch (_) { return false; }
  });

  let outcome = null;
  await new Promise((resolve) => {
    let closedAt = 0;
    const finish = (o) => {
      if (outcome) return;
      outcome = o;
      clearInterval(poll); clearTimeout(deadline);
      try { session.browser.off("disconnected", onGone); } catch (_) {}
      resolve();
    };
    const onGone = () => finish("gone");
    const poll = setInterval(() => {
      if (reached()) return finish("reached");
      // The login tab is closed and nothing else got there — but a page that closes itself right
      // after a redirect can beat the poll, so give a success elsewhere a moment to show up.
      if (isClosed(loginPage)) {
        if (!closedAt) closedAt = Date.now();
        else if (Date.now() - closedAt >= LOGIN_CLOSE_GRACE_MS) finish("closed");
      }
    }, LOGIN_POLL_MS);
    const deadline = setTimeout(() => finish("timeout"), waitMs);
    // A launched session's window/browser being closed; an Execute view closing is caught by the
    // login tab's own isClosed() above (the CDP connection is Execute's whole process).
    try { session.browser.on("disconnected", onGone); } catch (_) {}
  });

  let state = null;
  let landedUrl = "";
  if (outcome === "reached") {
    await new Promise((r) => setTimeout(r, LOGIN_SETTLE_MS)); // post-login JS writes its tokens late
    const page = reached();
    landedUrl = page ? page.url() : "";
    try { state = await ctx.storageState(); } catch (_) {}
  }

  try { ctx.off("page", adopt); } catch (_) {}
  for (const p of mine) {
    if (p === loginPage) await _closeSessionPage(session, { page: p, hostTabId });
    else { try { if (!isClosed(p)) await p.close(); } catch (_) {} }
  }

  if (outcome === "reached") {
    if (!state) throw new Error(`Authentication session was not captured for ${key}. Please try again.`);
    return { state: refreshAppState(storedState, state, hosts, claimedElsewhere), protectedUrl: landedUrl };
  }
  if (outcome === "timeout") {
    throw Object.assign(
      new Error(`The login window for ${key} timed out before sign-in finished. Run the skill again to get a new one.`),
      { loginTimedOut: true },
    );
  }
  throw new Error(outcome === "gone"
    ? `The browser was closed before sign-in finished for ${key}.`
    : `The sign-in tab for ${key} was closed before sign-in finished.`);
}

// Per-workspace handle for an in-flight (or just-finished) interactive login window, so a
// second execute_skill call while the window is open doesn't spawn a second one.
const _pendingAuth = new Map();

// Open a headed Chromium window for the user to log in. The launch itself (the fast,
// synchronous part) is awaited here, so a genuine failure — chromium missing/mid-install,
// launch permission error, bad navigation — is returned to the caller as the real error
// instead of the misleading "window opened" message. Once the window is open, waiting
// for the user to actually sign in happens in the background; the window disconnecting
// with no session captured (user closed it before signing in) reopens once, then gives
// up — the next call to this function starts a fresh attempt.
async function beginInteractiveAuth(workspace_id, targetUrl, opts = {}) {
  const { storedState, protectedUrl, authManager, sessionsDir, logFn, runId, label, session, hosts, claimedElsewhere, onSettled } = opts;

  const existing = _pendingAuth.get(workspace_id);
  if (existing && existing.status === "pending") {
    return { authPending: true, loginUrl: targetUrl, key: workspace_id, reason: "already_open",
      message: `A login window for ${label || workspace_id} is already open. Sign in there.` };
  }
  const reopened = existing && existing.status === "done" && existing.outcome === "abandoned";

  let opened;
  try {
    opened = await _openInteractiveAuthWindow(workspace_id, targetUrl, { storedState, runId, logFn, label, session });
  } catch (e) {
    // authPending stays true so the existing "gate on auth" handling in callers still
    // fires (they only branch on this flag) — only the message differs, carrying the
    // real failure instead of a claim that a window opened.
    return { authPending: true, loginUrl: targetUrl, key: workspace_id, reason: "launch_failed", message: e.message, launchFailed: true };
  }

  const handle = { status: "pending", outcome: null };
  _pendingAuth.set(workspace_id, handle);

  // Callers (the execute_skill gate, the `authenticate` tool) await this via awaitInteractiveAuth.
  // The body never rejects — every failure lands in handle.outcome/message below.
  // Runs before `settled` resolves, so whoever awaits the outcome sees the session already released.
  const settle = () => { try { if (onSettled) onSettled(handle); } catch (_) {} };
  handle.settled = (async () => {
    let lastErr = null;
    let currentlyOpen = opened;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { state } =
          await _waitForInteractiveAuth(workspace_id, currentlyOpen, { protectedUrl, storedState, hosts, claimedElsewhere });
        await _persistSession(workspace_id, state, authManager, sessionsDir, logFn);
        // Just signed in inside the very context the run will use — nothing left to prove, so stamp
        // the validation cache instead of making the next pre-flight probe it again.
        if (session) {
          try {
            const { sessionPath } = await _loadSessionForKey(workspace_id, authManager, logFn);
            if (sessionPath) _writeValidationCache(workspace_id, sessionPath);
          } catch (_) {}
        }
        handle.status = "done";
        handle.outcome = "captured";
        settle();
        return;
      } catch (e) {
        lastErr = e;
        // Reopen a fresh window for the retry — the previous one is already closed
        // (disconnected is what got us here). A timeout is different: nobody is there, so
        // reopening would just put another unattended window up.
        if (e.loginTimedOut) break;
        if (attempt === 0) {
          try {
            currentlyOpen = await _openInteractiveAuthWindow(workspace_id, targetUrl, { storedState, runId, logFn, label, session });
          } catch (e2) {
            lastErr = e2;
            break;
          }
        }
      }
    }
    handle.status = "done";
    handle.outcome = "abandoned";
    handle.message = lastErr && lastErr.message;
    settle();
  })();

  const message = reopened
    ? `The previous login window for ${workspace_id} was closed before signing in. Opened a new one — sign in there, then re-run the skill.`
    : `Opened a browser window for the user to log in to ${workspace_id}. Sign in there — the window closes on its own once you land on the app.`;
  return { authPending: true, loginUrl: targetUrl, key: workspace_id, reason: reopened ? "reopened" : "opened", message };
}

// Await the outcome of an in-flight interactive login started by beginInteractiveAuth.
// Resolves to { outcome: "captured" | "abandoned" | "timeout" | "none", message? } and never throws.
// A "timeout" here only means THIS caller stopped waiting — the login window stays open (its own
// LOGIN_WAIT_MS deadline is untouched) so the user can still finish and a later call picks it up.
async function awaitInteractiveAuth(key, { timeoutMs = 180000 } = {}) {
  const h = _pendingAuth.get(key);
  if (!h) return { outcome: "none" };
  if (h.status === "done") return { outcome: h.outcome, message: h.message };
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ outcome: "timeout" }), timeoutMs); });
  const settled = h.settled.then(() => ({ outcome: h.outcome, message: h.message }));
  try { return await Promise.race([settled, timeout]); } finally { clearTimeout(timer); }
}

// Wait for every login window an authPending result opened (a group result carries one entry per
// missing app in `apps`; a single-session result is its own entry). Skips entries that never got a
// window (launch_failed) — there is nothing to wait for. Resolves to
// [{ key, id?, name?, outcome, message? }], one per entry, in order.
async function awaitAuthPending(result, { timeoutMs } = {}) {
  const entries = Array.isArray(result.apps) ? result.apps : [result];
  return Promise.all(entries.map(async (e) => ({
    key: e.key, id: e.id, name: e.name || e.key,
    ...(e.reason === "launch_failed"
      ? { outcome: "launch_failed", message: e.message }
      : await awaitInteractiveAuth(e.key, { timeoutMs })),
  })));
}

// One plain word for a login's state, for get_execution_status: waiting | signed_in | closed | failed.
// No handle at all means the sign-in tab never opened.
function authAppStatus(key) {
  const h = _pendingAuth.get(key);
  if (!h) return "failed";
  if (h.status !== "done") return "waiting";
  return h.outcome === "captured" ? "signed_in" : "closed";
}

// One honest sentence for whatever is still unsigned after awaitAuthPending — names the real state
// (window still open vs closed vs never launched) instead of claiming a window "just opened".
function describeAuthWait(waited) {
  const pending = waited.filter((w) => w.outcome !== "captured");
  if (pending.length === 0) return "";
  const launch = pending.find((w) => w.outcome === "launch_failed");
  if (launch) return launch.message;
  const names = pending.map((w) => w.name).join(", ");
  const closed = pending.filter((w) => w.outcome === "abandoned" || w.outcome === "none");
  if (closed.length === pending.length) {
    return `The sign-in window for ${names} was closed before sign-in finished. Call authenticate (or run the skill again) to get a new one.`;
  }
  return `Still waiting for sign-in to ${names} — the window is still open. Finish signing in there, then call authenticate or run the skill again.`;
}

async function getAuthContext(workspace_id, authManager, opts = {}) {
  const headless = opts.headless !== false; // default true
  const logFn = opts.logFn;

  // Every pack Build Studio produces carries a `groups` block and every skill belongs to one (the
  // build refuses otherwise), so sign-in is always resolved per group app. A group with no apps is
  // valid — getGroupAuthContext runs it with no gate. There is no single-session fallback (AUTH-2):
  // a pack whose group can't be resolved was built before Workflow Groups or lost its group.
  const group = _resolveGroup(workspace_id, opts.groupId);
  if (!group) {
    throw new Error(
      `No sign-in group found for ${workspace_id}${opts.groupId ? ` (group ${opts.groupId})` : ""} — this skill pack ` +
      `predates Workflow Groups or its group was removed. Rebuild the pack in Build Studio and publish it again.`);
  }
  return getGroupAuthContext(workspace_id, group, authManager, {
    headless, logFn, requiredAppIds: opts.requiredAppIds, runId: opts.runId, authOnly: opts.authOnly, noPrompt: opts.noPrompt,
  });
}

// Resolve which app died from a mid-execution auth failure and describe it clearly —
// but do NOT open a re-auth window here. Authentication is pre-flight only (see
// getGroupAuthContext above): a run that hits an auth failure mid-execution always fails
// immediately, full stop, and re-authentication happens on the user's NEXT attempt, via
// the normal pre-flight gate at the top of the next execute_skill call — which re-validates
// this exact app and opens its login window then. Opening a window right here, at the
// moment of failure (the previous behavior), interrupted an already-dead run instead of
// waiting for a fresh attempt, which is what made it a mid-run auto-login rather than a
// pre-flight one. Called from server.js on auth failure. Group-aware: picks the app whose
// success_url/login_url host matches the failing page's own URL (server.js passes the page
// that actually bounced to a login screen, not the manifest's start-app URL — a group
// pack's target_url is the app the workflow STARTS in, which is the wrong app when a
// sibling dies mid-run). Falls back to opts.fallbackUrl's host (manifest.target_url) if the
// primary hint matches nothing — e.g. an OAuth hop landed on a third-party host — before
// giving up to the legacy group.apps[0] guess. Falls back to the non-group single-session
// behavior when there's no group at all.
function _hostOf(url) {
  try { return new URL(url).hostname; } catch (_) { return ""; }
}

async function captureReAuth(workspace_id, loginUrl, authManager, sessionsDir, logFn, opts = {}) {
  // authManager/sessionsDir are accepted (not used) to keep this function's call sites and
  // existing tests stable — they were only ever needed for the window-opening/session-persist
  // path this function no longer takes.
  const group = _resolveGroup(workspace_id, opts.groupId);
  if (group && group.apps && group.apps.length > 0) {
    const byHost = (host) => group.apps.find((a) => _hostOf(a.success_url || a.login_url) === host);
    let matchedBy = "failing-page-host";
    let app = byHost(_hostOf(loginUrl));
    if (!app && opts.fallbackUrl) {
      matchedBy = "manifest-fallback-host";
      app = byHost(_hostOf(opts.fallbackUrl));
    }
    if (!app) {
      // Neither the failing page's own host nor the manifest's fallback host matches any
      // app this group actually manages a saved session for. That means the redirect isn't
      // a tracked app's session dying — it's something else (most commonly a workflow's own
      // recorded login step failing on bad credentials against a site that was never
      // registered as a group app in the first place). Guessing group.apps[0] here used to
      // name a real, uninvolved app (e.g. "Render") in the user-facing error for a failure
      // that had nothing to do with it — worse than no guess. Report unresolved and let the
      // caller fall back to the plain step-failure message instead of fabricating a culprit.
      if (logFn) logFn("info", "reauth_app_unresolved", { workspace_id, loginUrl, fallbackUrl: opts.fallbackUrl || null });
      // `note` is for the person: name the site and where to fix it, without claiming a session died.
      const host = _hostOf(loginUrl);
      return {
        authPending: false, unresolved: true, loginUrl,
        note: `The page is at a sign-in screen on ${host || "a site"}, which has no sign-in set up in the ${group.name} group. ` +
          `If this workflow needs you signed in there, add it as an app in that group in Build Studio, then run again.`,
      };
    }
    if (logFn) logFn("info", "reauth_app_resolved", { workspace_id, appId: app.id, matchedBy });
    return {
      authPending: false,
      loginUrl: app.login_url,
      message: `${app.name}'s saved sign-in expired mid-run. Call execute_skill again — ` +
        `you'll be prompted to sign back in to ${app.name}, then can resume from where this left off.`,
    };
  }
  return {
    authPending: false,
    loginUrl,
    message: `The saved sign-in for ${workspace_id} expired mid-run. Call execute_skill again — ` +
      `you'll be prompted to sign back in, then can resume from where this left off.`,
  };
}

// The one place a watch-mode run's browser/context gets torn down. Replaces four
// near-identical `if (watch) { await _context.close(); await _browser.close(); }`
// blocks that used to live at each of server.js's teardown sites — a launched
// browser really is closed there, but a host-owned one (Execute's panel) is only
// ever disconnected: closing it would tear down Execute's whole browser process,
// panel and all, out from under the user. Doing this in one shared function is the
// point — a call site that forgot the `hostOwned` check would silently kill
// Execute's browser mid-session, and the fix belongs where every teardown path
// routes through, not patched into each one by hand.
async function teardownExecBrowser({ browser, context, hostOwned, runId }) {
  if (!browser) return;
  if (hostOwned) {
    await browser.close().catch(() => {}); // CDP connection: disconnect only
    if (runId) await hostBrowser.release({ runId }); // tell Execute to destroy the view
    return;
  }
  if (context) await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

async function gracefulShutdown() {
  await sessions.closeAll();
  process.exit(0);
}

module.exports = {
  getCachedBrowser,
  releaseCachedBrowser,
  teardownExecBrowser,
  getAuthContext,
  getGroupAuthContext,
  _filterRequiredApps,
  captureReAuth,
  beginInteractiveAuth,
  awaitInteractiveAuth,
  awaitAuthPending,
  describeAuthWait,
  authAppStatus,
  _pendingAuth,
  gracefulShutdown,
  mergeStorageStates,
  refreshAppState,
  _rejectReasonForProtectedUrl,
  _reachedProtectedUrl,
  _resolveGroup,
  _loadGroupAppSession,
  _loadSessionForKey,
  _readValidationCache,
  _writeValidationCache,
  _buildExecContext,
  _sessionKey,
  _openInteractiveAuthWindow,
  _waitForInteractiveAuth,
  AUTH_VALIDATION_TTL_MS,
};
