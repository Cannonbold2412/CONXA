"""ARCH-3 self-check: skill_spec.py still tags its fields [contract]/[executor]/[mixed],
docs/Backend-Schema.md still carries the boundary table, and the model still validates."""

from __future__ import annotations

from pathlib import Path

from conxa_core.models.skill_spec import SkillMeta, SkillPackage

REPO_ROOT = Path(__file__).resolve().parents[2]
SKILL_SPEC = REPO_ROOT / "packages" / "conxa-core" / "conxa_core" / "models" / "skill_spec.py"
BACKEND_SCHEMA_DOC = REPO_ROOT / "docs" / "Backend-Schema.md"

# One representative field per class that must carry a boundary tag — a smoke check that
# tags haven't been silently stripped, not an exhaustive per-field audit.
EXPECTED_TAGGED_LINES = [
    "id: str",  # SkillMeta
    "required_runtime: str",  # SkillMeta [executor]
    "signals: list[IdentitySignal] = Field(default_factory=list)               # [executor]",
    "fingerprint: ElementFingerprint = Field(default_factory=ElementFingerprint)  # [contract]",
    "action: str | dict[str, Any]",  # SkillStep
    "compiled_selectors: list[str] = Field(default_factory=list)",  # SkillStep
]


def test_skill_spec_still_carries_boundary_tags():
    source = SKILL_SPEC.read_text(encoding="utf-8")
    assert "[contract]" in source and "[executor]" in source and "[mixed]" in source, (
        "skill_spec.py lost its ARCH-3 contract/executor boundary tags"
    )
    for snippet in EXPECTED_TAGGED_LINES:
        assert snippet in source, f"expected tagged field line missing from skill_spec.py: {snippet!r}"


def test_backend_schema_doc_carries_boundary_table():
    doc = BACKEND_SCHEMA_DOC.read_text(encoding="utf-8")
    assert "### 3.0 Contract vs. Executor Boundary (ARCH-3)" in doc
    for class_name in ("SkillStep", "IdentityBundle", "Assertion"):
        assert class_name in doc.split("### 3.0")[1].split("### 3.1")[0], (
            f"{class_name} missing from the ARCH-3 boundary table in Backend-Schema.md §3.0"
        )


def test_skill_package_still_validates():
    pkg = SkillPackage(
        meta=SkillMeta(id="skill_test"),
        compile_report={
            "status": "ok",
            "steps_total": 0,
            "min_confidence": 0,
            "llm_router_stats": {},
            "steps": [],
        },
    )
    assert pkg.meta.id == "skill_test"
