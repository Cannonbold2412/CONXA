"""Authorized-party allowlist accepts OAuth tokens (client_id, no azp)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.security import verify_clerk_jwt


def _verify(claims: dict) -> dict:
    with (
        patch("conxa_core.config.settings.clerk_issuer", "https://clerk.example"),
        patch("conxa_core.config.settings.clerk_jwks_url", "https://clerk.example/jwks"),
        patch("conxa_core.config.settings.clerk_audience", ""),
        patch("conxa_core.config.settings.clerk_authorized_parties", "https://conxa.in,studio_client"),
        patch("jwt.PyJWKClient", return_value=MagicMock()),
        patch("jwt.decode", return_value=claims),
    ):
        return verify_clerk_jwt("x.y.z")


def test_browser_session_token_azp_allowed() -> None:
    assert _verify({"sub": "u", "azp": "https://conxa.in"})["sub"] == "u"


def test_oauth_token_client_id_allowed() -> None:
    assert _verify({"sub": "u", "client_id": "studio_client"})["sub"] == "u"


@pytest.mark.parametrize("claims", [{"sub": "u", "client_id": "other"}, {"sub": "u"}])
def test_unlisted_or_missing_party_rejected(claims: dict) -> None:
    with pytest.raises(HTTPException) as exc:
        _verify(claims)
    assert exc.value.detail == "invalid_authorized_party"
