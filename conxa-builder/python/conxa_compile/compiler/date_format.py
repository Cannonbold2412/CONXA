"""Detect the display format of a date the user TYPED into a text field.

A native date input or custom calendar already compiles to a `date_pick` step (compiler/
date_picker.py). A plain text field the user typed "25/09/2026" into does not: it compiled as an
ordinary `type` step, so the format the application expects was never learned and a runtime
caller's "September 25, 2026" was filled in verbatim. `detect_date_format` recovers
(format-token-string, ISO date) from that recorded literal so the step can replay as
"semantic date -> the app's own format".

Pure and deterministic. Ambiguity is never guessed: 03/04/2026 is only interpreted when the
field's placeholder or the recording browser's locale sample says which part is the day;
otherwise this returns None and the step compiles exactly as it did before.
"""

from __future__ import annotations

import re
from datetime import date

_MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]
_MONTH_ALT = "|".join(_MONTHS + [m[:3] for m in _MONTHS])

_NUMERIC_RE = re.compile(r"^(\d{1,4})([/.\-])(\d{1,2})\2(\d{1,4})$")
_MDY_NAME_RE = re.compile(rf"^({_MONTH_ALT})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(,?)\s+(\d{{4}})$", re.IGNORECASE)
_DMY_NAME_RE = re.compile(rf"^(\d{{1,2}})(?:st|nd|rd|th)?([\s\-]+)({_MONTH_ALT})\.?(,?)\2(\d{{4}})$", re.IGNORECASE)
_PLACEHOLDER_TOKEN_RE = re.compile(r"(?<![a-z])(dd?|day|mm?|month)(?![a-z])", re.IGNORECASE)


def _valid(year: int, month: int, day: int) -> str:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return ""


def _pad(digits: str, token: str) -> str:
    return token * 2 if len(digits) >= 2 else token


def _day_first_from_placeholder(placeholder: str) -> bool | None:
    """True/False when the placeholder names the day before/after the month, else None."""
    tokens = [t.lower()[0] for t in _PLACEHOLDER_TOKEN_RE.findall(placeholder or "")]
    if "d" in tokens and "m" in tokens:
        return tokens.index("d") < tokens.index("m")
    return None


def _day_first_from_locale(sample: str) -> bool | None:
    """`sample` is the recording browser's rendering of 31 Jan 2026 (environment.json's
    date_format_sample): "31/01/2026" is day-first, "1/31/2026" month-first."""
    parts = [p for p in re.split(r"\D+", sample or "") if p]
    if len(parts) != 3:
        return None
    if parts[0] == "31":
        return True
    if parts[1] == "31":
        return False
    return None


def _month_token(name: str) -> str:
    return "MMMM" if len(name.rstrip(".")) > 3 else "MMM"


def detect_date_format(value: str, placeholder: str = "", locale_sample: str = "") -> tuple[str, str] | None:
    """Return (display_format, iso_date) for a typed date literal, or None when `value` is not
    a date or its day/month order can't be determined. Format tokens: YYYY, MM/M, DD/D, MMM,
    MMMM plus the literal separators, padding preserved from the recorded value."""
    v = str(value or "").strip()
    if not v:
        return None

    m = _NUMERIC_RE.match(v)
    if m:
        a, sep, b, c = m.groups()
        if len(a) == 4:
            iso = _valid(int(a), int(b), int(c))
            if not iso:
                return None
            return f"YYYY{sep}{_pad(b, 'M')}{sep}{_pad(c, 'D')}", iso
        if len(c) != 4 or len(a) > 2 or len(b) > 2:
            return None
        if int(a) > 12:
            day_first: bool | None = True
        elif int(b) > 12:
            day_first = False
        else:
            day_first = _day_first_from_placeholder(placeholder)
            if day_first is None:
                day_first = _day_first_from_locale(locale_sample)
        if day_first is None:
            return None
        day, month = (a, b) if day_first else (b, a)
        iso = _valid(int(c), int(month), int(day))
        if not iso:
            return None
        first, second = (("D", "M") if day_first else ("M", "D"))
        return f"{_pad(a, first)}{sep}{_pad(b, second)}{sep}YYYY", iso

    m = _MDY_NAME_RE.match(v)
    if m:
        name, day, comma, year = m.groups()
        month = next(i + 1 for i, full in enumerate(_MONTHS) if full.startswith(name.lower()))
        iso = _valid(int(year), month, int(day))
        if not iso:
            return None
        return f"{_month_token(name)} {_pad(day, 'D')}{comma} YYYY", iso

    m = _DMY_NAME_RE.match(v)
    if m:
        day, sep, name, comma, year = m.groups()
        month = next(i + 1 for i, full in enumerate(_MONTHS) if full.startswith(name.lower()))
        iso = _valid(int(year), month, int(day))
        if not iso:
            return None
        return f"{_pad(day, 'D')}{sep}{_month_token(name)}{comma}{sep}YYYY", iso

    return None


if __name__ == "__main__":
    assert detect_date_format("25/09/2026") == ("DD/MM/YYYY", "2026-09-25")
    assert detect_date_format("09/25/2026") == ("MM/DD/YYYY", "2026-09-25")
    assert detect_date_format("03/04/2026") is None
    assert detect_date_format("03/04/2026", "dd/mm/yyyy") == ("DD/MM/YYYY", "2026-04-03")
    assert detect_date_format("03/04/2026", "", "31/01/2026") == ("DD/MM/YYYY", "2026-04-03")
    assert detect_date_format("Sep 25, 2026") == ("MMM DD, YYYY", "2026-09-25")
    print("ok")
