"""Seed dev-only sample data: a Default group, a Sales group with a few
apps + workflows. Idempotent — no-ops when a "Sales" group already exists.

Invoked automatically by conxa.ps1/conxa.sh before launching Build Studio in
dev (CONXA_ENV=dev, target=studio). Never runs in prod. A failure here must
never block Studio from launching — see the callers, which swallow errors.

Usage: python scripts/seed_dev_data.py
Requires conxa-core and conxa-builder/python on PYTHONPATH (conxa.ps1/.sh set
CONXA_STUDIO_HOME/CONXA_DATA_DIR before invoking this, same as the Studio
process itself, so writes land in the same dev data tree the app reads from).
"""

from __future__ import annotations

import os
import sys

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in (
    os.path.join(_REPO_ROOT, "packages", "conxa-core"),
    os.path.join(_REPO_ROOT, "conxa-builder", "python"),
):
    if _p not in sys.path:
        sys.path.insert(0, _p)


def main() -> None:
    from conxa_core.storage.group_store import add_app, create_group, ensure_default_group, list_groups
    from conxa_core.storage.workflow_store import create_workflow, list_workflows

    ensure_default_group()

    existing = {g.name: g for g in list_groups()}
    if "Sales" in existing:
        print("[seed] Sales group already exists — skipping.")
        return

    sales = create_group("Sales")
    add_app(sales.id, "GitHub", "https://github.com/login", "https://github.com")
    add_app(sales.id, "Render", "https://dashboard.render.com/login", "https://dashboard.render.com")
    add_app(sales.id, "HubSpot", "https://app.hubspot.com/login", "https://app.hubspot.com")

    existing_workflow_names = {w.name for w in list_workflows()}
    seed_workflows = [
        ("Create a lead", "https://app.hubspot.com"),
        ("Sync contact to CRM", "https://dashboard.render.com"),
    ]
    for name, target_url in seed_workflows:
        if name in existing_workflow_names:
            continue
        create_workflow(name=name, target_url=target_url, group_id=sales.id)

    print(f"[seed] Created Sales group ({sales.id}) with 3 apps and {len(seed_workflows)} workflows.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — a seed failure must never block launch
        print(f"[seed] Skipped: {exc}", file=sys.stderr)
