"""Locate the installed Conxa shared runtime and stage skill-pack data into it."""

from __future__ import annotations

import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Callable

_ANSI_RE = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')


class RuntimeToolError(RuntimeError):
    """Raised when the local MCP runtime cannot complete a tool call."""


def _runtime_exe(path: Path) -> Path | None:
    """Return the packed runtime executable in ``path``, or None.

    Both the customer installer and the Studio deps bootstrap use ``conxa-runtime.exe``.
    """
    names = ("conxa-runtime.exe",) if sys.platform == "win32" else ("conxa-runtime-mac",)
    for name in names:
        exe = path / name
        if exe.is_file():
            return exe
    return None


def _is_runtime_dir(path: Path) -> bool:
    """A runnable runtime is either a packed exe or a server.js source tree."""
    if _runtime_exe(path) is not None:
        return True
    return (path / "server.js").is_file() and (path / "package.json").is_file()


def _bootstrap_runtime_dir() -> Path | None:
    """Locate the Studio deps-managed runtime (~/.conxa-build-studio/deps/runtime/<version>/).

    Mirrors services.bootstrap._deps_dir(); kept inline so this module stays
    dependency-free. Returns the highest-versioned dir that holds a packed exe.
    """
    base = os.environ.get("SKILL_DATA_DIR") or os.path.expanduser("~/.conxa-build-studio")
    runtime_root = Path(base) / "deps" / "conxa-runtime"
    if not runtime_root.is_dir():
        return None
    candidates = [d for d in runtime_root.iterdir() if d.is_dir() and _runtime_exe(d) is not None]
    if not candidates:
        return None
    candidates.sort(key=lambda d: d.name)
    return candidates[-1]


def _bootstrap_app_dir() -> Path | None:
    """Locate the Studio deps-managed app layer (~/.conxa-build-studio/deps/runtime_app/<version>/).

    Mirrors _bootstrap_runtime_dir(). Prefers $CONXA_APP_LOCAL_DIR (set by the deps
    bootstrap to the active version dir); otherwise returns the highest-named subdir.
    Returns None when there is no app layer (e.g. a dev checkout).
    """
    local = os.environ.get("CONXA_APP_LOCAL_DIR", "").strip()
    if local:
        p = Path(local)
        if p.is_dir():
            return p

    base = os.environ.get("SKILL_DATA_DIR") or os.path.expanduser("~/.conxa-build-studio")
    app_root = Path(base) / "deps" / "conxa-app"
    if not app_root.is_dir():
        return None
    candidates = [d for d in app_root.iterdir() if d.is_dir() and not d.name.startswith(".")]
    if not candidates:
        return None
    candidates.sort(key=lambda d: d.name)
    return candidates[-1]


def _studio_base() -> Path:
    """Root of all Build Studio user state (~/.conxa-build-studio by default)."""
    return Path(os.environ.get("SKILL_DATA_DIR") or os.path.expanduser("~/.conxa-build-studio"))


def _deps_chromium_dir() -> Path:
    """Managed Playwright browsers directory — mirrors services.bootstrap.chromium_dir()."""
    return _studio_base() / "deps" / "chromium"


def _ensure_chromium_link(link_path: Path, chromium_source: Path) -> bool:
    """Ensure link_path is a junction (Windows) or symlink (other) pointing to chromium_source.

    Returns True when the link exists and is correct or could be created, False on failure
    (caller falls back to PLAYWRIGHT_BROWSERS_PATH).  Does NOT remove a real directory
    in case it already contains a valid Chromium install.
    """
    if link_path.is_symlink():
        try:
            if Path(os.readlink(str(link_path))).resolve() == chromium_source.resolve():
                return True
        except (OSError, ValueError):
            pass
        # Wrong target — remove and recreate.
        try:
            if sys.platform == "win32":
                subprocess.run(
                    ["cmd", "/c", "rmdir", str(link_path)],
                    check=False, capture_output=True,
                )
            else:
                link_path.unlink()
        except OSError:
            return False

    if link_path.exists():
        # Real directory already present (older install or manual copy) — leave it.
        return True

    # Create junction (Windows, no admin required) or symlink (other).
    try:
        if sys.platform == "win32":
            result = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(link_path), str(chromium_source)],
                check=False, capture_output=True, text=True,
            )
            return result.returncode == 0
        else:
            os.symlink(str(chromium_source), str(link_path), target_is_directory=True)
            return True
    except Exception:
        return False


def stage_runtime_payload(
    dest: Path,
    runtime_dir: Path,
    app_dir: Path | None,
    log: Callable[[str], None] | None = None,
) -> None:
    """Copy the runtime binary + app layer into dest/, writing a combined version.json.

    Stages: conxa-runtime.exe (or -mac), keytar.node, version.json, conxa-app/.
    Used by both installer_builder (customer .exe) and ensure_test_sandbox (Studio test),
    so both are assembled by identical code and any divergence is a bug.
    """
    def _info(msg: str) -> None:
        if log:
            log(msg)

    # ── runtime binary ─────────────────────────────────────────────────────────
    exe = _runtime_exe(runtime_dir)
    if exe is None:
        raise RuntimeError(
            f"No packed runtime executable found in {runtime_dir}. "
            "Run dependency bootstrap first."
        )
    exe_name = exe.name
    _info(f"Staging {exe_name} from {exe}")
    shutil.copy2(exe, dest / exe_name)
    _info(f"{exe_name} staged ({(dest / exe_name).stat().st_size // 1024} KB)")

    # ── keytar ────────────────────────────────────────────────────────────────
    keytar = runtime_dir / "keytar.node"
    if not keytar.is_file():
        raise RuntimeError(
            f"keytar.node not found in {runtime_dir}. "
            "Run dependency bootstrap first."
        )
    shutil.copy2(keytar, dest / "keytar.node")
    _info("keytar.node staged")

    # ── version.json (records both layers so sandbox can detect updates) ──────
    (dest / "version.json").write_text(
        json.dumps({
            "runtime_version": runtime_dir.name,
            "app_version": app_dir.name if app_dir else None,
        }),
        encoding="utf-8",
    )
    _info("version.json written")

    # ── app layer ─────────────────────────────────────────────────────────────
    if app_dir and app_dir.is_dir():
        app_dest = dest / "conxa-app"
        if app_dest.exists():
            shutil.rmtree(app_dest)
        shutil.copytree(str(app_dir), str(app_dest))
        kb = sum(f.stat().st_size for f in app_dest.rglob("*") if f.is_file()) // 1024
        _info(f"conxa-app/ staged ({kb} KB, from {app_dir})")
    else:
        _info("WARNING: conxa-app not found in deps — app layer will not be pre-installed")


def resolve_test_sandbox_dir() -> Path:
    """Return the path for the Studio test sandbox (~/.conxa-build-studio/sandbox)."""
    return _studio_base() / "sandbox"


def ensure_test_sandbox(
    runtime_dir: Path,
    app_dir: Path | None,
) -> tuple[Path, Path]:
    """Assemble or refresh the customer-faithful test sandbox.

    Returns ``(conxa_dir, data_dir)`` where:
      conxa_dir = sandbox/.conxa/   mirrors the customer's ~/.conxa
      data_dir  = sandbox/data/     mirrors the customer's ~/AppData/Roaming/Conxa

    The sandbox is persistent: payload is re-staged only when runtime_version or
    app_version changes (i.e. when bootstrap.ensure_all() downloaded a new dep).
    Skill-packs are NOT staged here — callers do that via sync_skill_pack().
    """
    sandbox = resolve_test_sandbox_dir()
    conxa_dir = sandbox / ".conxa"
    data_dir = sandbox / "data"

    conxa_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "cache").mkdir(parents=True, exist_ok=True)
    (data_dir / "logs").mkdir(parents=True, exist_ok=True)

    # ── re-stage runtime payload when version changed (frozen only) ───────────
    if getattr(sys, "frozen", False):
        need_stage = True
        version_file = conxa_dir / "version.json"
        if version_file.is_file() and _runtime_exe(conxa_dir) is not None:
            try:
                meta = json.loads(version_file.read_text(encoding="utf-8"))
                if (
                    meta.get("runtime_version") == runtime_dir.name
                    and meta.get("app_version") == (app_dir.name if app_dir else None)
                ):
                    need_stage = False
            except Exception:
                pass
        if need_stage:
            stage_runtime_payload(conxa_dir, runtime_dir, app_dir)

    # ── chromium: junction/symlink → deps/chromium (no per-test copy) ────────
    chromium_source = _deps_chromium_dir()
    _ensure_chromium_link(conxa_dir / "chromium", chromium_source)

    return conxa_dir, data_dir


def resolve_runtime_dir() -> Path | None:
    """Find a runnable Conxa runtime directory (packed exe or server.js tree).

    Two environments, in priority order:
      1. $CONXA_RUNTIME_LOCAL_DIR — explicit override. Set manually in a dev checkout,
         or by the deps bootstrap (services.bootstrap) to the active version dir in prod.
      2. Dev checkout (not frozen): the repo-local runtime/ source tree, so JS edits take
         effect immediately without a binary rebuild.
      3. Production: the deps-managed runtime (~/.conxa-build-studio/deps/runtime/<version>/).

    Returns None if no valid runtime is found.
    """
    local_dir = os.environ.get("CONXA_RUNTIME_LOCAL_DIR", "").strip()
    if local_dir:
        p = Path(local_dir)
        if _is_runtime_dir(p):
            return p

    # In a dev checkout prefer the source tree so JS edits are reflected immediately.
    if not getattr(sys, "frozen", False):
        local_source = _find_local_runtime_source()
        if local_source is not None:
            return local_source

    return _bootstrap_runtime_dir()


def resolve_conxa_data_dir() -> Path:
    """Resolve CONXA_DATA_DIR (user-writable; mirrors runtime/server.js logic)."""
    env_dir = os.environ.get("CONXA_DATA_DIR", "").strip()
    if env_dir:
        return Path(env_dir)
    if sys.platform == "win32":
        return Path.home() / "AppData" / "Roaming" / "Conxa"
    return Path.home() / ".conxa"


def sync_skill_pack(
    company: str,
    source_dir: Path,
    runtime_dir: Path,
    *,
    data_dir: Path | None = None,
) -> None:
    """Copy source_dir → <runtime_dir>/skill-packs/<company>/, then bust the manifest cache.

    The runtime caches skill index in CONXA_DATA_DIR/cache/manifests.json for fast startup.
    Deleting that file forces a fresh filesystem scan so the newly synced skill is visible.

    No-op if source_dir doesn't exist.
    """
    if not source_dir.is_dir():
        return

    dest = runtime_dir / "skill-packs" / company
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copytree(str(source_dir), str(dest), dirs_exist_ok=True)

    # Bust the skill manifest cache so the spawned runtime rescans from disk
    cache_file = (data_dir or resolve_conxa_data_dir()) / "cache" / "manifests.json"
    if cache_file.is_file():
        try:
            cache_file.unlink()
        except OSError:
            pass


def _find_local_runtime_source() -> Path | None:
    """Return the repo-local runtime/ source tree when running from a dev checkout.

    The packed exe (conxa-runtime.exe) has no package.json. When a local source tree
    is found, it supplies the correct package.json so node_modules resolves Playwright 1.59.0
    (chromium-1227). Without it, the install command pins the version explicitly via npx playwright@1.59.0.
    """
    # conxa_runtime.py lives at conxa-builder/python/conxa_compile/conxa_runtime.py
    # The repo-local runtime source is three parents up, then "runtime/".
    candidate = Path(__file__).parents[3] / "runtime"
    if (candidate / "server.js").is_file() and (candidate / "package.json").is_file():
        return candidate
    return None


def _chromium_exe_in_browsers_dir(browsers_dir: Path) -> Path | None:
    """Return the Chromium executable if already installed in browsers_dir, else None.

    Playwright stores browsers as: browsers_dir/chromium-REVISION/<platform-dir>/<exe>.
    Checking for the binary directly avoids the multi-second npx startup cost on
    every test run when nothing needs to be downloaded.
    """
    if not browsers_dir.is_dir():
        return None
    if sys.platform == "win32":
        patterns = ["chromium-*/chrome-win64/chrome.exe", "chromium-*/chrome-win/chrome.exe"]
    elif sys.platform == "darwin":
        patterns = [
            "chromium-*/chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
            "chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        ]
    else:
        patterns = ["chromium-*/chrome-linux/chrome"]
    for pattern in patterns:
        hits = sorted(browsers_dir.glob(pattern), reverse=True)
        if hits:
            return hits[0]
    return None


def ensure_chromium_installed(
    browsers_dir: Path,
    runtime_dir: Path,
    log_sink=None,
) -> None:
    """Install Playwright Chromium into browsers_dir using the correct Playwright version.

    When runtime_dir is a packed-exe directory (no package.json), the install runs
    from the repo-local runtime/ source tree so that the Playwright version in
    node_modules — not the global npx — determines which chromium revision to fetch.

    Skips the npx call entirely when the Chromium binary is already present —
    this avoids the multi-second Node/npx startup overhead on every test run.
    """
    import shutil as _shutil

    browsers_dir.mkdir(parents=True, exist_ok=True)

    if _chromium_exe_in_browsers_dir(browsers_dir) is not None:
        return

    node = _shutil.which("node")
    npx = _shutil.which("npx")
    if not npx or not node:
        raise RuntimeError("Node.js / npx not found. Install Node.js to continue.")

    # Prefer the repo-local runtime/ source (correct Playwright version in node_modules)
    # over the packed-exe directory, which has no package.json and causes npx to fall
    # back to whatever Playwright version is installed globally — potentially a
    # different chromium revision than what the packed runtime expects.
    install_dir = runtime_dir
    if not (runtime_dir / "package.json").is_file():
        local_src = _find_local_runtime_source()
        if local_src is not None:
            install_dir = local_src

    # Pin the version when no package.json is available so we always get chromium-1227
    if (install_dir / "package.json").is_file():
        pw_cmd = [npx, "playwright", "install", "chromium"]
    else:
        pw_cmd = [npx, "playwright@1.59.0", "install", "chromium"]

    env = {**os.environ, "PLAYWRIGHT_BROWSERS_PATH": str(browsers_dir)}

    if log_sink:
        log_sink("Installing Playwright Chromium for the test runtime…")

    proc = subprocess.Popen(
        pw_cmd,
        cwd=str(install_dir),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        errors='replace',
    )
    assert proc.stdout is not None
    output_lines: list[str] = []
    for raw_line in proc.stdout:
        line = raw_line.strip()
        if not line:
            continue
        output_lines.append(line)
        if log_sink:
            log_sink(line)
    returncode = proc.wait()
    if returncode != 0:
        tail = "\n".join(output_lines[-10:])
        raise RuntimeError(f"Playwright install failed:\n{tail}")


def call_runtime_tool(
    runtime_dir: Path,
    tool_name: str,
    arguments: dict,
    *,
    conxa_dir: Path | None = None,
    env: dict[str, str] | None = None,
    timeout_s: int = 900,
) -> dict:
    """Call a tool on the local MCP stdio runtime and return its JSON-RPC result.

    ``conxa_dir`` is the customer-faithful sandbox directory (CONXA_DIR for the
    spawned process).  When provided, the exe is resolved from there first (frozen:
    the sandbox holds the staged copy); otherwise ``runtime_dir`` is used (dev:
    no exe, falls back to ``node server.js``).

    ``CONXA_APP_DIR`` is intentionally NOT injected: the sandbox provides
    CONXA_DIR/conxa-app, which the runtime resolves exactly as on a customer machine.
    """
    # Resolve exe: sandbox copy first (frozen), then runtime_dir source tree (dev).
    exe: str | None = None
    if conxa_dir is not None:
        _exe = _runtime_exe(conxa_dir)
        if _exe is not None:
            exe = str(_exe)
    if exe is None:
        _exe = _runtime_exe(runtime_dir)
        if _exe is not None:
            exe = str(_exe)

    if exe is not None:
        cmd: list[str] = [exe]
    else:
        node = shutil.which("node")
        if not node:
            raise RuntimeToolError("Node.js not found. Install Node.js to test workflows.")
        if not (runtime_dir / "server.js").is_file():
            raise RuntimeToolError(
                f"No runnable runtime at {runtime_dir} (neither a packed executable nor server.js)."
            )
        cmd = [node, "server.js"]

    effective_conxa_dir = conxa_dir if conxa_dir is not None else runtime_dir
    proc_env = {
        **os.environ,
        **(env or {}),
        "CONXA_DIR": str(effective_conxa_dir),
        "CONXA_SKIP_SELF_UPDATE": os.environ.get("CONXA_SKIP_SELF_UPDATE", "1"),
    }
    # CONXA_APP_DIR is NOT set: the sandbox/customer install provides conxa-app/ under
    # CONXA_DIR so the runtime resolves it via its own default logic (bootstrap.js:9).

    proc = subprocess.Popen(
        cmd,
        cwd=str(runtime_dir),
        env=proc_env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        errors='replace',
        bufsize=1,
    )

    stdout_q: queue.Queue[str | None] = queue.Queue()
    stderr_lines: list[str] = []

    def _read_stdout() -> None:
        try:
            assert proc.stdout is not None
            for line in proc.stdout:
                stdout_q.put(line)
        finally:
            stdout_q.put(None)

    def _read_stderr() -> None:
        try:
            assert proc.stderr is not None
            for line in proc.stderr:
                line = _ANSI_RE.sub('', line).strip()
                if line:
                    stderr_lines.append(line)
                    del stderr_lines[:-20]
        except Exception:
            pass

    threading.Thread(target=_read_stdout, daemon=True).start()
    stderr_thread = threading.Thread(target=_read_stderr, daemon=True)
    stderr_thread.start()

    next_id = 1

    def _send(method: str, params: dict) -> int:
        nonlocal next_id
        req_id = next_id
        next_id += 1
        if proc.stdin is None:
            raise RuntimeToolError("Runtime stdin is not available.")
        proc.stdin.write(
            json_dumps(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "method": method,
                    "params": params,
                }
            )
            + "\n"
        )
        proc.stdin.flush()
        return req_id

    def _wait_response(req_id: int, deadline: float) -> dict:
        while time.monotonic() < deadline:
            try:
                line = stdout_q.get(timeout=0.1)
            except queue.Empty:
                if proc.poll() is not None:
                    break
                continue
            if line is None:
                break
            line = line.strip()
            if not line:
                continue
            try:
                message = json_loads(line)
            except ValueError:
                continue
            if message.get("id") == req_id:
                if "error" in message:
                    err = message.get("error") or {}
                    raise RuntimeToolError(str(err.get("message") or err))
                return message
        stderr_thread.join(timeout=1.0)
        tail = "\n".join(_ANSI_RE.sub('', l) for l in stderr_lines[-5:])
        suffix = f"\nRuntime log tail:\n{tail}" if tail else ""
        raise RuntimeToolError(f"Runtime tool call timed out or exited before responding.{suffix}")

    try:
        deadline = time.monotonic() + timeout_s
        init_id = _send(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "conxa-build-studio", "version": "1.0.0"},
            },
        )
        _wait_response(init_id, deadline)

        call_id = _send(
            "tools/call",
            {"name": tool_name, "arguments": arguments},
        )
        response = _wait_response(call_id, deadline)
        return dict(response.get("result") or {})
    finally:
        try:
            if proc.stdin:
                proc.stdin.close()
        except OSError:
            pass
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


def json_dumps(value: dict) -> str:
    import json

    return json.dumps(value, ensure_ascii=True)


def json_loads(value: str) -> dict:
    import json

    parsed = json.loads(value)
    return parsed if isinstance(parsed, dict) else {}
