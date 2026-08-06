"use strict";

// Unit tests for the upload action. Uploads are always parameterised — the compiler emits
// {"type": "upload", "value": "{{file_path}}"} and the real path arrives as a runtime input
// (see plugin_builder_saved_skill.py::_saved_step_to_execution_step). These tests pin the
// behaviour that a path which never resolves must FAIL LOUDLY rather than skip: silently not
// uploading a document while reporting success is this action's worst failure mode.
// Disable GATE so no stability checks are simulated — mirrors test_branch.js's setup.
process.env.CONXA_GATE = "0";

const test = require("node:test");
const assert = require("node:assert");

const { executeStep, interpolate } = require("../run");

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
function mockUploadPage(sel) {
  const calls = [];
  return {
    page: {
      locator: (s) => {
        assert.strictEqual(s, sel);
        return {
          first: () => ({
            setInputFiles: async (path, opts) => { calls.push(path); },
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
  assert.deepStrictEqual(calls, [raw]);
});

test("a path with incidental leading/trailing whitespace is trimmed", async () => {
  const { page, calls } = mockUploadPage("#file-upload");
  const step = { type: "upload", value: "{{file_path}}", _explicit_selector: "#file-upload" };
  await executeStep(page, step, { file_path: "  C:/docs/kyc.pdf  " });
  assert.deepStrictEqual(calls, ["C:/docs/kyc.pdf"]);
});

test("an unmatched leading quote (no trailing quote) is left alone rather than mangled", async () => {
  const { page, calls } = mockUploadPage("#file-upload");
  const step = { type: "upload", value: "{{file_path}}", _explicit_selector: "#file-upload" };
  await executeStep(page, step, { file_path: '"C:/docs/kyc.pdf' });
  assert.deepStrictEqual(calls, ['"C:/docs/kyc.pdf']);
});
