"""Ed25519 signing/verification for the unified runtime update manifest.

The private key lives only as the CONXA_MANIFEST_SIGNING_KEY env var (a GitHub Actions
secret on Render — PEM-encoded PKCS8). Signing happens here, cloud-side, on every
manifest recomposition — CI never touches the private key, it only calls the admin
component-versions endpoint with the existing CONXA_ADMIN_TOKEN.

The runtime verifies with the matching public key baked into runtime/package.json at
build time (see runtime/version_manager.js docs) — never trust a manifest field that
hasn't passed signature verification against that key.
"""
from __future__ import annotations

import json
import os

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
    load_pem_private_key,
)


def _canonical_json(manifest: dict) -> bytes:
    """Deterministic serialization signed over: sorted keys, no whitespace, the
    signature field itself excluded (it can't sign over its own value)."""
    unsigned = {k: v for k, v in manifest.items() if k != "signature"}
    return json.dumps(unsigned, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def load_signing_key() -> Ed25519PrivateKey | None:
    """Load the Ed25519 private key from CONXA_MANIFEST_SIGNING_KEY (PEM). None if unset."""
    pem = os.environ.get("CONXA_MANIFEST_SIGNING_KEY", "")
    if not pem:
        return None
    key = load_pem_private_key(pem.encode("utf-8"), password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise ValueError("CONXA_MANIFEST_SIGNING_KEY is not an Ed25519 private key")
    return key


def sign_manifest(manifest: dict, private_key: Ed25519PrivateKey) -> str:
    """Return the base64 signature over the manifest's canonical JSON (minus `signature`)."""
    import base64

    signature = private_key.sign(_canonical_json(manifest))
    return base64.b64encode(signature).decode("ascii")


def verify_manifest(manifest: dict, public_key_b64: str) -> bool:
    """Verify `manifest["signature"]` against the given base64 Ed25519 public key.

    Not on the runtime's hot path (the runtime does this in JS), but used here for
    the admin test endpoint and for the cloud's own test suite.
    """
    import base64

    signature_b64 = manifest.get("signature", "")
    if not signature_b64:
        return False
    try:
        public_key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64))
        public_key.verify(base64.b64decode(signature_b64), _canonical_json(manifest))
        return True
    except Exception:
        return False


def generate_keypair_pem() -> tuple[str, str]:
    """Generate a fresh Ed25519 keypair. Returns (private_key_pem, public_key_b64).

    Utility for provisioning CONXA_MANIFEST_SIGNING_KEY — not called on any request path.
    """
    import base64

    private_key = Ed25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
    ).decode("ascii")
    public_raw = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return private_pem, base64.b64encode(public_raw).decode("ascii")
