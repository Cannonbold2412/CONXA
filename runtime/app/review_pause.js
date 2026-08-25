"use strict";
/**
 * review_pause.js — MCP response assembly for the ai_review step type (EXEC-13).
 *
 * ai_review is a planned pause, not a failure: an author-placed reasoning checkpoint that
 * asks Claude a stored question about the live page and binds the structured answer back
 * into `inputs`. It reuses recovery's park-and-resume primitive (the same `_parks` Map, the
 * same PARK_TTL_MS/divergence check in server.js) but sits outside the Tier 1-4 recovery
 * cascade — it never touches recovery_stage.js's escalation state or retry_budget.js's
 * retry-budget map. The bounded invalid-answer retry counter below is a separate, small
 * piece of state for exactly that reason (CLAUDE.md Key Invariants: ai_review is an
 * author-placed checkpoint, not a recovery fallback, and must not borrow recovery's budget).
 */
const fs = require("fs");
const path = require("path");

const REVIEW_RETRY_MAX = 2;
const _reviewRetries = new Map(); // `${slug}:${stepIndex}` -> attempts

function checkReviewRetry(slug, stepIndex) {
  const key = `${slug}:${stepIndex}`;
  const attempts = (_reviewRetries.get(key) || 0) + 1;
  _reviewRetries.set(key, attempts);
  return attempts <= REVIEW_RETRY_MAX;
}

function clearReviewRetry(slug, stepIndex) {
  _reviewRetries.delete(`${slug}:${stepIndex}`);
}

function _matchesType(value, type) {
  switch (type) {
    case "string":  return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "number":  return typeof value === "number" && Number.isFinite(value);
    case "integer": return Number.isInteger(value);
    case "object":  return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":   return Array.isArray(value);
    default:        return true; // unknown type token — don't block on it
  }
}

// Hand-rolled structural check (required fields + type + enum) — not full JSON Schema.
// ai_review's output_schema is author-typed against the canonical "yes/no + why" shape this
// covers; a JSON Schema library would be new weight in every customer's runtime bundle for
// validation nobody asked to fail on nested $refs or string formats.
function validateReviewAnswer(answer, outputSchema) {
  if (!outputSchema || typeof outputSchema !== "object") return { valid: true, errors: [] };
  if (answer === null || typeof answer !== "object" || Array.isArray(answer)) {
    return { valid: false, errors: ["answer must be a JSON object"] };
  }
  const errors = [];
  const required = Array.isArray(outputSchema.required) ? outputSchema.required : [];
  for (const key of required) {
    if (!(key in answer)) errors.push(`missing required field "${key}"`);
  }
  const properties = outputSchema.properties && typeof outputSchema.properties === "object" ? outputSchema.properties : {};
  for (const [key, spec] of Object.entries(properties)) {
    if (!(key in answer)) continue;
    const value = answer[key];
    if (spec && spec.type && !_matchesType(value, spec.type)) {
      errors.push(`field "${key}" must be of type ${spec.type}`);
      continue;
    }
    if (spec && Array.isArray(spec.enum) && !spec.enum.includes(value)) {
      errors.push(`field "${key}" must be one of ${JSON.stringify(spec.enum)}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// Mirrors failure_response.js's Tier 4 visual-reference lookup (visuals/Image_<n>.*) — ai_review
// reuses the exact same asset-bundling convention for its reference screenshot (see
// _saved_step_visual_ref in skill_package_builder_saved_skill.py), just addressed by the
// explicit relative ref the compiler wrote onto the step instead of a step-number guess.
function _loadReferenceScreenshot(skillDir, referenceScreenshotRef) {
  if (!skillDir || !referenceScreenshotRef) return null;
  const candidate = path.join(skillDir, referenceScreenshotRef);
  if (!fs.existsSync(candidate)) return null;
  const ext = path.extname(candidate).toLowerCase();
  return {
    data: fs.readFileSync(candidate).toString("base64"),
    mimeType: ext === ".png" ? "image/png" : "image/jpeg",
  };
}

// Builds the MCP response for a planned ai_review pause. Mirrors buildFailureResponse's Tier 4
// shape (text + reference image + current screenshot) but describes a QUESTION, not a failure,
// and never touches recovery_stage.js's escalation/stagnation state or its candidate digest.
// `step` is the flat, `type`-keyed execution.json shape run.js/HANDLERS consume (prompt,
// output_schema, reference_screenshot_ref, on_failure, default_value, output_name all live at
// the top level — only the editor's pre-compile DTO nests these under an `action` dict).
// `opts.validationErrors`, when present, means this is a bounded re-ask after an invalid answer.
async function buildReviewRequest(page, step, stepIndex, resolvedEntry, opts = {}) {
  const prompt = (step && step.prompt) || "";
  const outputSchema = (step && step.output_schema) || null;
  const referenceScreenshotRef = (step && step.reference_screenshot_ref) || null;
  const url = (() => { try { return page.url(); } catch (_) { return ""; } })();

  const stepNo = stepIndex + 1;
  const retryNote = opts.validationErrors && opts.validationErrors.length
    ? `\n\nYour previous answer did not match the required output — fix these and answer again:\n` +
      opts.validationErrors.map((e) => `- ${e}`).join("\n")
    : "";
  const driftNote = opts.pageDrifted
    ? `\n\nNote: the page changed while this was pending, so this is a fresh look at its current state.`
    : "";
  const schemaNote = outputSchema
    ? `\n\nYour answer must be a JSON object matching this schema:\n${JSON.stringify(outputSchema)}`
    : "";

  const header =
    `Execution paused at step ${stepNo} for an AI review checkpoint.\n` +
    `Page URL: ${url}\n\n` +
    `The workflow's author placed a reasoning checkpoint here — this is not a failure. Look at ` +
    `the current page below and answer the question, then resume by calling execute_skill again ` +
    `with:\n` +
    `  resume_from: ${stepIndex}\n` +
    `  review_results: { "${stepIndex}": <your answer object> }\n\n` +
    `Question: ${prompt}${schemaNote}${retryNote}${driftNote}`;

  const content = [{ type: "text", text: header }];

  const reference = _loadReferenceScreenshot(resolvedEntry && resolvedEntry.skillDir, referenceScreenshotRef);
  if (reference) {
    content.push(
      { type: "text", text: "Reference image (what this looked like when the workflow was recorded):" },
      { type: "image", data: reference.data, mimeType: reference.mimeType }
    );
  }

  // P7: JPEG over lossless PNG — 3-8x smaller, same token cost either way (dimension-based).
  const currentShot = await page.screenshot({ type: "jpeg", quality: 80 }).catch(() => null);
  if (currentShot) {
    content.push(
      { type: "text", text: "Current page:" },
      { type: "image", data: currentShot.toString("base64"), mimeType: "image/jpeg" }
    );
  }

  return { content };
}

module.exports = {
  REVIEW_RETRY_MAX,
  checkReviewRetry,
  clearReviewRetry,
  validateReviewAnswer,
  buildReviewRequest,
};
