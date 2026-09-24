"use strict";
/**
 * Local chat-session store — thin wrapper over the ported opencode storage
 * service (../vendor/opencode/storage/storage.js). Two keys per session,
 * matching opencode's convention: session/<id>.json (metadata) and
 * message/<id>.json (the flat messages array run_turn.js reads/returns).
 *
 * Works in every mode, including BYOK — this is local-only persistence and
 * never calls the backend. (Signing in to CONXA is required to reach any
 * mode including BYOK, but BYOK's chat requests still go straight from this
 * device to your own model endpoint, never through conxa-execute's backend.)
 * Top-up/Subscription/workspace-pool modes additionally push each session to
 * the backend session API (see execute_client.js) for cross-device sync;
 * this store stays the source of truth for local reads.
 */
const crypto = require("crypto");
const storage = require("../vendor/opencode/storage/storage");

async function listSessions() {
  const keys = await storage.list(["session"]);
  const sessions = await Promise.all(keys.map((k) => storage.read(k)));
  return sessions.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

async function createSession() {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record = { id, title: "New chat", createdAt: now, updatedAt: now };
  await storage.write(["session", id], record);
  await storage.write(["message", id], []);
  return record;
}

async function loadSession(id) {
  const record = await storage.read(["session", id]);
  let messages = [];
  try {
    messages = await storage.read(["message", id]);
  } catch (e) {
    if (!(e instanceof storage.NotFoundError)) throw e;
  }
  return { ...record, messages };
}

async function saveSessionMessages(id, messages) {
  await storage.write(["message", id], messages);
  await storage.update(["session", id], (draft) => {
    draft.updatedAt = new Date().toISOString();
    if (draft.title === "New chat") {
      const first = messages.find((m) => m.role === "user");
      const text = first && (typeof first.content === "string"
        ? first.content
        : (first.content || []).map((p) => p.text || "").join(" "));
      const title = String(text || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (title) draft.title = title;
    }
  });
}

async function deleteSession(id) {
  await storage.remove(["session", id]);
  await storage.remove(["message", id]);
}

module.exports = { listSessions, createSession, loadSession, saveSessionMessages, deleteSession };
