from __future__ import annotations

from conxa_core import db
from conxa_core.config import settings


def test_colon_namespaces_do_not_become_raw_windows_dirnames(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", "")
    monkeypatch.setattr(db, "_engine", None)

    for namespace in ("manifest:dev", "skill_packs:acme:my-skill"):
        db.db_set(namespace, "current", {"ok": True})
        assert db.db_get(namespace, "current") == {"ok": True}

    dirs = [p for p in tmp_path.rglob("*") if p.is_dir()]
    assert dirs
    assert all(":" not in p.name for p in dirs)
