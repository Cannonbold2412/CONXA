"use strict";
/**
 * target_hosts.js — every external platform host a run's resolved skill(s) will
 * actually interact with, for host_lock.js to serialize against sibling runs
 * (RT-3 follow-up). Extracted from server.js so the multi-app union is
 * unit-testable without booting MCP stdio.
 *
 * Group skills (browser.js getGroupAuthContext) resolve to every REQUIRED app's
 * host, exactly matching the same pack.json `groups` lookup already used for
 * auth pre-flight in server.js — a skill's manifest is the only source of truth
 * this has to consult, since resolving skills never navigates a page. An
 * unresolvable/legacy manifest contributes no host (fail OPEN, not closed —
 * there's nothing concrete to lock, and refusing to run over a metadata gap
 * would be a worse outcome than the platform-level race this exists to reduce).
 */

function _hostOf(url) {
  try { return new URL(url).hostname; } catch (_) { return ""; }
}

function resolveTargetHosts(resolved, deps) {
  const { resolveGroup, filterRequiredApps } = deps;
  const hosts = new Set();
  for (const r of resolved) {
    const m = r.entry.manifest;
    if (m && m.group_id) {
      const group = resolveGroup(r.entry.workspace_id, m.group_id);
      if (group && Array.isArray(group.apps)) {
        for (const app of filterRequiredApps(group.apps, m.required_apps)) {
          const h = _hostOf(app.success_url || app.login_url);
          if (h) hosts.add(h);
        }
        continue;
      }
    }
    const h = _hostOf(m?.target_url || m?.entry_url || m?.login_url);
    if (h) hosts.add(h);
  }
  return [...hosts];
}

module.exports = { _hostOf, resolveTargetHosts };
