"""Execute's dedicated LLM deployment: proxy routing, router isolation, multimodal model choice."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from conxa_core.config import settings
from conxa_core.llm.client import _copilot_modality
from app.api import llm_proxy_routes
from app.llm.router import LLMRouter, PoolEntry
from app.main import app

client = TestClient(app)
EXEC_HEADER = {"X-Conxa-Client": "conxa-execute"}
IMG_MSG = [{"role": "user", "content": [
    {"type": "text", "text": "what is this"},
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}},
]}]


@pytest.fixture(autouse=True)
def _cfg(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    for f in ("compile", "human_edit", "distribution", "machines"):
        monkeypatch.setattr(settings, f"entitlements_enforce_{f}", False)


class Spy:
    def __init__(self):
        self.calls = []

    def route_text(self, task, payload, timeout_ms, *, error_detail=None, pool=None):
        self.calls.append(("text", pool))
        return {"text": "ok"}

    def route_vision(self, task, payload, timeout_ms, *, error_detail=None, pool=None):
        self.calls.append(("vision", pool))
        return {"text": "ok"}


def _post(spy, monkeypatch, messages, usage_class="execute_chat", header=EXEC_HEADER):
    monkeypatch.setattr(llm_proxy_routes, "get_router", lambda: spy)
    return client.post(
        "/api/v1/llm/proxy/text",
        json={"task": "execute_chat", "payload": {"messages": messages}, "usage_class": usage_class},
        headers=header,
    )


def test_execute_chat_always_multimodal_path_when_configured(monkeypatch):
    monkeypatch.setattr(type(settings), "has_execute_llm", property(lambda self: True))
    spy = Spy()
    assert _post(spy, monkeypatch, IMG_MSG).status_code == 200
    assert _post(spy, monkeypatch, [{"role": "user", "content": "hi"}]).status_code == 200
    assert spy.calls == [("vision", "execute")] * 2


def test_execute_chat_unconfigured_keeps_shared_pool(monkeypatch):
    monkeypatch.setattr(type(settings), "has_execute_llm", property(lambda self: False))
    spy = Spy()
    assert _post(spy, monkeypatch, IMG_MSG).status_code == 200
    assert len(spy.calls) == 1 and spy.calls[0][0] == "text" and spy.calls[0][1] != "execute"


def test_modality_execute_chat_always_multimodal():
    assert _copilot_modality("execute_chat", {"messages": IMG_MSG}) == "multimodal"
    assert _copilot_modality("execute_chat", {"messages": [{"role": "user", "content": "hi"}]}) == "multimodal"


def _router_with(*pools):
    r = LLMRouter.__new__(LLMRouter)
    import threading
    r._lru_lock = threading.Lock()
    r._last_lru_index = 0
    r.pool = [
        PoolEntry(provider=p, endpoint="https://x/v1", api_key="k", text_model="t", vision_model="v", pool=p)
        for p in pools
    ]
    return r


def test_router_never_hands_execute_entry_to_other_pools():
    r = _router_with("execute", "free")
    for _ in range(4):
        assert r._next_available_entry(pool=None).pool == "free"
        assert r._next_available_entry(pool="free").pool == "free"
        assert r._next_available_entry(pool="execute").pool == "execute"


def test_router_execute_pool_does_not_fall_back(monkeypatch):
    r = _router_with("free")  # no execute entries
    r.max_retries, r.wait_ceiling_secs, r.total_budget_secs = 2, 0, 5
    detail: list[str] = []
    assert r.route_text("execute_chat", {"messages": []}, 1000, error_detail=detail, pool="execute") is None
    assert "all providers cooled or exhausted" in detail[-1]
