"use strict";

// Platform-tag / multi-host lock keying: a group workflow that starts in one app
// and links into a sibling mid-recording (e.g. "Deploy a Service on Render then
// Visit frontend on Vercel") must resolve to EVERY required app's host, so a
// sibling run overlapping ANY of those hosts serializes against it while runs on
// disjoint platforms stay parallel. Proves resolveTargetHosts (extracted from
// server.js) computes that union — see conxa Workflow.visited_hosts for the
// Studio-side twin of this contract.

const test = require("node:test");
const assert = require("node:assert");

const { _hostOf, resolveTargetHosts } = require("../../app/target_hosts");

const RENDER = { id: "app_render", name: "Render", login_url: "https://dashboard.render.com/login", success_url: "https://dashboard.render.com/home" };
const VERCEL = { id: "app_vercel", name: "Vercel", login_url: "https://vercel.com/login", success_url: "https://vercel.com/{}" };
const BILLING = { id: "app_billing", name: "Billing", login_url: "https://billing.example.com/login", success_url: "https://billing.example.com/home" };

function deps(group) {
  return {
    resolveGroup: (_workspaceId, _groupId) => group,
    filterRequiredApps: (apps, ids) => (Array.isArray(ids) ? apps.filter((a) => ids.includes(a.id)) : apps),
  };
}

test("_hostOf handles full URLs, bad input, and returns lowercase hostnames via URL semantics", () => {
  assert.strictEqual(_hostOf("https://Dashboard.Render.com/x"), "dashboard.render.com");
  assert.strictEqual(_hostOf("not a url"), "");
  assert.strictEqual(_hostOf(""), "");
});

test("a skill requiring two group apps resolves to BOTH platform hosts", () => {
  const resolved = [{
    entry: {
      workspace_id: "acme",
      slug: "deploy_render_visit_vercel",
      manifest: { group_id: "g1", required_apps: ["app_render", "app_vercel"], target_url: "https://dashboard.render.com" },
    },
  }];
  const hosts = resolveTargetHosts(resolved, deps({ id: "g1", apps: [RENDER, VERCEL] }));
  assert.deepStrictEqual(hosts.sort(), ["dashboard.render.com", "vercel.com"]);
});

test("required_apps filtering wins over the group's full app list — untouched siblings add no host", () => {
  const resolved = [{
    entry: {
      workspace_id: "acme",
      slug: "deploy_only",
      manifest: { group_id: "g1", required_apps: ["app_render"], target_url: "https://dashboard.render.com" },
    },
  }];
  const hosts = resolveTargetHosts(resolved, deps({ id: "g1", apps: [RENDER, VERCEL, BILLING] }));
  assert.deepStrictEqual(hosts, ["dashboard.render.com"]);
});

test("legacy manifest without required_apps gates on every app (fail open)", () => {
  const resolved = [{
    entry: {
      workspace_id: "acme",
      slug: "legacy_group_skill",
      manifest: { group_id: "g1", target_url: "https://dashboard.render.com" },
    },
  }];
  const hosts = resolveTargetHosts(resolved, deps({ id: "g1", apps: [RENDER, BILLING] }));
  assert.deepStrictEqual(hosts.sort(), ["billing.example.com", "dashboard.render.com"]);
});

test("a non-group (standalone) skill contributes its own target_url host", () => {
  const resolved = [{
    entry: {
      workspace_id: "acme",
      slug: "standalone",
      manifest: { target_url: "https://example.com/app" },
    },
  }];
  const hosts = resolveTargetHosts(resolved, deps(null));
  assert.deepStrictEqual(hosts, ["example.com"]);
});

test("an unresolvable group contributes no host (fail open — nothing to lock)", () => {
  const resolved = [{
    entry: {
      workspace_id: "acme",
      slug: "ghost_group",
      manifest: { group_id: "g_missing", required_apps: ["app_render"] },
    },
  }];
  const hosts = resolveTargetHosts(resolved, {
    resolveGroup: () => null,
    filterRequiredApps: (apps) => apps,
  });
  assert.deepStrictEqual(hosts, []);
});
