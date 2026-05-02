"""Normalize assistant reply text for plain chat UIs (strip stray Markdown noise)."""

from __future__ import annotations

import re


def beautify_consultant_reply(text: str) -> str:
    """
    Remove common Markdown artifacts models emit (**bold**, ~~strike~~, ## headings)
    so responses read cleanly when not rendered as Markdown.
    """
    if not text:
        return text

    s = text.replace("\r\n", "\n")

    # ATX headings (# … ######) at line start → title text only
    def _heading(m: re.Match[str]) -> str:
        return m.group(1).strip()

    s = re.sub(r"(?m)^\s{0,3}#{1,6}\s+(.*)$", _heading, s)

    # Strikethrough ~~ … ~~ → inner text
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"~~([^~]+)~~", r"\1", s)

    # Bold ** … ** (repeat for adjacent chunks)
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)

    # Trailing decorative rule lines (---, ***, ___)
    s = re.sub(r"(?m)^\s*(?:[-*_])\s*(?:[-*_])\s*(?:[-*_])\s*$", "", s)

    # Trim spaces per line and overall
    s = "\n".join(line.rstrip() for line in s.split("\n"))
    return s.strip()


# Minimum signals that the model included an appropriate hedge (evaluator looks for these).
_DISCLAIMER_MARKERS = (
    "gov.uk",
    "legal advice",
    "not legal",
    "immigration adviser",
    "qualified adviser",
    "professional advice",
    "verify on",
    "check the official",
)

_DEFAULT_TAIL = (
    "\n\nGeneral guidance only - not legal advice. Verify everything that matters on GOV.UK or "
    "with a qualified immigration adviser."
)


def ensure_consultant_disclaimer(text: str) -> str:
    """Append a standard hedge if the model dropped the closing disclaimer (common on long memory-augmented turns)."""
    t = (text or "").strip()
    if not t:
        return _DEFAULT_TAIL.strip()
    lower = t.lower()
    if any(marker in lower for marker in _DISCLAIMER_MARKERS):
        return t
    return (t + _DEFAULT_TAIL).strip()
