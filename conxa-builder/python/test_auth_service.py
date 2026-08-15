from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.auth_service import AuthService, _dev_skip_auth, _keyring_service  # noqa: E402


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


class DevSkipAuthTests(unittest.TestCase):
    def test_off_by_default_in_dev(self) -> None:
        with patch.dict("os.environ", {"CONXA_ENV": "dev"}, clear=False):
            import os

            os.environ.pop("CONXA_DEV_SKIP_AUTH", None)
            self.assertFalse(_dev_skip_auth())

    def test_requires_both_dev_env_and_flag(self) -> None:
        with patch.dict("os.environ", {"CONXA_ENV": "prod", "CONXA_DEV_SKIP_AUTH": "1"}):
            self.assertFalse(_dev_skip_auth())

    def test_enabled_when_both_set(self) -> None:
        with patch.dict("os.environ", {"CONXA_ENV": "dev", "CONXA_DEV_SKIP_AUTH": "true"}):
            self.assertTrue(_dev_skip_auth())

    def test_login_and_current_identity_short_circuit(self) -> None:
        svc = AuthService(clerk_domain="https://clerk.example", client_id="client")
        with patch.dict("os.environ", {"CONXA_ENV": "dev", "CONXA_DEV_SKIP_AUTH": "1"}):
            identity = svc.login()
            self.assertEqual(identity["user_id"], "dev-user")
            self.assertEqual(svc.current_identity(), identity)

    def test_get_token_short_circuits_without_stored_session(self) -> None:
        svc = AuthService(clerk_domain="https://clerk.example", client_id="client")
        with patch.dict("os.environ", {"CONXA_ENV": "dev", "CONXA_DEV_SKIP_AUTH": "1"}):
            self.assertTrue(svc.get_token())


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
