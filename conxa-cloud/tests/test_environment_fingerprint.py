"""EXEC-36: recording-environment sidecar → SkillMeta.environment → manifest.json."""

from __future__ import annotations

import json
from pathlib import Path

from conxa_compile.compiler.build import _read_environment_sidecar
from conxa_core.models.skill_spec import SkillMeta


ENV_SAMPLE = {
    "locale": "de-DE",
    "timezone": "Europe/Berlin",
    "utc_offset_minutes": 60,
    "viewport": {"w": 1366, "h": 768},
    "device_pixel_ratio": 1,
    "date_format_sample": "31.1.2026",
    "platform": "Win32",
}


def test_read_environment_sidecar_returns_the_written_dict(tmp_path: Path) -> None:
    (tmp_path / "environment.json").write_text(json.dumps(ENV_SAMPLE), encoding="utf-8")
    assert _read_environment_sidecar(tmp_path) == ENV_SAMPLE


def test_read_environment_sidecar_missing_file_compiles_cleanly(tmp_path: Path) -> None:
    # Old sessions recorded before EXEC-36, or a page that never finished loading — never an
    # error, just "unknown."
    assert _read_environment_sidecar(tmp_path) == {}


def test_read_environment_sidecar_malformed_json_compiles_cleanly(tmp_path: Path) -> None:
    (tmp_path / "environment.json").write_text("{not valid json", encoding="utf-8")
    assert _read_environment_sidecar(tmp_path) == {}


def test_read_environment_sidecar_non_dict_json_compiles_cleanly(tmp_path: Path) -> None:
    (tmp_path / "environment.json").write_text("[1, 2, 3]", encoding="utf-8")
    assert _read_environment_sidecar(tmp_path) == {}


def test_skill_meta_environment_defaults_empty() -> None:
    meta = SkillMeta(id="skill_x")
    assert meta.environment == {}


def test_skill_meta_environment_round_trips() -> None:
    meta = SkillMeta(id="skill_x", environment=ENV_SAMPLE)
    assert meta.environment == ENV_SAMPLE
    dumped = meta.model_dump(mode="json")
    assert dumped["environment"] == ENV_SAMPLE
