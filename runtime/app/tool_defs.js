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
    description: "Conxa automation: execute a recorded browser workflow skill. Call list_skills first to get the skill slug, then get_skill_inputs to see required fields, then call this. Default watch: true (visible browser). Pass watch: false only if user explicitly asks for background execution. If an application needs the user to sign in, this returns immediately with \"Authentication required — please sign in to <apps>\" and a run_id: sign-in tabs open in the browser, and the workflow starts BY ITSELF once the user finishes — do not call execute_skill again. Poll get_execution_status with that run_id until state is completed or failed.",
    inputSchema: {
      type: "object",
      properties: {
        skill:       { type: "string",  description: "Skill slug from list_skills" },
        workspace_id:     { type: "string",  description: "Workspace ID (required if skill slug is not unique)" },
        inputs:      { type: "object",  description: "Input values. Call get_skill_inputs first to see the schema." },
        resume_from: { type: "integer", description: "0-based step index to resume from after a failure (the value reported in the failure response)." },
        step_overrides: {
          type: "object",
          description: "Tier 3/4 self-healing: map of \"<step index>\" → { \"candidate_index\": <n>, \"confidence\": <0-1>, \"why\": \"<one line>\" } (preferred — pick the index of the element you identified from the runtime's ranked Tier 3/4 element list) or { \"selector\": \"<Playwright selector>\" }. The runtime re-verifies every pick against a uniqueness gate before acting. Selector preference, when explicit: [data-testid=\"…\"], then #id, then internal:role=<role>[name=\"…\"], then text=\"…\". Example: { \"7\": { \"candidate_index\": 0, \"confidence\": 0.9, \"why\": \"old button renamed; ranked entry matches intent\" } }. May ALSO carry a \"dismiss\" entry when the failure response flagged an unrecognized overlay (rows tagged [overlay] in the ranked list): { \"candidate_index\": <n> } or { \"selector\": \"…\" } or { \"escape\": true }, composable with a target override in the same entry (clear the overlay, then retarget). The runtime only ever clicks a close/cancel/skip/dismiss-style control — nominating an accept/confirm/agree/submit/delete/pay/subscribe control is refused. Example: { \"7\": { \"dismiss\": { \"candidate_index\": 2 } } }.",
        },
        review_results: {
          type: "object",
          description: "AI review checkpoints: map of \"<step index>\" → your structured answer object to that step's question (see the review request's Question and, if present, its required output schema). Used together with resume_from to continue past an ai_review pause. Example: { \"5\": { \"visible\": true, \"why\": \"the Payment Successful banner is showing\" } }.",
        },
        watch:       { type: "boolean", description: "true = open a visible browser so the user can watch; false = run headlessly in the background." },
        wait_for_auth: { type: "boolean", description: "Default true: when sign-in is missing, return at once and let the run start by itself after the user signs in. false = never wait — fail immediately with the sign-in message instead, so nothing starts later behind the caller's back (used by Build Studio's Run Test)." },
        dry_run:     { type: "boolean", description: "PROD-3-DRYRUN: run every step except the final committing (irreversible) action — that step is resolved (proving its target still exists) but never clicked/submitted. Use to preview a skill with a destructive final step before actually committing it. Read-only/reversible steps still run normally." },
        _trigger:    { type: "string",  description: "Internal: set to \"scheduled\" only by the PROD-5 scheduler daemon. Do not set manually." },
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
              step_overrides: { type: "object", description: "Tier 3/4 self-healing overrides keyed by step index — prefer candidate_index nominations from the ranked element list, plus an optional \"dismiss\" entry for an unrecognized overlay (see execute_skill)." },
              review_results: { type: "object", description: "AI review checkpoint answers keyed by step index (see execute_skill)." },
              dry_run:        { type: "boolean", description: "PROD-3-DRYRUN: see execute_skill." },
            },
            required: ["skill"],
          },
        },
        watch: { type: "boolean", description: "true = visible browser; false = headless." },
        wait_for_auth: { type: "boolean", description: "Default true: when sign-in is missing, return at once and let the run start by itself after the user signs in. false = never wait — fail immediately with the sign-in message instead, so nothing starts later behind the caller's back (used by Build Studio's Run Test)." },
      },
      required: ["skills"],
    },
  },
  {
    name: "create_schedule",
    description: "Conxa automation: schedule a skill to run automatically on this machine (cron syntax, local time) — no chat app needs to be open for scheduled runs to fire. Call get_skill_inputs first so you can collect the input values from the user. Schedules are stored locally on the customer's machine only.",
    inputSchema: {
      type: "object",
      properties: {
        slug:   { type: "string",  description: "Skill slug from list_skills" },
        workspace_id: { type: "string", description: "Workspace ID (required if the skill slug is not unique)" },
        cron:   { type: "string",  description: '5-field cron expression in LOCAL time, e.g. "0 6 * * *" = every day at 06:00. Presets @hourly/@daily/@weekly also accepted.' },
        name:   { type: "string",  description: "Human-friendly name (optional)" },
        inputs: { type: "object",  description: "Input values captured from the user (stored encrypted on this machine; call get_skill_inputs first)." },
        grace_minutes: { type: "integer", description: "How long after a missed scheduled time a catch-up run is still allowed (default 60). Older missed slots are skipped, never burst-fired." },
      },
      required: ["slug", "cron"],
    },
  },
  {
    name: "list_schedules",
    description: "Conxa automation: list all scheduled skills on this machine with their next run time and last result. Input VALUES are never returned (they are stored encrypted locally).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "delete_schedule",
    description: "Conxa automation: permanently remove one scheduled skill (by id from list_schedules).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Schedule id from list_schedules" } },
      required: ["id"],
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
    description: "Conxa automation: cancel a running skill execution. Several may be running at once (e.g. one per chat) — pass run_id (from execute_skill's response or get_execution_status) to cancel a specific one. Omitting run_id only works when exactly one execution is active; with several active it returns their run_ids instead of guessing which to cancel. Safe to call at any time.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "The run to cancel (from execute_skill's response text or get_execution_status). Optional only when a single execution is active." },
      },
      required: [],
    },
  },
  {
    name: "get_execution_status",
    description: "Conxa automation: see what is running. Lists every currently running execution (there may be more than one — separate chats, or several skills started at once) with run_id, skill, step progress and elapsed time; every run waiting for the user to sign in (awaiting_auth, with each application's status: waiting / signed_in / closed / failed); and how the most recent runs ended. Pass run_id (from execute_skill's response) to check one run: state is running, awaiting_auth, completed, failed or cancelled, and a finished run carries its result in summary. Call this after execute_skill reports that sign-in is needed — the workflow starts by itself once the user has signed in.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Check one run (from execute_skill's response text). Omit to list everything." },
      },
      required: [],
    },
  },
  {
    name: "authenticate",
    description: "Conxa automation: open sign-in windows for every application in the skill's group and wait for the user to finish. Call this when execute_skill reports that sign-in is needed, or before it to check. Blocks (default 45s, up to 600s via wait_seconds) while the user signs in; if it returns status \"waiting\", call it again to keep waiting — it re-waits on the same open window rather than opening another. status \"signed_in\" means execute_skill will not hit the sign-in gate.",
    inputSchema: {
      type: "object",
      properties: {
        skill:        { type: "string", description: "The skill about to be run — resolves which workspace and group need sign-in. Preferred." },
        workspace_id: { type: "string", description: "Alternative to skill, or to disambiguate it." },
        wait_seconds: { type: "number", description: "How long to block waiting for sign-in. Default 45, max 600." },
      },
      required: [],
    },
  },
  {
    name: "get_runtime_status",
    description: "Conxa automation: return the installed runtime version, Chromium revision, and skill pack versions. Use for diagnostics or to verify the runtime is up to date.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

module.exports = { CORE_TOOL_DEFS };
