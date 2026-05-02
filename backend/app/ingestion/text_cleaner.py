"""Normalize fetched GOV.UK HTML into plain text."""

from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

# Noise that pollutes embeddings but is not policy content.
_GOVUK_DECOMPOSE_SELECTORS = (
    "script",
    "style",
    "noscript",
    "svg",
    "form",
    "nav",
    "footer",
    ".gem-cookie-banner",
    ".govuk-cookie-banner",
    "[data-module='govuk-cookie-banner']",
    ".gem-c-print-link",
    ".govuk-back-link",
    ".govuk-related-navigation",
    ".gem-c-related-navigation",
    ".gem-c-contextual-sidebar",
    ".gem-c-feedback",
    ".govuk-visually-hidden",
    ".gem-c-step-nav-header",
    ".govuk-warning-text__icon",
)

_MAIN_SELECTORS = (
    "main#main-content",
    "main#government-main-content",
    "main.govuk-main-wrapper",
    "main",
    "#content",
    ".govuk-main-wrapper",
)


def _clean_lines(text: str) -> str:
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _breadcrumb_line(soup: BeautifulSoup) -> str:
    crumbs = soup.select(".govuk-breadcrumbs ol li a, .govuk-breadcrumbs li")
    parts: list[str] = []
    for node in crumbs:
        t = node.get_text(separator=" ", strip=True)
        if t and t not in parts:
            parts.append(t)
    if not parts:
        return ""
    return " > ".join(parts)


def _primary_heading(soup: BeautifulSoup) -> str:
    h1 = soup.find("h1")
    if h1 and isinstance(h1, Tag):
        return h1.get_text(separator=" ", strip=True)
    return ""


def html_to_plain_text(html: str, title_fallback: str = "", *, govuk: bool = True) -> str:
    """
    Strip boilerplate and extract readable body text.

    When ``govuk`` is True (default), use GOV.UK Publishing Component selectors so the
    main policy body is kept and navigation/cookie/related columns are removed.
    """
    soup = BeautifulSoup(html, "html.parser")

    if govuk:
        for selector in _GOVUK_DECOMPOSE_SELECTORS:
            for node in soup.select(selector):
                node.decompose()

        main_el: Tag | None = None
        for sel in _MAIN_SELECTORS:
            found = soup.select_one(sel)
            if isinstance(found, Tag):
                main_el = found
                break
        if main_el is None:
            main_el = soup.body if isinstance(soup.body, Tag) else None

        breadcrumbs = _breadcrumb_line(soup)
        h1_text = _primary_heading(soup)

        if main_el is None:
            text = soup.get_text(separator="\n", strip=True)
        else:
            text = main_el.get_text(separator="\n", strip=True)

        text = _clean_lines(text)
        prefix_parts: list[str] = []
        if breadcrumbs:
            prefix_parts.append(f"Breadcrumb: {breadcrumbs}")
        if h1_text:
            prefix_parts.append(f"Page: {h1_text}")
        if prefix_parts:
            text = "\n\n".join(prefix_parts) + "\n\n" + text if text else "\n\n".join(prefix_parts)
        text = text.strip()
        if not text and title_fallback:
            return title_fallback.strip()
        return text

    # Generic fallback (non-GOV.UK HTML)
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    main = soup.find("main") or soup.body or soup
    text = main.get_text(separator="\n", strip=True)
    text = _clean_lines(text)
    if not text.strip() and title_fallback:
        return title_fallback.strip()
    return text.strip()


def discover_skilled_worker_urls(html: str, *, base: str = "https://www.gov.uk", limit: int = 60) -> list[str]:
    """Collect same-topic GOV.UK links from a hub HTML (paths under /skilled-worker-visa)."""
    soup = BeautifulSoup(html, "html.parser")
    found: set[str] = set()
    for a in soup.select("a[href]"):
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#"):
            continue
        if href.startswith("/skilled-worker-visa"):
            full = urljoin(base, href).split("#")[0].rstrip("/")
            if "skilled-worker-visa" in full:
                found.add(full)
    return sorted(found)[:limit]
