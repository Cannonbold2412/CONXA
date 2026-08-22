"use strict";
// Upload/download path handling, extracted verbatim from run.js.
const fs   = require("fs");
const path = require("path");

// Mirrors conxa_compile/compiler/upload_binding.py's _RUNTIME_ONLY_PLACEHOLDER_RE — the names the
// compiler binds an upload step to when it matched a same-run download, never declared as a real
// skill input (see filter_runtime_only_inputs). Used only to tell a genuinely-missing declared
// input apart from a download that never produced a file — see the `upload` handler in handlers.js.
const DOWNLOAD_ONLY_PLACEHOLDER_RE = /^\{\{\s*(downloaded_file(_\d+)?(_dir)?|downloaded_files_dir)\s*\}\}$/;

// Extract a zip into a sibling folder inside the same run's workspace — still covered by
// sweepOldRuns, no separate cleanup needed. Idempotent so a retried step or a second
// reference to the same zip doesn't re-extract; uniqueDownloadName (EXEC-11) already
// guarantees the zip's own filename is unique within the run's folder, so the derived
// extraction folder name is unique too.
function extractZipOnce(zipPath) {
  const dest = path.join(path.dirname(zipPath), path.basename(zipPath, path.extname(zipPath)));
  if (!fs.existsSync(dest)) {
    const AdmZip = require("./host_bridge").hostRequire("adm-zip");
    new AdmZip(zipPath).extractAllTo(dest, true);
    // An empty zip leaves nothing on disk to extract — create the (empty) folder anyway so
    // the empty-folder check a few lines below in resolveUploadPaths can fire its own clear
    // error instead of readdirSync throwing ENOENT here.
    fs.mkdirSync(dest, { recursive: true });
  }
  // A zip that just wraps one top-level folder (the common case when a tool zips a
  // directory) — descend into it once so the folder-expansion step below sees files,
  // not one subdirectory it would otherwise skip (folder expansion is non-recursive).
  const entries = fs.readdirSync(dest, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    return path.join(dest, entries[0].name);
  }
  return dest;
}

function resolveUploadPaths(rawValue) {
  let target = String(rawValue ?? "").trim();
  // Windows Explorer's "Copy as path" wraps any path containing spaces in double quotes.
  if (target.length >= 2 && target.startsWith('"') && target.endsWith('"')) {
    target = target.slice(1, -1).trim();
  }
  if (!target) {
    throw new Error("upload step has no file path — supply the skill's file_path input");
  }

  if (target.startsWith("[")) {
    try {
      const parsed = JSON.parse(target);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
        const paths = parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
        if (!paths.length) {
          throw new Error("upload step has no file path — supply the skill's file_path input");
        }
        return paths;
      }
    } catch {
      // Not a JSON path list — fall through to single-path handling.
    }
  }

  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    // Let setInputFiles raise its own not-found error for a plain file path — it names the
    // path and is already clear. Only a directory needs the expansion below.
    return [target];
  }
  // A folder means every file directly inside it; the agent picks either the recording (the
  // zip itself, or specific files already extracted from it), never silently
  // substitute one for the other. Extraction now happens eagerly at download time (server.js's
  // download listener calls extractZipOnce right after saveAs), so an upload step bound to the
  // extracted contents already points at that sibling folder, not at the zip's own path — see
  // conxa_compile/compiler/upload_binding.py's binding rules (moved out of
  // skill_package_builder_saved_skill.py::_bind_downloads_to_uploads, now a 3-line delegate).
  if (!stat.isDirectory()) return [target];

  const files = fs.readdirSync(target, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map(name => path.join(target, name));
  // Same reasoning as the empty-value throw above: an empty folder must fail loudly, not
  // upload nothing and report success.
  if (!files.length) {
    throw new Error(`upload folder has no files in it: ${target}`);
  }
  return files;
}

// Two downloads in one run can suggest the same filename (`invoice.pdf` from a per-record
// export), and saving both to one path silently loses the first (EXEC-11). Reserve a distinct
// name in `taken` — callers must do this synchronously, before any await, so concurrent
// download events can't both claim the same one.
function uniqueDownloadName(fname, taken) {
  const ext  = path.extname(fname);
  const base = path.basename(fname, ext);
  let candidate = fname;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base} (${n})${ext}`;
  taken.add(candidate);
  return candidate;
}

module.exports = { DOWNLOAD_ONLY_PLACEHOLDER_RE, extractZipOnce, resolveUploadPaths, uniqueDownloadName };
