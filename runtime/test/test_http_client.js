"use strict";
// Covers the dev-mode sync fix: httpClient must route http:// URLs through the
// `http` core module and https:// URLs through `https` — using https.get on a
// plain http:// dev backend (CONXA_ENV=dev, see env.js) throws outright.
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const https = require("https");

const httpClient = require("../http_client");

test("get() routes http:// URLs through the http module", () => {
  const mock = test.mock.method(http, "get", () => ({}));
  httpClient.get("http://127.0.0.1:8000/api/v1/manifest.json", () => {});
  assert.strictEqual(mock.mock.callCount(), 1);
  mock.mock.restore();
});

test("get() routes https:// URLs through the https module", () => {
  const mock = test.mock.method(https, "get", () => ({}));
  httpClient.get("https://apis.conxa.in/api/v1/manifest.json", () => {});
  assert.strictEqual(mock.mock.callCount(), 1);
  mock.mock.restore();
});

test("request() routes by scheme the same way", () => {
  const httpMock = test.mock.method(http, "request", () => ({}));
  httpClient.request("http://127.0.0.1:8000/api/v1/telemetry/runtime-start", { method: "POST" });
  assert.strictEqual(httpMock.mock.callCount(), 1);
  httpMock.mock.restore();
});
