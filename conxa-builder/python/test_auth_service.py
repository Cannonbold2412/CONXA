from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.auth_service import AuthService, _keyring_service  # noqa: E402


class KeyringServiceScopingTests(unittest.TestCase):
    def test_defaults_to_prod_service_name(self) -> None:
        with patch.dict("os.environ", {}, clear=False):
            import os

            os.environ.pop("CONXA_ENV", None)
            self.assertEqual(_keyring_service(), "conxa-studio")

    def test_dev_env_uses_dev_scoped_service_name(self) -> None:
        with patch.dict("os.environ", {"CONXA_ENV": "dev"}):
            self.assertEqual(_keyring_service(), "conxa-studio-dev")

    def test_dev_env_matching_is_case_insensitive(self) -> None:
        with patch.dict("os.environ", {"CONXA_ENV": "Development"}):
            self.assertEqual(_keyring_service(), "conxa-studio-dev")

    def test_unrelated_env_value_falls_back_to_prod(self) -> None:
        with patch.dict("os.environ", {"CONXA_ENV": "prod"}):
            self.assertEqual(_keyring_service(), "conxa-studio")


class AuthServiceKeyringCallsTests(unittest.TestCase):
    def _service(self) -> AuthService:
        return AuthService(clerk_domain="https://clerk.example", client_id="client")

    def test_load_save_logout_use_resolved_service_name(self) -> None:
        svc = self._service()
        fake_keyring = MagicMock()
        fake_keyring.get_password.return_value = None
        svc._keyring = MagicMock(return_value=fake_keyring)  # type: ignore[method-assign]

        with patch.dict("os.environ", {"CONXA_ENV": "dev"}):
            svc._load()
            svc._save({"access_token": "x"})
            svc.logout()

        fake_keyring.get_password.assert_called_once_with("conxa-studio-dev", "session")
        fake_keyring.set_password.assert_called_once_with(
            "conxa-studio-dev", "session", '{"access_token": "x"}'
        )
        fake_keyring.delete_password.assert_called_once_with("conxa-studio-dev", "session")


if __name__ == "__main__":
    unittest.main()
