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

module.exports = { get, request };
