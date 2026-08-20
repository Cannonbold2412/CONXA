"use strict";
const { chromium } = (global.__hostRequire || require)("playwright");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

const CONXA_DIR      = process.env.CONXA_DIR || path.join(os.homedir(), ".conxa");
const CONXA_DATA_DIR = process.env.CONXA_DATA_DIR || (
  process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Roaming", "Conxa")
    : path.join(os.homedir(), ".conxa")
);
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

// Resolve a workspace's WorkflowGroup from pack.json's `groups` block. Packs
// built before Workflow Groups shipped have no `groups` key — callers must
// treat that as "take the legacy single-session path", not an error.
function _resolveGroup(workspace_id, groupId) {
  const pack = _loadPack(workspace_id);
  const groups = Array.isArray(pack.groups) ? pack.groups : [];
  if (groups.length === 0) return null;
  if (groupId) return groups.find((g) => g.id === groupId) || null;
  return groups[0];
}

function _groupAppSessionPath(workspace_id, appId) {
  return path.join(SESSIONS_DIR, `${workspace_id}__${appId}_raw_state.json`);
}

async function _validateGroupApp(workspace_id, app, authManager, logFn) {
  const key = `${workspace_id}__${app.id}`;
  let stored = null;
  if (authManager) {
    try {
      const token = await authManager.getSessionKey(key, logFn);
      if (token) stored = authManager.loadDecryptedSession(key, token, SESSIONS_DIR);
    } catch (_) {}
  }
  if (!stored) {
    const rawPath = _groupAppSessionPath(workspace_id, app.id);
    if (fs.existsSync(rawPath)) {
      try { stored = JSON.parse(fs.readFileSync(rawPath, "utf8")); } catch (_) {}
    }
  }
  if (!stored) return { app, stored: null, valid: false };
  const valid = await _validateSession(stored, app.success_url || app.login_url);
  return { app, stored, valid };
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

/** Group-aware auth resolution: validate every app in the group (not just the
 * required ones), gate on the REQUIRED apps only, but seed the merged context
 * from every app whose session validates. This mirrors what recording already
 * does (handlers/session.py seeds every captured app) — a workflow that
 * wanders into a sibling app mid-run arrives already signed in instead of
 * hitting a login wall, even though that app wasn't gated on up front.
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

  if (group.apps.length === 0) {
    const { browser, context } = await _buildExecContext(undefined, headless);
    return { browser, context, protectedUrl: "", sessionSource: "group-no-apps" };
  }

  // Validate every app in the group, not just the required ones — seeding needs
  // all of them; gating only needs the required subset of these same results.
  const results = await Promise.all(group.apps.map((app) => _validateGroupApp(workspace_id, app, authManager, logFn)));
  const missingRequired = results.filter((r) => requiredIds.has(r.app.id) && !r.valid);

  if (missingRequired.length > 0) {
    const names = missingRequired.map((r) => r.app.name);
    const plural = missingRequired.length === 1;
    const message =
      `This workflow belongs to the ${group.name} group and requires authentication to ` +
      `${required.length} application${required.length === 1 ? "" : "s"}. Sign in to ` +
      `${names.join(", ")} in the window${plural ? "" : "s"} that just opened, then run the skill again.`;
    const pendings = await Promise.all(missingRequired.map((r) =>
      beginInteractiveAuth(`${workspace_id}__${r.app.id}`, r.app.login_url, {
        storedState: r.stored,
        protectedUrl: r.app.success_url || r.app.login_url,
        authManager,
        sessionsDir: SESSIONS_DIR,
        logFn,
      })
    ));
    const allPending = pendings.every((p) => p.authPending);
    return {
      authPending: allPending,
      loginUrl: pendings[0] && pendings[0].loginUrl,
      message: allPending ? message : pendings.find((p) => !p.authPending)?.message,
      apps: missingRequired.map((r, i) => ({ id: r.app.id, name: r.app.name, loginUrl: r.app.login_url, ...pendings[i] })),
    };
  }

  const merged = mergeStorageStates(results.filter((r) => r.valid).map((r) => r.stored));
  const { browser, context } = await _buildExecContext(merged, headless);
  const protectedUrl = (required[0] && (required[0].success_url || required[0].login_url))
    || (results.find((r) => r.valid) && (results.find((r) => r.valid).app.success_url || results.find((r) => r.valid).app.login_url))
    || "";
  return { browser, context, protectedUrl, sessionSource: "group" };
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

// ─── Browser cache (per-workspace, short idle timeout) ─────────────────────────
// A cache hit skips re-validating the underlying app session(s) entirely (see the
// `entry.context.pages()` liveness-only check below) — it only proves the browser process is
// still alive, not that the login is still good. That's a real staleness window: authentication
// is meant to be pre-flight-only (validated before a run starts), so a session that expires
// while sitting in this cache is only discovered mid-run instead, which the pre-flight model is
// supposed to prevent. Kept short (not zero — that would defeat the point of caching for a fast
// back-to-back sequence) rather than re-validating on every hit, which would add a probe's worth
// of latency to the common, nothing-expired case.
const _cache    = new Map();
const IDLE_MS   = 90 * 1000;

function _scheduleCleanup(cacheKey) {
  const entry = _cache.get(cacheKey);
  if (!entry) return;
  clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(async () => {
    const b = entry.browser;
    _cache.delete(cacheKey);
    if (b) await b.close().catch(() => {});
  }, IDLE_MS);
}

async function getCachedBrowser(workspace_id, authManager, opts = {}) {
  const headless = opts.headless !== false; // default true
  // requiredAppIds is part of the cache key: two skills in the same group can depend on
  // different app subsets, so a context built (or auth-gated) for one must never be
  // reused for the other.
  const appsKey = Array.isArray(opts.requiredAppIds) ? `[${[...opts.requiredAppIds].sort().join(",")}]` : "*";
  const cacheKey = opts.groupId ? `${workspace_id}::${opts.groupId}::${appsKey}` : workspace_id;
  if (headless) {
    const entry = _cache.get(cacheKey);
    if (entry && entry.browser && entry.context) {
      try {
        entry.context.pages(); // throws if closed
        _scheduleCleanup(cacheKey);
        return { browser: entry.browser, context: entry.context, protectedUrl: entry.protectedUrl, cached: true };
      } catch (_) {
        _cache.delete(cacheKey);
      }
    }
  }
  const result = await getAuthContext(workspace_id, authManager, {
    headless, logFn: opts.logFn, groupId: opts.groupId, requiredAppIds: opts.requiredAppIds,
  });
  // authPending means no browser/context was built (a login window was opened instead) —
  // nothing to cache.
  if (headless && !result.authPending) {
    _cache.set(cacheKey, { browser: result.browser, context: result.context, protectedUrl: result.protectedUrl, idleTimer: null });
    _scheduleCleanup(cacheKey);
  }
  return { ...result, cached: false };
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

function _authMetaPath(workspace_id) {
  return path.join(SESSIONS_DIR, `${workspace_id}_auth_meta.json`);
}

function _readAuthMeta(workspace_id) {
  try {
    const metaPath = _authMetaPath(workspace_id);
    return fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
  } catch (_) {
    return {};
  }
}

function _writeAuthMeta(workspace_id, patch) {
  const meta = {
    ..._readAuthMeta(workspace_id),
    ...patch,
    updated_at: new Date().toISOString(),
  };
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(_authMetaPath(workspace_id), JSON.stringify(meta, null, 2), { mode: 0o600 });
  return meta;
}

function _resolveProtectedUrl(workspace_id, pack = {}) {
  const metaUrl = String((_readAuthMeta(workspace_id).protected_url || "")).trim();
  if (metaUrl) return metaUrl;
  return String((pack.protected_url || "")).trim();
}

async function _isAuthenticated(page, protectedUrl) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (_reachedProtectedUrl(page.url(), protectedUrl)) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function _validateSession(stored, protectedUrl) {
  if (!protectedUrl) return true;
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const context = await browser.newContext({ ...STEALTH_CONTEXT_OPTIONS, storageState: stored, acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(protectedUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    return await _isAuthenticated(page, protectedUrl);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function _buildExecContext(stored, headless = false) {
  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({ storageState: stored, acceptDownloads: true });
  return { browser, context };
}

async function _captureInteractiveAuth(workspace_id, targetUrl, opts = {}) {
  const { storedState, protectedUrl } = opts;
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
  let lastUrl = "";
  let lastState = null;
  let _autoCloseScheduled = false;

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
      setTimeout(async () => {
        try { if (loginBrowser.isConnected()) await loginBrowser.close(); } catch (_) {}
      }, 1500);
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
  const loginPage = await loginCtx.newPage();

  // Mask Playwright detection at the JS level — prevents "browser not secure" errors
  await _maskAutomation(loginPage);

  attachPage(loginPage);
  await loginPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for the user to close all browser windows (event-driven).
  // Also run a periodic re-capture every 1.5 s for apps that write session tokens
  // into localStorage/sessionStorage via client JS after the page has loaded —
  // framenavigated fires before that JS runs, so the one-shot capture misses them.
  await new Promise(resolve => {
    const interval = setInterval(() => { _captureIfAuthenticated().catch(() => {}); }, 1500);
    loginBrowser.on("disconnected", () => { clearInterval(interval); resolve(); });
  });

  // Last-resort fallback: try once more in case context is still accessible.
  if (lastState === null) {
    try { lastState = await loginCtx.storageState(); } catch (_) {}
  }

  try {
    if (loginBrowser.isConnected()) await loginBrowser.close();
  } catch (_) {}

  const rejectReason = _rejectReasonForProtectedUrl(lastUrl);
  if (rejectReason) throw new Error(rejectReason);
  if (!lastState) throw new Error(`Authentication session was not captured for ${workspace_id}. Please try again.`);
  return { state: lastState, protectedUrl: lastUrl };
}

// Per-workspace handle for an in-flight (or just-finished) interactive login window, so a
// second execute_skill call while the window is open doesn't spawn a second one.
const _pendingAuth = new Map();

// Open a headed Chromium window for the user to log in, WITHOUT blocking the caller.
// Returns immediately with { authPending: true, loginUrl, message }; the capture (and
// session save) happens in the background. The window disconnecting with no session
// captured (user closed it before signing in) reopens once, then gives up — the next
// call to this function starts a fresh attempt.
async function beginInteractiveAuth(workspace_id, targetUrl, opts = {}) {
  const { storedState, protectedUrl, authManager, sessionsDir, logFn } = opts;

  const existing = _pendingAuth.get(workspace_id);
  if (existing && existing.status === "pending") {
    return { authPending: true, loginUrl: targetUrl,
      message: `A login window for ${workspace_id} is already open. Sign in there, then re-run the skill.` };
  }
  const reopened = existing && existing.status === "done" && existing.outcome === "abandoned";

  const handle = { status: "pending", outcome: null };
  _pendingAuth.set(workspace_id, handle);

  (async () => {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { state, protectedUrl: capturedUrl } =
          await _captureInteractiveAuth(workspace_id, targetUrl, { storedState, protectedUrl });
        await _persistSession(workspace_id, state, authManager, sessionsDir, logFn);
        _writeAuthMeta(workspace_id, { protected_url: capturedUrl });
        handle.status = "done";
        handle.outcome = "captured";
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    handle.status = "done";
    handle.outcome = "abandoned";
    handle.message = lastErr && lastErr.message;
  })();

  const message = reopened
    ? `The previous login window for ${workspace_id} was closed before signing in. Opened a new one — sign in there, then re-run the skill.`
    : `Opened a browser window for the user to log in to ${workspace_id}. Sign in there — the window closes on its own once you land on the app.`;
  return { authPending: true, loginUrl: targetUrl, message };
}

async function getAuthContext(workspace_id, authManager, opts = {}) {
  const headless = opts.headless !== false; // default true
  const logFn = opts.logFn;

  // Workflow Groups path: a pack with a `groups` block resolves every app's
  // session and merges them, instead of the single workspace-wide session
  // below. Packs built before Workflow Groups shipped have no `groups` key,
  // so _resolveGroup returns null and behavior is unchanged — see
  // _resolveGroup's comment.
  const group = _resolveGroup(workspace_id, opts.groupId);
  if (group && group.apps && group.apps.length > 0) {
    return getGroupAuthContext(workspace_id, group, authManager, { headless, logFn, requiredAppIds: opts.requiredAppIds });
  }

  let _hadEncryptedSession = false; // set true if encrypted path ran; raw session is then stale
  let lastKnownState = null; // best available (possibly expired) session — seeds the login window
  const pack = _loadPack(workspace_id);
  const protectedUrl = _resolveProtectedUrl(workspace_id, pack);
  const targetUrl    = pack.target_url || protectedUrl;

  // Try encrypted session (uses per-machine session key from keytar)
  if (authManager) {
    try {
      const token = await authManager.getSessionKey(workspace_id, logFn);
      if (token) {
        const stored = authManager.loadDecryptedSession(workspace_id, token, SESSIONS_DIR);
        if (stored) {
          lastKnownState = stored;
          if (await _validateSession(stored, protectedUrl)) {
            _writeAuthMeta(workspace_id, { protected_url: protectedUrl });
            const { browser, context } = await _buildExecContext(stored, headless);
            return { browser, context, protectedUrl, sessionSource: "encrypted" };
          }
          // Session expired — skip raw session (encrypted takes precedence), go to interactive auth
          _hadEncryptedSession = true;
        }
      }
    } catch (_) {}
  }

  // Try raw session (installer-included initial session, not yet encrypted)
  // Skip if encrypted path already ran — raw session is then stale and should not override
  const rawSessionPath = path.join(SESSIONS_DIR, `${workspace_id}_raw_state.json`);
  if (!_hadEncryptedSession && fs.existsSync(rawSessionPath)) {
    let stored;
    try { stored = JSON.parse(fs.readFileSync(rawSessionPath, "utf8")); } catch (_) {}
    if (stored) {
      lastKnownState = stored;
      if (await _validateSession(stored, protectedUrl)) {
        _writeAuthMeta(workspace_id, { protected_url: protectedUrl });
        const { browser, context } = await _buildExecContext(stored, headless);
        return { browser, context, protectedUrl, sessionSource: "raw" };
      }
    }
  }

  // No valid session — open an interactive login window for the user (non-blocking).
  if (!targetUrl) throw new Error(`No target_url configured for workspace ${workspace_id}. Cannot authenticate.`);

  return beginInteractiveAuth(workspace_id, targetUrl, {
    storedState: lastKnownState,
    protectedUrl,
    authManager,
    sessionsDir: SESSIONS_DIR,
    logFn,
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
      matchedBy = "group-apps[0]-default";
      app = group.apps[0];
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

async function gracefulShutdown() {
  for (const [, entry] of _cache.entries()) {
    clearTimeout(entry.idleTimer);
    if (entry.browser) await entry.browser.close().catch(() => {});
  }
  _cache.clear();
  process.exit(0);
}

module.exports = {
  getCachedBrowser,
  getAuthContext,
  getGroupAuthContext,
  _filterRequiredApps,
  captureReAuth,
  beginInteractiveAuth,
  gracefulShutdown,
  mergeStorageStates,
  _authMetaPath,
  _readAuthMeta,
  _writeAuthMeta,
  _resolveProtectedUrl,
  _rejectReasonForProtectedUrl,
  _reachedProtectedUrl,
  _resolveGroup,
};
