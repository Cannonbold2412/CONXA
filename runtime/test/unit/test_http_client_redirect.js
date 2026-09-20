"use strict";

// downloadBuffer must follow redirects: GitHub release assets always answer 302 to a signed CDN
// URL, and self-update failed with "HTTP 302" when it didn't.

const test = require("node:test");
const assert = require("node:assert");
const http = require("http");

const { downloadBuffer } = require("../../app/http_client");

function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler).listen(0, "127.0.0.1", () =>
      resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

test("follows a relative 302 to the real file", async () => {
  const { srv, base } = await serve((req, res) => {
    if (req.url === "/a") { res.writeHead(302, { Location: "/b" }); return res.end(); }
    res.writeHead(200); res.end("zip-bytes");
  });
  try {
    assert.strictEqual((await downloadBuffer(`${base}/a`)).toString(), "zip-bytes");
  } finally { srv.close(); }
});

test("gives up on a redirect loop", async () => {
  const { srv, base } = await serve((req, res) => { res.writeHead(302, { Location: "/a" }); res.end(); });
  try {
    await assert.rejects(downloadBuffer(`${base}/a`), /too many redirects/);
  } finally { srv.close(); }
});

test("still rejects a plain non-200", async () => {
  const { srv, base } = await serve((req, res) => { res.writeHead(404); res.end(); });
  try {
    await assert.rejects(downloadBuffer(`${base}/a`), /HTTP 404/);
  } finally { srv.close(); }
});
