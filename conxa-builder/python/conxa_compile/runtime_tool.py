"""Invoke a tool on the installed Conxa MCP runtime over stdio JSON-RPC.

Split out of conxa_runtime.py: this half spawns the runtime executable as a
subprocess and drives its stdio MCP protocol. Depends on conxa_runtime.py
for runtime-directory resolution (RuntimeToolError, _runtime_exe); nothing
in conxa_runtime.py calls back into this.
"""

from __future__ import annotations

import os
import queue
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path

from conxa_compile.conxa_runtime import RuntimeToolError, _runtime_exe

_ANSI_RE = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')


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
    # Resolve exe vs node source.
    #
    # In a dev checkout, resolve_runtime_dir() returns the repo runtime/ source tree so
    # that JS edits take effect immediately. Honour that here: when runtime_dir IS a
    # source tree, run it via `node server.js` and never fall back to a staged exe in the
    # sandbox (conxa_dir). The sandbox can hold a stale conxa-runtime.exe left by a prior
    # frozen run; preferring it would silently shadow the developer's runtime edits.
    #
    # In a frozen/customer install, runtime_dir is the deps-managed exe dir (no server.js),
    # so we resolve the staged exe — sandbox copy first, then runtime_dir.
    runtime_is_source = (runtime_dir / "server.js").is_file() and (runtime_dir / "package.json").is_file()

    exe: str | None = None
    if not runtime_is_source:
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
        # Build Studio tests the compiled pack on its deterministic merits: only the
        # zero-token Tier 1 (exception ladder) + Tier 2 (a11y / fallback) cascade. Tiers 3
        # (LLM semantic) and 4 (vision) are agent-mediated and only fire under live Claude/MCP
        # execution — there is no agent in a headless Studio run to act on a recovery request.
        # An explicit caller-supplied value (via env=) still wins.
        "CONXA_MAX_RECOVERY_TIER": (env or {}).get("CONXA_MAX_RECOVERY_TIER")
            or os.environ.get("CONXA_MAX_RECOVERY_TIER", "2"),
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
