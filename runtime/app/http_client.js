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
    headers: extraHeaders = null, // PROD-18 policy_gate.js: X-Tracking-Token isn't
                                   // Bearer auth, so it can't reuse `token` above.
  } = opts;
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "conxa-runtime/1.0", ...(extraHeaders || {}) };
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

// ── Authenticated POST returning raw bytes ───────────────────────────────────
// downloadBuffer above is GET-only and sends no headers, so it cannot carry the sync token or
// the request body the artifact endpoint needs. That endpoint is a POST because the machine
// tells the cloud which hashes it already holds — the request IS the delta computation — and a
// list of dozens of hashes does not belong in a query string.
//
// Resolves { body, headers } rather than a bare buffer: the response carries the archive's own
// SHA-256 in a header, and the caller must verify it before extracting anything.
function postForBuffer(url, opts = {}) {
  const { token = null, json = null, timeoutMs = 60000, requireOkStatus = true } = opts;
  const payload = Buffer.from(JSON.stringify(json === null ? {} : json), "utf8");
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "conxa-runtime/1.0",
      "Content-Type": "application/json",
      "Content-Length": payload.length,
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const req = request(url, { method: "POST", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        if (requireOkStatus && res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        resolve({ body: Buffer.concat(chunks), headers: res.headers, statusCode: res.statusCode });
      });
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("post timeout")); });
    req.on("error", reject);
    req.end(payload);
  });
}

module.exports = { get, request, fetchJSON, downloadBuffer, postForBuffer };
