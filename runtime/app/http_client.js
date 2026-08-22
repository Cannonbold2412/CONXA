"use strict";
// Picks the http or https core module by URL scheme, so runtime clients that talk to
// CONXA_API_URL / sync_endpoint / manifest URLs work whether that's a real https://
// cloud or (CONXA_ENV=dev's default, see env.js) a plain http://127.0.0.1 dev backend.
// Node's https.get/request throw "Protocol http: not supported" outright otherwise.
const http  = require("http");
const https = require("https");

function _lib(url) {
  return String(url).startsWith("https:") ? https : http;
}

function get(url, ...rest) {
  return _lib(url).get(url, ...rest);
}

function request(url, ...rest) {
  return _lib(url).request(url, ...rest);
}

// ── Shared JSON GET ──────────────────────────────────────────────────────────
// Hoisted from the near-duplicate _fetchJSON implementations in
// manifest_manager.js and sync.js. Every option carries the exact default each
// former copy hardcoded, and call sites pass their previous values explicitly,
// so behavior is byte-identical at every existing call site.
function fetchJSON(url, opts = {}) {
  const {
    token = null,      // optional Bearer token (sync.js sent one; manifest did not)
    onNotModified = null, // value to resolve on HTTP 304 — sync.js resolves {files:[]};
                          // manifest_manager treats non-200 as an error (leave null)
    timeoutMs = 8000,
  } = opts;
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "conxa-runtime/1.0" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const req = get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        if (res.statusCode === 304 && onNotModified !== null) return resolve(onNotModified);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("request timeout")); });
    req.on("error", reject);
  });
}

// ── Shared binary GET ────────────────────────────────────────────────────────
// Hoisted from manifest_manager.js / sync.js's duplicate _downloadBuffer.
// requireOkStatus=false preserves sync.js's lenient behavior (consume body
// regardless of status); manifest_manager rejects non-200 before consuming.
function downloadBuffer(url, opts = {}) {
  const { requireOkStatus = true, timeoutMs = 120000 } = opts;
  return new Promise((resolve, reject) => {
    const req = get(url, (res) => {
      if (requireOkStatus && res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("download timeout")); });
    req.on("error", reject);
  });
}

module.exports = { get, request, fetchJSON, downloadBuffer };
