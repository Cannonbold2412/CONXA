"""Studio-side LLM proxy client: the 502 error body's real failure reason must survive.

llm_proxy_routes.py answers `llm_all_providers_failed` with a dict `detail`
({"message": ..., "error_detail": [...]}) carrying each provider's actual failure
string (e.g. a 429 rate-limit reason). Before this test existed, LLMProxyClient._post
coerced that dict with str(...), so it never matched any of the flat entitlement
codes and the caller only ever saw "proxy HTTP 502" — indistinguishable from any
other cloud-side failure.
"""

from __future__ import annotations

import io
import json
import urllib.error
from email.message import Message

from services.llm_proxy_client import LLMProxyClient


def _http_error(code: int, body: dict) -> urllib.error.HTTPError:
    payload = json.dumps(body).encode("utf-8")
    return urllib.error.HTTPError(
        url="http://cloud.local/api/v1/llm/proxy/vision",
        code=code,
        msg="err",
        hdrs=Message(),
        fp=io.BytesIO(payload),
    )


def test_502_dict_detail_surfaces_provider_reason(monkeypatch):
    body = {
        "detail": {
            "message": "llm_all_providers_failed",
            "error_detail": ["HTTPError 429 rate_limited (cooled 2s): quota exceeded"],
        }
    }

    def fake_urlopen(req, timeout=None):
        raise _http_error(502, body)

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    proxy_client = LLMProxyClient("http://cloud.local", token_provider=lambda: "tok")
    detail: list[str] = []
    result = proxy_client.route_vision("anchor_vision", {"user_text": "x"}, 30_000, error_detail=detail)

    assert result is None
    assert any("llm_all_providers_failed" in line for line in detail)
    assert any("HTTPError 429 rate_limited" in line for line in detail)


def test_502_flat_string_detail_still_appends_status(monkeypatch):
    def fake_urlopen(req, timeout=None):
        raise _http_error(502, {"detail": "some_unrecognized_string"})

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    proxy_client = LLMProxyClient("http://cloud.local", token_provider=lambda: "tok")
    detail: list[str] = []
    result = proxy_client.route_text("intent", {}, 30_000, error_detail=detail)

    assert result is None
    assert detail == ["proxy HTTP 502"]


def test_401_still_retries_and_entitlement_codes_still_raise(monkeypatch):
    from services.llm_proxy_client import EntitlementBlocked

    def fake_urlopen(req, timeout=None):
        raise _http_error(402, {"detail": "trial_expired"})

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    proxy_client = LLMProxyClient("http://cloud.local", token_provider=lambda: "tok")
    try:
        proxy_client.route_text("intent", {}, 30_000, error_detail=[])
        raised = None
    except EntitlementBlocked as exc:
        raised = exc
    assert raised is not None
    assert raised.code == "trial_expired"
