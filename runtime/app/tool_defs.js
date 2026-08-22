"use strict";
/**
 * tool_defs.js — static MCP core-tool definitions, extracted verbatim from
 * server.js. Pure data: no imports, no state. Skill-specific tools (one per
 * installed skill) are generated at runtime in server.js from the loaded
 * skill index and appended after these.
 */
const CORE_TOOL_DEFS = [
  {
    name: "list_skills",
    description: "Conxa automation: list all installed workflow skills. ALWAYS call this first when the user mentions Conxa or wants to automate any task on a web app (Render, GitHub, Jira, Stripe, etc.). Returns available workspaces and skill slugs so you can match the user's intent to the right skill.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: { type: "string", description: "Filter to a specific workspace (optional)" },
      },
      required: [],
    },
  },
  {
    name: "execute_skill",
    description: "Conxa automation: execute a recorded browser workflow skill. Call list_skills first to get the skill slug, then get_skill_inputs to see required fields, then call this. Default watch: true (visible browser). Pass watch: false only if user explicitly asks for background execution.",
    inputSchema: {
      type: "object",
      properties: {
        skill:       { type: "string",  description: "Skill slug from list_skills" },
        workspace_id:     { type: "string",  description: "Workspace ID (required if skill slug is not unique)" },
        inputs:      { type: "object",  description: "Input values. Call get_skill_inputs first to see the schema." },
        resume_from: { type: "integer", description: "0-based step index to resume from after a failure (the value reported in the failure response)." },
        step_overrides: {
          type: "object",
          description: "Tier 3/4 self-healing: map of \"<step index>\" → { \"selector\": \"<Playwright selector>\" }. When a step fails, the runtime returns the failed step's intent, a live DOM inventory, and a screenshot; identify the correct element and pass its selector here keyed by the same index as resume_from. Prefer [data-testid=\"…\"], then #id, then internal:role=<role>[name=\"…\"], then text=\"…\". Example: { \"7\": { \"selector\": \"[data-testid='submit-btn']\" } }.",
        },
        watch:       { type: "boolean", description: "true = open a visible browser so the user can watch; false = run headlessly in the background." },
      },
      required: ["skill"],
    },
  },
  {
    name: "execute_sequence",
    description: "Conxa automation: execute an ordered list of workflow skills in one shared browser session. Use when the user wants to run multiple skills back-to-back. Default watch: true (visible browser).",
    inputSchema: {
      type: "object",
      properties: {
        skills: {
          type: "array",
          items: {
            type: "object",
            properties: {
              skill:   { type: "string" },
              workspace_id: { type: "string" },
              inputs:  { type: "object" },
              resume_from:    { type: "integer", description: "0-based step index to resume from after a failure." },
              step_overrides: { type: "object", description: "Tier 3/4 self-healing selector overrides, keyed by step index (see execute_skill)." },
            },
            required: ["skill"],
          },
        },
        watch: { type: "boolean", description: "true = visible browser; false = headless." },
      },
      required: ["skills"],
    },
  },
  {
    name: "get_skill_inputs",
    description: "Conxa automation: return the required input fields for a skill. Always call this after list_skills and before execute_skill so you know exactly what to ask the user for.",
    inputSchema: {
      type: "object",
      properties: {
        skill:   { type: "string" },
        workspace_id: { type: "string" },
      },
      required: ["skill"],
    },
  },
  {
    name: "cancel_execution",
    description: "Conxa automation: cancel the currently running skill execution. Safe to call at any time.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_runtime_status",
    description: "Conxa automation: return the installed runtime version, Chromium revision, and skill pack versions. Use for diagnostics or to verify the runtime is up to date.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

module.exports = { CORE_TOOL_DEFS };
