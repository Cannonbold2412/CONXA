"""Self-check for _quiet_target_closed_exception_handler (see session.py).

TargetClosedError-named exceptions from the sync-Playwright driver's internal,
never-awaited tasks (e.g. expose_binding's result delivery racing a browser/tab
close) should be swallowed; anything else must still reach the default handler.
"""

import os

os.environ.setdefault("SKILL_GROQ_ENABLED", "true")
os.environ.setdefault("SKILL_GROQ_API_KEYS", "test-key")

from conxa_compile.recorder.session import _quiet_target_closed_exception_handler


class _FakeTargetClosedError(Exception):
    pass


_FakeTargetClosedError.__name__ = "TargetClosedError"


class _FakeLoop:
    def __init__(self):
        self.calls = []

    def default_exception_handler(self, context):
        self.calls.append(context)


def test_target_closed_error_is_swallowed():
    loop = _FakeLoop()
    _quiet_target_closed_exception_handler(loop, {"exception": _FakeTargetClosedError()})
    assert loop.calls == []


def test_other_exceptions_still_forwarded():
    loop = _FakeLoop()
    ctx = {"exception": ValueError("boom")}
    _quiet_target_closed_exception_handler(loop, ctx)
    assert loop.calls == [ctx]


def test_no_exception_key_is_forwarded():
    loop = _FakeLoop()
    ctx = {"message": "some non-exception asyncio warning"}
    _quiet_target_closed_exception_handler(loop, ctx)
    assert loop.calls == [ctx]


if __name__ == "__main__":
    test_target_closed_error_is_swallowed()
    test_other_exceptions_still_forwarded()
    test_no_exception_key_is_forwarded()
    print("OK")
