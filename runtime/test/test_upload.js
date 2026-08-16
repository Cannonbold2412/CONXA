"use strict";

// Unit tests for the upload action. Uploads are always parameterised — the compiler emits
// {"type": "upload", "value": "{{file_path}}"} and the real path arrives as a runtime input
// (see skill_package_builder_saved_skill.py::_saved_step_to_execution_step). These tests pin the
// behaviour that a path which never resolves must FAIL LOUDLY rather than skip: silently not
// uploading a document while reporting success is this action's worst failure mode.
// Disable GATE so no stability checks are simulated — mirrors test_branch.js's setup.
process.env.CONXA_GATE = "0";

const test = require("node:test");
const assert = require("node:assert");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { executeStep, interpolate, resolveUploadPaths } = require("../run");

// The handler throws before touching the page whenever the path is empty, so these cases need
// no browser and no locator mock at all. A page that throws on any access proves it.
const unusedPage = new Proxy({}, {
  get() { throw new Error("page must not be touched when the upload path is missing"); },
});

test("upload throws when the step has no value at all", async () => {
  await assert.rejects(
    () => executeStep(unusedPage, { type: "upload" }, {}),
    /no file path/,
  );
});

test("upload throws when the value is an empty string", async () => {
  await assert.rejects(
    () => executeStep(unusedPage, { type: "upload", value: "" }, {}),
    /no file path/,
  );
});

// The regression this file exists for: before the fix an unresolved {{file_path}} interpolated
// to "" and the handler returned silently, so the skill reported success having uploaded
// nothing. server.js's required-input gate should reject this first, but the handler must not
// depend on that.
test("upload throws when {{file_path}} is declared but not supplied", async () => {
  await assert.rejects(
    () => executeStep(unusedPage, { type: "upload", value: "{{file_path}}" }, {}),
    /no file path/,
  );
});

test("upload throws when file_path is supplied as whitespace-free empty value", async () => {
  await assert.rejects(
    () => executeStep(unusedPage, { type: "upload", value: "{{file_path}}" }, { file_path: "" }),
    /no file path/,
  );
});

// The value plumbing itself — that a supplied input reaches the step's path — is interpolate's
// job. Asserting it here keeps the contract pinned without mocking the whole resolver stack
// (already covered by test_resolver.js / test_resolve_adapter.js).
test("file_path input interpolates into the upload path", () => {
  assert.strictEqual(
    interpolate("{{file_path}}", { file_path: "C:/docs/kyc_document.pdf" }),
    "C:/docs/kyc_document.pdf",
  );
});

test("a hand-authored literal path is passed through unchanged", () => {
  assert.strictEqual(interpolate("C:/fixed/form.pdf", {}), "C:/fixed/form.pdf");
});

// Regression: Windows Explorer's "Copy as path" wraps any path containing spaces in double
// quotes. Before the fix, that quoted string was passed straight to setInputFiles; Node only
// recognizes a bare drive letter as absolute, so the quoted path was treated as relative and
// silently joined onto the runtime's own working directory, failing with a garbled ENOENT deep
// inside the runtime's own install path instead of a clear error about the file itself.
// `multiple` mirrors the live element's attribute, which is what the handler probes via
// locator.evaluate. undefined simulates a probe that could not run at all.
function mockUploadPage(sel, multiple = true) {
  const calls = [];
  return {
    page: {
      locator: (s) => {
        assert.strictEqual(s, sel);
        return {
          first: () => ({
            setInputFiles: async (path, opts) => { calls.push(path); },
            evaluate: async (fn) => {
              if (multiple === undefined) throw new Error("evaluate blocked");
              return fn({ multiple });
            },
          }),
        };
      },
    },
    calls,
  };
}

test("a quoted path from Windows 'Copy as path' is unwrapped before use", async () => {
  const { page, calls } = mockUploadPage("#file-upload");
  const step = {
    type: "upload",
    value: "{{file_path}}",
    _explicit_selector: "#file-upload",
  };
  const raw = 'C:\\Users\\Lenovo\\Downloads\\WhatsApp Unknown 2026-08-06\\photo.jpeg';
  await executeStep(page, step, { file_path: `"${raw}"` });
  assert.deepStrictEqual(calls, [[raw]]);
});

test("a path with incidental leading/trailing whitespace is trimmed", async () => {
  const { page, calls } = mockUploadPage("#file-upload");
  const step = { type: "upload", value: "{{file_path}}", _explicit_selector: "#file-upload" };
  await executeStep(page, step, { file_path: "  C:/docs/kyc.pdf  " });
  assert.deepStrictEqual(calls, [["C:/docs/kyc.pdf"]]);
});

test("an unmatched leading quote (no trailing quote) is left alone rather than mangled", async () => {
  const { page, calls } = mockUploadPage("#file-upload");
  const step = { type: "upload", value: "{{file_path}}", _explicit_selector: "#file-upload" };
  await executeStep(page, step, { file_path: '"C:/docs/kyc.pdf' });
  assert.deepStrictEqual(calls, [['"C:/docs/kyc.pdf']]);
});

// EXEC-15: a batch upload is expressed as one folder path, not N file paths — that is what
// lets an agent move 20 or 200 documents without enumerating every one of them in the
// conversation. Before this, only the first file of a recorded multi-select ever uploaded.
function makeTempDir(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conxa-upload-test-"));
  for (const name of names) fs.writeFileSync(path.join(dir, name), "x");
  return dir;
}

test("a folder path expands to every file inside it", async () => {
  const dir = makeTempDir(["b.pdf", "a.pdf", "c.pdf"]);
  try {
    const { page, calls } = mockUploadPage("#file-upload");
    const step = { type: "upload", value: "{{file_path}}", _explicit_selector: "#file-upload" };
    await executeStep(page, step, { file_path: dir });
    assert.deepStrictEqual(calls, [[
      path.join(dir, "a.pdf"),
      path.join(dir, "b.pdf"),
      path.join(dir, "c.pdf"),
    ]]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Order is part of the outcome for a batch: invoice-2 must not land after invoice-10 just
// because "1" sorts before "2" by codepoint.
test("folder expansion sorts numerically, not by raw codepoint", () => {
  const dir = makeTempDir(["invoice-10.pdf", "invoice-2.pdf", "invoice-1.pdf"]);
  try {
    assert.deepStrictEqual(
      resolveUploadPaths(dir).map(p => path.basename(p)),
      ["invoice-1.pdf", "invoice-2.pdf", "invoice-10.pdf"],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("subdirectories inside an upload folder are not passed as files", () => {
  const dir = makeTempDir(["real.pdf"]);
  try {
    fs.mkdirSync(path.join(dir, "nested"));
    fs.writeFileSync(path.join(dir, "nested", "deep.pdf"), "x");
    assert.deepStrictEqual(resolveUploadPaths(dir), [path.join(dir, "real.pdf")]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Same reasoning as the empty-path throws above: uploading nothing while reporting success is
// this action's worst failure mode, and an empty folder is the batch-shaped way to hit it.
test("an empty folder throws rather than uploading nothing", () => {
  const dir = makeTempDir([]);
  try {
    assert.throws(() => resolveUploadPaths(dir), /no files in it/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a single existing file still resolves to exactly that one file", () => {
  const dir = makeTempDir(["only.pdf"]);
  try {
    const file = path.join(dir, "only.pdf");
    assert.deepStrictEqual(resolveUploadPaths(file), [file]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Whether a control takes one file or many belongs to the live page, not to the recording —
// so the handler asks the element. A folder aimed at a single-file input must be refused with
// a message that says what to do instead, not with Playwright's internal wording, and must not
// reach the recovery cascade (nothing about re-finding the element fixes wrong input).
test("a folder given to a single-file upload control is refused by name", async () => {
  const dir = makeTempDir(["a.pdf", "b.pdf"]);
  try {
    const { page, calls } = mockUploadPage("#file-upload", false);
    const step = { type: "upload", value: "{{file_path}}", _explicit_selector: "#file-upload" };
    await assert.rejects(
      () => executeStep(page, step, { file_path: dir }),
      (err) => {
        assert.match(err.message, /accepts only one file, but 2 files were given/);
        assert.strictEqual(err.badInput, true, "must be flagged so runPlan skips recovery");
        return true;
      },
    );
    assert.deepStrictEqual(calls, [], "nothing may be uploaded when the input is refused");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a single file is never probed for multiple — one file always fits", async () => {
  const dir = makeTempDir(["only.pdf"]);
  try {
    const file = path.join(dir, "only.pdf");
    const { page, calls } = mockUploadPage("#file-upload", false);
    const step = { type: "upload", value: "{{file_path}}", _explicit_selector: "#file-upload" };
    await executeStep(page, step, { file_path: file });
    assert.deepStrictEqual(calls, [[file]]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A probe that cannot run (detached node, cross-origin, evaluate blocked) must not block an
// upload that would otherwise have worked — setInputFiles gets to have its own say.
test("an unreadable multiple probe stays permissive rather than refusing", async () => {
  const dir = makeTempDir(["a.pdf", "b.pdf"]);
  try {
    const { page, calls } = mockUploadPage("#file-upload", undefined);
    const step = { type: "upload", value: "{{file_path}}", _explicit_selector: "#file-upload" };
    await executeStep(page, step, { file_path: dir });
    assert.deepStrictEqual(calls, [[path.join(dir, "a.pdf"), path.join(dir, "b.pdf")]]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// build.py::_bind_downloads_to_uploads compiles a matched bulk upload's value to the literal
// string "{{downloaded_files_dir}}"; server.js sets inputs.downloaded_files_dir to this run's
// own isolated download folder before runPlan starts. A rename on either side of that contract
// breaks the handoff silently (falls through to a plain-file-not-found error deep in
// Playwright) — pin the placeholder name and the full interpolate -> resolveUploadPaths ->
// upload pipeline together so a mismatch fails loudly and close to the cause.
test("the compiled downloaded_files_dir placeholder resolves to every file this run downloaded", async () => {
  const dir = makeTempDir(["a.pdf", "b.pdf", "c.pdf"]);
  try {
    const { page, calls } = mockUploadPage("#file-upload");
    const step = { type: "upload", value: "{{downloaded_files_dir}}", _explicit_selector: "#file-upload" };
    await executeStep(page, step, { downloaded_files_dir: dir });
    assert.deepStrictEqual(calls, [[
      path.join(dir, "a.pdf"),
      path.join(dir, "b.pdf"),
      path.join(dir, "c.pdf"),
    ]]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
