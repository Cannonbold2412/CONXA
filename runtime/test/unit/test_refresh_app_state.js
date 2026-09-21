// refreshAppState splits ONE app's slice out of a shared-context storageState. Logins now land in
// the same Chromium context the workflow runs in, so that context holds every app's cookies at
// once — writing it verbatim into each app's session file would let a stale sibling copy shadow a
// fresh login when the files are merged back together (mergeStorageStates keeps the FIRST cookie
// seen per name|domain|path). Python twin: conxa_core/storage/storage_state.py::refresh_app_state,
// plus a `hosts` fallback so an app's very first login (no previous file) is still attributable.
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let pass = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✓ ${name}`); pass++; })
    .catch((e) => { console.log(`  ✗ ${name}: ${e.message}`); process.exitCode = 1; });
}

// browser.js reads env at module load.
const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-refresh-app-state-"));
process.env.CONXA_DATA_DIR = tmpDataDir;
process.env.CONXA_DIR = tmpDataDir;
const { refreshAppState } = require("../../app/browser");

const ck = (name, domain, value = "v", p = "/") => ({ name, value, domain, path: p });
const names = (state) => state.cookies.map((c) => `${c.name}@${c.domain}`).sort();

async function run() {
  console.log("refreshAppState:");

  await check("keeps a rotated cookie on a domain the app already owned", () => {
    const previous = { cookies: [ck("sid", ".salesforce.com", "old")], origins: [] };
    const current = { cookies: [ck("sid", ".salesforce.com", "rotated")], origins: [] };
    const out = refreshAppState(previous, current, []);
    assert.deepStrictEqual(out.cookies, [ck("sid", ".salesforce.com", "rotated")]);
  });

  await check("drops a sibling app's cookies that share the same context", () => {
    const previous = { cookies: [ck("sid", ".salesforce.com")], origins: [] };
    const current = { cookies: [ck("sid", ".salesforce.com"), ck("SAPISID", ".google.com")], origins: [] };
    assert.deepStrictEqual(names(refreshAppState(previous, current, [])), ["sid@.salesforce.com"]);
  });

  await check("first login (no previous file) is attributed by the app's own hosts", () => {
    const current = {
      cookies: [ck("sid", ".salesforce.com"), ck("csrf", "login.salesforce.com"), ck("SAPISID", ".google.com")],
      origins: [],
    };
    const out = refreshAppState(undefined, current, ["login.salesforce.com"]);
    assert.deepStrictEqual(names(out), ["csrf@login.salesforce.com", "sid@.salesforce.com"]);
  });

  await check("a cookie set on a subdomain of the app's host is kept", () => {
    const current = { cookies: [ck("a", "cdn.acme.com"), ck("b", "acme.com")], origins: [] };
    assert.deepStrictEqual(names(refreshAppState(undefined, current, ["acme.com"])), ["a@cdn.acme.com", "b@acme.com"]);
  });

  await check("host matching respects the dot boundary (evilforce.com is not force.com)", () => {
    const current = { cookies: [ck("x", ".evilforce.com"), ck("y", ".force.com")], origins: [] };
    assert.deepStrictEqual(names(refreshAppState(undefined, current, ["acme.lightning.force.com"])), ["y@.force.com"]);
  });

  await check("localStorage origins are scoped the same way", () => {
    const ls = [{ name: "token", value: "t" }];
    const current = {
      cookies: [],
      origins: [
        { origin: "https://acme.lightning.force.com", localStorage: ls },
        { origin: "https://drive.google.com", localStorage: ls },
      ],
    };
    const out = refreshAppState(undefined, current, ["acme.lightning.force.com"]);
    assert.deepStrictEqual(out.origins.map((o) => o.origin), ["https://acme.lightning.force.com"]);
  });

  await check("a previously-owned origin is kept even when hosts is empty", () => {
    const previous = { cookies: [], origins: [{ origin: "https://app.example.com", localStorage: [] }] };
    const current = { cookies: [], origins: [{ origin: "https://app.example.com", localStorage: [{ name: "k", value: "new" }] }] };
    const out = refreshAppState(previous, current, []);
    assert.strictEqual(out.origins[0].localStorage[0].value, "new");
  });

  await check("with claimedElsewhere, an SSO provider's cookies (claimed by no app) are kept, a sibling's are not", () => {
    const current = {
      cookies: [ck("sid", ".salesforce.com"), ck("SID", ".accounts.okta.com"), ck("SAPISID", ".google.com")],
      origins: [{ origin: "https://login.okta.com", localStorage: [] }, { origin: "https://drive.google.com", localStorage: [] }],
    };
    const out = refreshAppState(undefined, current, ["login.salesforce.com"], ["drive.google.com"]);
    assert.deepStrictEqual(names(out), ["SID@.accounts.okta.com", "sid@.salesforce.com"]);
    assert.deepStrictEqual(out.origins.map((o) => o.origin), ["https://login.okta.com"]);
  });

  await check("missing previous/current yields an empty state, never throws", () => {
    assert.deepStrictEqual(refreshAppState(undefined, undefined, []), { cookies: [], origins: [] });
    assert.deepStrictEqual(refreshAppState(undefined, { cookies: [ck("a", ".x.com")] }, []), { cookies: [], origins: [] });
  });

  fs.rmSync(tmpDataDir, { recursive: true, force: true });
  console.log(`\n${pass} passed`);
  process.exit(process.exitCode || 0);
}

run();
