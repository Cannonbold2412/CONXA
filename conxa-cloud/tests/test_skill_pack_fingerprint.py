"""The compiled structural_fingerprint must reach the runtime manifest.json."""
from __future__ import annotations

import json

from conxa_core.config import settings
from conxa_compile import skill_package_builder_output


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
    return json.loads(
        (tmp_path / "skill-packs" / "wrk_acme" / "_default" / slug / "manifest.json").read_text(encoding="utf-8")
    )


def test_manifest_carries_structural_fingerprint(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    bundle_root = tmp_path / "bundle"
    _seed_skill_dir(bundle_root, "checkout", with_fingerprint=True)

    skill_package_builder_output._write_skill_packs_format(
        bundle_root=bundle_root,
        workspace_id="wrk_acme",
        display_name="Acme",
        target_url="https://acme.test",
        protected_url="",
        skill_slugs=["checkout"],
        skill_target_urls={"checkout": "https://acme.test"},
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

    skill_package_builder_output._write_skill_packs_format(
        bundle_root=bundle_root,
        workspace_id="wrk_acme",
        display_name="Acme",
        target_url="https://acme.test",
        protected_url="",
        skill_slugs=["login"],
        skill_target_urls={"login": "https://acme.test"},
        version="1.0.0",
    )

    manifest = _manifest(tmp_path, "login")
    assert manifest["structural_fingerprint"] == {}


def test_corrupt_fingerprint_raises_instead_of_silently_dropping_it(tmp_path, monkeypatch) -> None:
    """A sidecar this same build just wrote (not merely absent) being unreadable is a
    real bug — must raise, not silently disable the drift gate."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    bundle_root = tmp_path / "bundle"
    _seed_skill_dir(bundle_root, "checkout", with_fingerprint=False)
    (bundle_root / "skills" / "checkout" / "structural_fingerprint.json").write_text(
        "{not valid json", encoding="utf-8"
    )

    try:
        skill_package_builder_output._write_skill_packs_format(
            bundle_root=bundle_root,
            workspace_id="wrk_acme",
            display_name="Acme",
            target_url="https://acme.test",
            protected_url="",
            skill_slugs=["checkout"],
            skill_target_urls={"checkout": "https://acme.test"},
            version="1.0.0",
        )
        assert False, "expected a RuntimeError for the corrupt sidecar"
    except RuntimeError as exc:
        assert "structural_fingerprint.json" in str(exc)


def test_corrupt_existing_pack_json_raises_instead_of_dropping_sibling_skills(tmp_path, monkeypatch) -> None:
    """A corrupted pack.json from a prior build must not be silently treated as 'no
    prior pack' — that would drop every sibling skill it already listed."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    bundle_root = tmp_path / "bundle"
    _seed_skill_dir(bundle_root, "checkout", with_fingerprint=False)
    pack_dir = tmp_path / "skill-packs" / "wrk_acme"
    pack_dir.mkdir(parents=True, exist_ok=True)
    (pack_dir / "pack.json").write_text("{not valid json", encoding="utf-8")

    try:
        skill_package_builder_output._write_skill_packs_format(
            bundle_root=bundle_root,
            workspace_id="wrk_acme",
            display_name="Acme",
            target_url="https://acme.test",
            protected_url="",
            skill_slugs=["checkout"],
            skill_target_urls={"checkout": "https://acme.test"},
            version="1.0.0",
        )
        assert False, "expected a RuntimeError for the corrupt pack.json"
    except RuntimeError as exc:
        assert "pack.json" in str(exc)
