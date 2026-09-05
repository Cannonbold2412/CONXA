"use strict";
/**
 * Context-overflow pruning, adapted from opencode's
 * packages/opencode/src/session/compaction.ts and overflow.ts (commit pinned
 * in ../../../NOTICE) — same constants (PRUNE_MINIMUM, PRUNE_PROTECT,
 * TOOL_OUTPUT_MAX_CHARS), same idea (protect a recent token window, truncate
 * old tool output beyond it, never touch protected tool calls).
 *
 * Adapted, not vendored verbatim: the original walks opencode's `parts`-based
 * SessionV1 message schema (text/tool/reasoning/file parts) via their
 * private Provider/ConfigV1 types. conxa-execute's messages are the flat
 * OpenAI-chat shape ({role, content, tool_calls?, tool_call_id?}) that
 * run_turn.js already produces/consumes, so this operates directly on that
 * array — there is no parts schema to re-create.
 *
 * Token counting: a plain heuristic (chars / 4), not opencode's private
 * Token.estimate.
 * ponytail: char/4 heuristic, swap for a real tokenizer if pruning
 * triggers noticeably too early or too late in practice.
 */

const PRUNE_MINIMUM = 20_000;
const PRUNE_PROTECT = 40_000;
const TOOL_OUTPUT_MAX_CHARS = 2_000;
const PRUNE_PROTECTED_TOOLS = ["execute_skill"];
const TRUNCATED_MARKER = "\n[truncated]";

function estimate(text) {
  return Math.ceil(String(text || "").length / 4);
}

function usable(contextLimit, reservedBuffer = PRUNE_PROTECT / 2) {
  return Math.max(0, contextLimit - reservedBuffer);
}

function messageTokens(message) {
  return estimate(message.content) + estimate(JSON.stringify(message.tool_calls || ""));
}

function totalTokens(messages) {
  return messages.reduce((sum, m) => sum + messageTokens(m), 0);
}

function isOverflow(messages, contextLimit) {
  if (!contextLimit) return false;
  return totalTokens(messages) >= usable(contextLimit);
}

function truncate(content) {
  const text = String(content || "");
  return text.length <= TOOL_OUTPUT_MAX_CHARS ? text : text.slice(0, TOOL_OUTPUT_MAX_CHARS) + TRUNCATED_MARKER;
}

// tool_call_id -> function name, so a tool-role message (which carries no
// name of its own in the OpenAI chat schema) can be checked against
// PRUNE_PROTECTED_TOOLS.
function toolNamesByCallId(messages) {
  const names = new Map();
  for (const m of messages) {
    for (const call of m.tool_calls || []) {
      if (call.id && call.function && call.function.name) names.set(call.id, call.function.name);
    }
  }
  return names;
}

/**
 * Prune old tool-result content once the transcript crosses PRUNE_MINIMUM
 * tokens: everything within the most recent PRUNE_PROTECT tokens (walking
 * from the end) is left untouched; older tool-result messages get truncated
 * to TOOL_OUTPUT_MAX_CHARS, except calls to PRUNE_PROTECTED_TOOLS. Returns a
 * new array — never mutates the input.
 */
function pruneIfNeeded(messages) {
  if (totalTokens(messages) < PRUNE_MINIMUM) return messages;

  const toolNames = toolNamesByCallId(messages);
  let protectedTokens = 0;
  let protectFrom = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (protectedTokens >= PRUNE_PROTECT) break;
    protectedTokens += messageTokens(messages[i]);
    protectFrom = i;
  }

  return messages.map((m, i) => {
    if (i >= protectFrom) return m;
    if (m.role !== "tool") return m;
    const toolName = toolNames.get(m.tool_call_id);
    if (toolName && PRUNE_PROTECTED_TOOLS.includes(toolName)) return m;
    const truncated = truncate(m.content);
    return truncated === m.content ? m : { ...m, content: truncated };
  });
}

module.exports = {
  PRUNE_MINIMUM,
  PRUNE_PROTECT,
  TOOL_OUTPUT_MAX_CHARS,
  PRUNE_PROTECTED_TOOLS,
  estimate,
  usable,
  totalTokens,
  isOverflow,
  pruneIfNeeded,
};
