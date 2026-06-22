"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { verifyStep } = require("../run");

// Minimal mock page + locator for VERIFY unit testing (no browser).
function mockPage(url, counts = {}) {
  return {
    url: () => url,
    locator: (sel) => ({
      first: () => ({ waitFor: async () => { if ((counts[sel] || 0) === 0) throw new Error("not attached"); } }),
      count: async () => counts[sel] || 0,
    }),
  };
}

test("no assertions → pass", async () => {
  const page = mockPage("https://app.example.com/done");
  const r = await verifyStep(page, { type: "click" }, {});
  assert.strictEqual(r.pass, true);
});

test("url_pattern assertion passes when url matches", async () => {
  const page = mockPage("https://app.example.com/orders/123/confirmed");
  const step = { type: "click", validation: { assertions: [
    { type: "url_pattern", target: "/orders/.*/confirmed", required: true },
  ] } };
  const r = await verifyStep(page, step, {});
  assert.strictEqual(r.pass, true);
});

test("url_pattern assertion fails when url does not match", async () => {
  const page = mockPage("https://app.example.com/orders/cart");
  const step = { type: "click", validation: { assertions: [
    { type: "url_pattern", target: "/orders/.*/confirmed", required: true },
  ] } };
  const r = await verifyStep(page, step, {});
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.channel, "url_pattern");
});

test("selector_present passes when element attached", async () => {
  const page = mockPage("https://x.test", { ".success-banner": 1 });
  const step = { type: "click", validation: { assertions: [
    { type: "selector_present", target: ".success-banner", required: true },
  ] } };
  const r = await verifyStep(page, step, {});
  assert.strictEqual(r.pass, true);
});

test("selector_absent fails when element still present", async () => {
  const page = mockPage("https://x.test", { ".spinner": 2 });
  const step = { type: "click", validation: { assertions: [
    { type: "selector_absent", target: ".spinner", required: true },
  ] } };
  const r = await verifyStep(page, step, {});
  assert.strictEqual(r.pass, false);
});

test("advisory (required=false) assertion failure does not fail the step", async () => {
  const page = mockPage("https://x.test", {});
  const step = { type: "click", validation: { assertions: [
    { type: "selector_present", target: ".maybe", required: false },
  ] } };
  const r = await verifyStep(page, step, {});
  assert.strictEqual(r.pass, true);
});

test("interpolates input vars into assertion target", async () => {
  const page = mockPage("https://app.example.com/u/alice");
  const step = { type: "click", validation: { assertions: [
    { type: "url_pattern", target: "/u/{{user}}", required: true },
  ] } };
  const r = await verifyStep(page, step, { user: "alice" });
  assert.strictEqual(r.pass, true);
});
