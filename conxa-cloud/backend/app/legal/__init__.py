"""Frozen snapshots of the legal documents users accept, and their hashes.

The published Terms and Privacy Policy live in the marketing frontend
(``conxa-cloud/frontend/src/content/publicDocs.ts``). These ``.md`` files are a
rendered, byte-frozen copy of that text as of ``CURRENT_LEGAL_VERSION`` — they
exist so an acceptance record can point at *the exact words the user was shown*
rather than at whatever the docs page happens to say years later.

**Never edit a snapshot in place.** Changing the terms means: render a new dated
pair of files, add a new ``DOCUMENTS`` entry set, and bump
``CURRENT_LEGAL_VERSION``. Bumping the version is what re-prompts every user, and
what keeps every earlier acceptance attached to the text it was given.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

CURRENT_LEGAL_VERSION = "2026-08-29"

_DIR = Path(__file__).resolve().parent
_SITE = "https://www.conxa.in"


@dataclass(frozen=True)
class LegalDocument:
    id: str
    title: str
    url: str
    sha256: str

    def public(self) -> dict[str, str]:
        return {"id": self.id, "title": self.title, "url": self.url, "sha256": self.sha256}


def _load(doc_id: str, title: str, slug: str) -> LegalDocument:
    text = (_DIR / f"{slug}-{CURRENT_LEGAL_VERSION}.md").read_bytes()
    return LegalDocument(
        id=doc_id,
        title=title,
        url=f"{_SITE}/docs/{slug}",
        sha256=hashlib.sha256(text).hexdigest(),
    )


DOCUMENTS: tuple[LegalDocument, ...] = (
    _load("terms", "Terms And Conditions", "terms"),
    _load("privacy", "Privacy Policy", "privacy"),
)

DOCUMENT_HASHES: dict[str, str] = {doc.id: doc.sha256 for doc in DOCUMENTS}


def current_documents() -> list[dict[str, str]]:
    return [doc.public() for doc in DOCUMENTS]
