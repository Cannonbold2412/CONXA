"use strict";

// A downloaded zip is now extracted eagerly at download time (server.js calls extractZipOnce
// right after saveAs — see run.js's download_observed handler), not lazily when an upload step
// happens to resolve to a .zip path. resolveUploadPaths therefore no longer special-cases a
// .zip target at all: replay must upload exactly what was recorded — the zip itself, or specific
// files already extracted from it — never silently substitute one for the other.
process.env.CONXA_GATE = "0";
// download_observed races the queued save against this timeout; a real download here always
// wins instantly, but the losing timer would otherwise keep the process alive for the full
// 120s default — trim it so this file doesn't hang node --test.
process.env.CONXA_DOWNLOAD_WAIT_MS = "200";

const test = require("node:test");
const assert = require("node:assert");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const AdmZip = require("adm-zip");

const { resolveUploadPaths, extractZipOnce, executeStep } = require("../run");

function makeZip(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-zip-src-"));
  const zip = new AdmZip();
  for (const [name, content] of entries) {
    zip.addFile(name, Buffer.from(content));
  }
  const zipPath = path.join(dir, "archive.zip");
  zip.writeZip(zipPath);
  return zipPath;
}

test("resolveUploadPaths expands a JSON array of explicit file paths", () => {
  const paths = resolveUploadPaths(
    JSON.stringify(["C:/tmp/a.pdf", "C:/tmp/b.pdf"])
  );
  assert.deepStrictEqual(paths, ["C:/tmp/a.pdf", "C:/tmp/b.pdf"]);
});

test("resolveUploadPaths uploads a .zip target verbatim — no auto-extraction", () => {
  const zipPath = makeZip([["a.pdf", "1"], ["b.pdf", "2"]]);
  try {
    assert.deepStrictEqual(resolveUploadPaths(zipPath), [zipPath]);
  } finally {
    fs.rmSync(path.dirname(zipPath), { recursive: true, force: true });
  }
});

test("extractZipOnce extracts a zip into N separate files, naturally sorted", () => {
  const zipPath = makeZip([
    ["invoice-2.pdf", "b"],
    ["invoice-10.pdf", "c"],
    ["invoice-1.pdf", "a"],
  ]);
  try {
    const dir = extractZipOnce(zipPath);
    const files = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    assert.deepStrictEqual(files, ["invoice-1.pdf", "invoice-2.pdf", "invoice-10.pdf"]);
  } finally {
    fs.rmSync(path.dirname(zipPath), { recursive: true, force: true });
  }
});

test("extractZipOnce is idempotent — calling it twice on the same zip doesn't re-extract", () => {
  const zipPath = makeZip([["a.txt", "1"], ["b.txt", "2"]]);
  try {
    const first = extractZipOnce(zipPath);
    const second = extractZipOnce(zipPath);
    assert.strictEqual(first, second);
  } finally {
    fs.rmSync(path.dirname(zipPath), { recursive: true, force: true });
  }
});

test("extractZipOnce unwraps a single top-level wrapping folder inside the zip", () => {
  const zipPath = makeZip([
    ["report/one.csv", "1"],
    ["report/two.csv", "2"],
  ]);
  try {
    const dir = extractZipOnce(zipPath);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["one.csv", "two.csv"]);
  } finally {
    fs.rmSync(path.dirname(zipPath), { recursive: true, force: true });
  }
});

test("an empty zip extracts to an empty folder, which resolveUploadPaths still refuses", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-zip-src-"));
  const zip = new AdmZip();
  const zipPath = path.join(dir, "empty.zip");
  zip.writeZip(zipPath);
  try {
    const extracted = extractZipOnce(zipPath);
    assert.deepStrictEqual(fs.readdirSync(extracted), []);
    assert.throws(() => resolveUploadPaths(extracted), /no files in it/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// build.py::_bind_downloads_to_uploads compiles a step matched against a zip's extracted
// contents to {{downloaded_file_dir}}/{{downloaded_file_N_dir}} — the download_observed
// handler is what has to make that placeholder real at replay time, from whatever
// server.js's download listener resolved (entry.extractedDir, set only for a .zip download).
test("download_observed binds downloaded_file_dir from a zip download's extracted folder", async () => {
  const inputs = {};
  const queue = [Promise.resolve({ filename: "archive.zip", path: "/runs/r1/archive.zip", extractedDir: "/runs/r1/archive" })];
  await executeStep(null, { type: "download_observed" }, inputs, { downloadQueue: queue });
  assert.strictEqual(inputs.downloaded_file_dir, "/runs/r1/archive");
  assert.strictEqual(inputs.downloaded_file_1_dir, "/runs/r1/archive");
  assert.strictEqual(inputs.downloaded_file, "/runs/r1/archive.zip");
});

test("download_observed sets no _dir placeholder for a non-zip download", async () => {
  const inputs = {};
  const queue = [Promise.resolve({ filename: "report.pdf", path: "/runs/r1/report.pdf", extractedDir: null })];
  await executeStep(null, { type: "download_observed" }, inputs, { downloadQueue: queue });
  assert.strictEqual(inputs.downloaded_file, "/runs/r1/report.pdf");
  assert.strictEqual(inputs.downloaded_file_dir, undefined);
  assert.strictEqual(inputs.downloaded_file_1_dir, undefined);
});

test("resolveUploadPaths leaves a non-zip single file untouched", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-zip-src-"));
  const filePath = path.join(dir, "report.pdf");
  fs.writeFileSync(filePath, "not a zip");
  try {
    assert.deepStrictEqual(resolveUploadPaths(filePath), [filePath]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
