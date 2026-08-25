"use strict";
/**
 * scheduler_store.js — local schedule records for the PROD-5 standalone runner
 * (runtime/app/scheduler_daemon.js). One JSON file per schedule under
 * <CONXA_DATA_DIR>/scheduler/schedules/ — deliberately LOCAL ONLY: the Horizon-2
 * doctrine (docs/PRD.md §14.5, decided 2026-08-21) is that Conxa's cloud holds
 * neither work items nor schedules.
 *
 * `inputs` may carry sensitive values (the same fields a user would type into the
 * target app), so they are encrypted at rest with AES-256-GCM under a dedicated
 * machine key ("scheduler-v1" account of the existing conxa-session keychain
 * service) — the same scheme auth_manager.js uses for browser sessions. The
 * ciphertext payload shape matches auth_manager's {iv, tag, data} exactly, and
 * both halves are injectable for offline unit tests.
 *
 * listMeta() deliberately NEVER decrypts: it backs surfaces (MCP list_schedules,
 * tray state) that must not echo input values back into a chat transcript.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseCron } = require("./cron_lite");

const ID_RE = /^sch_[A-Za-z0-9]+$/;

function _schedulesDir(dataDir) {
  return path.join(dataDir, "scheduler", "schedules");
}

// Same payload shape as auth_manager.saveEncryptedSession — one crypto story to audit.
function _defaultEncrypt(keyHex, value) {
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: enc.toString("base64"),
  };
}

function _defaultDecrypt(keyHex, payload) {
  try {
    const key = Buffer.from(keyHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]);
    return JSON.parse(dec.toString());
  } catch (_) {
    return null; // wrong key or corruption — caller treats as "inputs unavailable"
  }
}

const ALLOWED_PATCH_FIELDS = ["name", "enabled", "catchup_grace_minutes", "cron", "last_run", "last_slot_fired", "next_run_at"];

/**
 * Fields every schedule record carries. Kept flat and JSON-only — no dates as
 * Date objects on disk, ISO strings everywhere (same convention as run_registry).
 */
function _validate(fields) {
  if (!fields.slug || typeof fields.slug !== "string") throw new Error("schedule needs a skill slug");
  parseCron(fields.cron); // throws with a clear message when unparseable
  const grace = fields.catchup_grace_minutes === undefined ? 60 : Number(fields.catchup_grace_minutes);
  if (!Number.isInteger(grace) || grace < 0) throw new Error("catchup_grace_minutes must be a non-negative integer");
  if (fields.inputs !== undefined && fields.inputs !== null && (typeof fields.inputs !== "object" || Array.isArray(fields.inputs))) {
    throw new Error("inputs must be an object");
  }
}

function createStore(opts) {
  const dataDir = opts.dataDir;
  if (!dataDir) throw new Error("scheduler_store: dataDir is required");
  const getSessionKeyFn = opts.getSessionKeyFn; // async () => hex string (keytar-backed in prod)
  if (typeof getSessionKeyFn !== "function") throw new Error("scheduler_store: getSessionKeyFn is required");
  const encryptFn = opts.encryptFn || _defaultEncrypt;
  const decryptFn = opts.decryptFn || _defaultDecrypt;
  const nowIso = opts.nowFn || (() => new Date().toISOString());
  const log = opts.log || (() => {});
  const dir = _schedulesDir(dataDir);

  let _keyCache = null;
  async function _getKey() {
    if (_keyCache) return _keyCache;
    _keyCache = await getSessionKeyFn();
    return _keyCache;
  }

  function _pathFor(id) {
    if (!ID_RE.test(String(id || ""))) throw new Error(`invalid schedule id: ${id}`);
    return path.join(dir, `${id}.json`);
  }

  function _writeAtomic(filePath, record) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
    fs.renameSync(tmp, filePath); // atomic on the same volume — never a half-written schedule
  }

  function _readFile(filePath) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
      log("warn", "schedule_read_failed", { file: path.basename(filePath), error: e.message });
      return null; // tolerate one corrupt file — never lose the rest of the store
    }
    return raw;
  }

  function listSync() {
    let names;
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
    } catch (_) {
      return []; // no schedules yet
    }
    const out = [];
    for (const name of names) {
      const rec = _readFile(path.join(dir, name));
      if (rec && rec.id) out.push(rec);
    }
    out.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
    return out;
  }

  async function create(fields) {
    const inputs = fields.inputs === undefined ? {} : fields.inputs;
    _validate({ ...fields, inputs });
    const id = `sch_${crypto.randomBytes(6).toString("hex")}`;
    const key = await _getKey();
    const record = {
      id,
      version: 1,
      name: (fields.name && String(fields.name).trim()) || `${fields.slug} @ ${String(fields.cron).trim()}`,
      slug: String(fields.slug),
      workspace_id: fields.workspace_id ? String(fields.workspace_id) : null,
      cron: String(fields.cron).trim(),
      enabled: fields.enabled === undefined ? true : !!fields.enabled,
      catchup_grace_minutes: fields.catchup_grace_minutes === undefined ? 60 : Number(fields.catchup_grace_minutes),
      inputs_enc: Object.keys(inputs).length ? encryptFn(key, inputs) : null,
      created_at: nowIso(),
      updated_at: nowIso(),
      last_slot_fired: null,
      next_run_at: null,
      last_run: null,
    };
    _writeAtomic(_pathFor(id), record);
    return record;
  }

  /** Full records INCLUDING decrypted inputs — daemon-only. Never expose over MCP. */
  async function list() {
    const key = await _getKey();
    return listSync().map((rec) => ({
      ...rec,
      inputs: rec.inputs_enc ? decryptFn(key, rec.inputs_enc) : {},
    }));
  }

  /**
   * Records WITHOUT decrypted inputs — safe for chat-facing surfaces. Carries
   * has_inputs instead of any input content.
   */
  function listMeta() {
    return listSync().map(({ inputs_enc, ...rest }) => ({ ...rest, has_inputs: !!inputs_enc }));
  }

  async function get(id) {
    const rec = _readFile(_pathFor(id));
    if (!rec) return null;
    const key = await _getKey();
    return { ...rec, inputs: rec.inputs_enc ? decryptFn(key, rec.inputs_enc) : {} };
  }

  /** Apply an allowed-field patch. `last_*`/`next_*` come from the daemon; the rest from users. */
  async function update(id, patch) {
    const filePath = _pathFor(id);
    const rec = _readFile(filePath);
    if (!rec) throw new Error(`no such schedule: ${id}`);
    for (const k of Object.keys(patch)) {
      if (!ALLOWED_PATCH_FIELDS.includes(k)) throw new Error(`field not updatable: ${k}`);
    }
    if (patch.cron !== undefined) parseCron(patch.cron);
    if (patch.catchup_grace_minutes !== undefined && (!Number.isInteger(Number(patch.catchup_grace_minutes)) || Number(patch.catchup_grace_minutes) < 0)) {
      throw new Error("catchup_grace_minutes must be a non-negative integer");
    }
    const next = { ...rec };
    for (const k of ALLOWED_PATCH_FIELDS) {
      if (patch[k] !== undefined) next[k] = patch[k];
    }
    next.updated_at = nowIso();
    _writeAtomic(filePath, next);
    return next;
  }

  function remove(id) {
    const filePath = _pathFor(id);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  return { create, list, listMeta, get, update, remove, dir };
}

module.exports = { createStore, _schedulesDir };
