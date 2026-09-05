"use strict";
/**
 * Local chat-session store — thin wrapper over the ported opencode storage
 * service (../vendor/opencode/storage/storage.js). Two keys per session,
 * matching opencode's convention: session/<id>.json (metadata) and
 * message/<id>.json (the flat messages array run_turn.js reads/returns).
 *
 * Works in every mode, including BYOK — this is local-only persistence with
 * no account involved. Top-up/Subscription modes additionally push each
 * session to the backend session API (see execute_client.js) for
 * cross-device sync; this store stays the source of truth for local reads.
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
  });
}

async function deleteSession(id) {
  await storage.remove(["session", id]);
  await storage.remove(["message", id]);
}

module.exports = { listSessions, createSession, loadSession, saveSessionMessages, deleteSession };
