"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { classifyRunResult, extractRunId } = require("../classify");
const { CHAT_TOOLS } = require("../chat_tools");

describe("classifyRunResult", () => {
  it("marks Done. as completed", () => {
    assert.equal(classifyRunResult("Done. (run_id: abc)"), "completed");
  });
  it("marks cap refusal as busy", () => {
    assert.equal(classifyRunResult("Too many workflows are already running"), "busy");
  });
  it("marks anything else failed", () => {
    assert.equal(classifyRunResult("Skill not found"), "failed");
  });
  it("extracts run_id", () => {
    assert.equal(extractRunId("Done. (run_id: run_9)"), "run_9");
  });
});

describe("chat tool lock", () => {
  it("only allows the three Conxa MCP tools", () => {
    assert.deepEqual([...CHAT_TOOLS].sort(), ["execute_skill", "get_skill_inputs", "list_skills"]);
    assert.equal(CHAT_TOOLS.has("bash"), false);
    assert.equal(CHAT_TOOLS.has("write"), false);
  });
});
