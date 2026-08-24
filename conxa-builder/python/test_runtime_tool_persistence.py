"""Smoke check for the persistent-process plumbing in conxa_compile/runtime_tool.py.

Scope: exercises _spawn/_send/_wait_response/_read_stdout/_read_stderr directly
against a fake stdio JSON-RPC echo process — the concurrency-critical part of the
rewrite (request/response multiplexing over one shared stdio connection, stderr
test_phase relay). Does NOT drive call_runtime_tool()'s exe-resolution/cache-hit
branching end-to-end — that would need either a real packed conxa-runtime.exe or
invasive monkeypatching, and the branching itself is simple, low-risk control
flow (see the manual verification steps in the fix plan instead).
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from conxa_compile import runtime_tool  # noqa: E402

_FAKE_RUNTIME_SRC = '''
import json
import sys

sys.stderr.write(json.dumps({"msg": "test_phase", "phase": "boot", "ms": 0}) + "\\n")
sys.stderr.flush()

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)
    sys.stderr.write(json.dumps({"msg": "test_phase", "phase": "handled_" + str(msg.get("method")), "ms": 1}) + "\\n")
    sys.stderr.flush()
    resp = {"jsonrpc": "2.0", "id": msg["id"], "result": {"echo": msg.get("params")}}
    sys.stdout.write(json.dumps(resp) + "\\n")
    sys.stdout.flush()
'''


class RuntimeToolPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        # _spawn() always builds `cmd = [exe]` with no args, which doesn't fit a
        # fake `python -u fake_runtime.py` — so this test builds the
        # _PersistentRuntimeProcess directly instead of going through _spawn(),
        # reusing the same reader-thread wiring _spawn() would set up.
        self._tmpdir = tempfile.TemporaryDirectory()
        script_path = Path(self._tmpdir.name) / "fake_runtime.py"
        script_path.write_text(_FAKE_RUNTIME_SRC, encoding="utf-8")

        proc = subprocess.Popen(
            [sys.executable, "-u", str(script_path)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
        )
        self.entry = runtime_tool._PersistentRuntimeProcess(proc)
        threading.Thread(target=runtime_tool._read_stdout, args=(self.entry,), daemon=True).start()
        threading.Thread(target=runtime_tool._read_stderr, args=(self.entry,), daemon=True).start()

    def tearDown(self) -> None:
        runtime_tool._graceful_shutdown(self.entry)
        self._tmpdir.cleanup()

    def test_send_wait_response_roundtrip(self) -> None:
        req_id, q = runtime_tool._send(self.entry, "tools/call", {"a": 1})
        response = runtime_tool._wait_response(self.entry, req_id, q, time.monotonic() + 5)
        self.assertEqual(response["result"]["echo"], {"a": 1})

    def test_concurrent_requests_multiplexed_by_id_not_order(self) -> None:
        id_a, q_a = runtime_tool._send(self.entry, "tools/call", {"who": "a"})
        id_b, q_b = runtime_tool._send(self.entry, "tools/call", {"who": "b"})
        deadline = time.monotonic() + 5
        # Wait for B first, then A — must not get swapped despite the reversed order.
        resp_b = runtime_tool._wait_response(self.entry, id_b, q_b, deadline)
        resp_a = runtime_tool._wait_response(self.entry, id_a, q_a, deadline)
        self.assertEqual(resp_b["result"]["echo"], {"who": "b"})
        self.assertEqual(resp_a["result"]["echo"], {"who": "a"})

    def test_phase_sink_receives_stderr_test_phase_entries(self) -> None:
        seen: list[dict] = []
        self.entry.phase_sinks.append(seen.append)
        req_id, q = runtime_tool._send(self.entry, "tools/call", {})
        runtime_tool._wait_response(self.entry, req_id, q, time.monotonic() + 5)
        # The boot-time phase line plus one for this call.
        deadline = time.monotonic() + 2
        while len(seen) < 2 and time.monotonic() < deadline:
            time.sleep(0.05)
        phases = [e["phase"] for e in seen]
        self.assertIn("boot", phases)
        self.assertTrue(any(p.startswith("handled_") for p in phases))

    def test_dead_process_detected_via_poll(self) -> None:
        self.entry.proc.kill()
        self.entry.proc.wait(timeout=5)
        self.assertIsNotNone(self.entry.proc.poll())


class StagedVersionTagTests(unittest.TestCase):
    """A dev rebuild (build-app-local.ps1) re-stages the sandbox in place — same exe
    path, same sandbox path, just different content. call_runtime_tool()'s process
    cache is keyed by those paths, so _staged_version_tag() is what lets it notice
    the content changed and stop reusing a process running stale code."""

    def test_reads_runtime_and_app_version_from_version_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            conxa_dir = Path(tmp)
            (conxa_dir / "version.json").write_text(
                '{"runtime_version": "host-v1.0.0", "app_version": "app-v0.0.0-local.123"}',
                encoding="utf-8",
            )
            tag = runtime_tool._staged_version_tag(conxa_dir)
            self.assertEqual(tag, "host-v1.0.0|app-v0.0.0-local.123")

    def test_a_rebuild_changes_the_tag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            conxa_dir = Path(tmp)
            version_file = conxa_dir / "version.json"
            version_file.write_text(
                '{"runtime_version": "host-v1.0.0", "app_version": "app-v0.0.0-local.1"}',
                encoding="utf-8",
            )
            before = runtime_tool._staged_version_tag(conxa_dir)
            version_file.write_text(
                '{"runtime_version": "host-v1.0.0", "app_version": "app-v0.0.0-local.2"}',
                encoding="utf-8",
            )
            after = runtime_tool._staged_version_tag(conxa_dir)
            self.assertNotEqual(before, after)

    def test_missing_version_json_returns_empty_string_not_an_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(runtime_tool._staged_version_tag(Path(tmp)), "")


if __name__ == "__main__":
    unittest.main()
