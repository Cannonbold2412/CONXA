"""The compiled structural_fingerprint must reach the runtime manifest.json."""
from __future__ import annotations

import json

from conxa_core.config import settings
from conxa_compile import plugin_builder


def _seed_skill_dir(bundle_root, slug: str, *, with_fingerprint: bool) -> None:
    skill_dir = bundle_root / "skills" / slug
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "execution.json").write_text(
        json.dumps([{"type": "click", "selector": "[data-testid='go']"}]), encoding="utf-8"
    )
    (skill_dir / "recovery.json").write_text("{}", encoding="utf-8")
    (skill_dir / "input.json").write_text(json.dumps({"inputs": []}), encoding="utf-8")
    if with_fingerprint:
        (skill_dir / "structural_fingerprint.json").write_text(
            json.dumps(
                {
                    "landmarks": [
                        {
                            "intent": "click go",
                            "primary_selector": "[data-testid='go']",
                            "data_testid": "go",
                            "aria_label": "",
                            "inner_text": "Go",
                            "tag": "button",
                        }
                    ],
                    "landmark_count": 1,
                }
            ),
            encoding="utf-8",
        )


def _manifest(tmp_path, slug: str) -> dict:
    return json.loads((tmp_path / "skill-packs" / "acme" / slug / "manifest.json").read_text(encoding="utf-8"))


def test_manifest_carries_structural_fingerprint(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    bundle_root = tmp_path / "bundle"
    _seed_skill_dir(bundle_root, "checkout", with_fingerprint=True)

    plugin_builder._write_skill_packs_format(
        bundle_root=bundle_root,
        bundle_slug="acme",
        plugin_name="Acme",
        target_url="https://acme.test",
        protected_url="",
        skill_slugs=["checkout"],
        version="1.0.0",
    )

    manifest = _manifest(tmp_path, "checkout")
    fp = manifest["structural_fingerprint"]
    assert fp["landmark_count"] == 1
    assert fp["landmarks"][0]["data_testid"] == "go"


def test_manifest_fingerprint_defaults_empty_when_absent(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    bundle_root = tmp_path / "bundle"
    _seed_skill_dir(bundle_root, "login", with_fingerprint=False)

    plugin_builder._write_skill_packs_format(
        bundle_root=bundle_root,
        bundle_slug="acme",
        plugin_name="Acme",
        target_url="https://acme.test",
        protected_url="",
        skill_slugs=["login"],
        version="1.0.0",
    )

    manifest = _manifest(tmp_path, "login")
    assert manifest["structural_fingerprint"] == {}
