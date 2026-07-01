"""Pydantic models for the unified, Ed25519-signed runtime update manifest.

One signed manifest.json replaces the three separate cloud endpoints
(conxa-runtime-manifest, conxa-app-manifest, per-company skill-pack delta)
for update-decision purposes. See docs/TRD.md and the manifest_signer module
for how this gets composed, signed, and verified.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class CompatEntry(BaseModel):
    min: str = ""
    max: str = ""  # exclusive upper bound; "" = unbounded


class RolloutConfig(BaseModel):
    percentage: int = 100  # 0-100, deterministic bucket by install_id
    halted: bool = False   # operator kill-switch for a bad rollout


class ArtifactFile(BaseModel):
    filename: str
    url: str
    sha256: str


class ComponentVersion(BaseModel):
    version: str
    released_at: str
    release_notes: str = ""
    required: bool = False  # true = hard-required, no skipping regardless of rollout
    min_host: str = ""      # compat gate against conxa_runtime
    files: list[ArtifactFile] = Field(default_factory=list)
    rollout: RolloutConfig = Field(default_factory=RolloutConfig)


class SkillVersion(ComponentVersion):
    min_runtime: str = ""  # compat gate: skill vs conxa_app


class UnifiedManifest(BaseModel):
    manifest_version: int = 3
    generated_at: str
    mcp_protocol_version: str = "2024-11-05"
    minimum_versions: dict[str, str] = Field(default_factory=dict)
    compatibility: dict[str, CompatEntry] = Field(default_factory=dict)
    conxa_runtime: ComponentVersion
    conxa_app: ComponentVersion
    skill_packs: dict[str, dict[str, SkillVersion]] = Field(default_factory=dict)
    # base64 Ed25519 signature over the canonical JSON of every other field.
    # Always filled last by manifest_signer.sign_manifest(); never itself signed over.
    signature: str = ""
