"""Split long pages into overlapping chunks for embedding."""

from __future__ import annotations

import hashlib
import re


def chunk_text(text: str, *, max_chars: int = 1800, overlap: int = 200) -> list[str]:
    """Fixed-width windows with overlap (fallback for oversized paragraphs)."""
    normalized = (text or "").strip()
    if not normalized:
        return []
    chunks: list[str] = []
    start_index = 0
    length = len(normalized)
    while start_index < length:
        end_index = min(length, start_index + max_chars)
        piece = normalized[start_index:end_index].strip()
        if piece:
            chunks.append(piece)
        if end_index >= length:
            break
        start_index = max(0, end_index - overlap)
    return chunks


def chunk_text_semantic(
    text: str,
    *,
    max_chars: int = 1600,
    overlap: int = 220,
) -> list[str]:
    """
    Prefer paragraph boundaries (GOV.UK plain text uses blank-line separators).
    Oversized paragraphs fall back to ``chunk_text``.
    """
    normalized = (text or "").strip()
    if not normalized:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", normalized) if p.strip()]
    if not paragraphs:
        return chunk_text(normalized, max_chars=max_chars, overlap=overlap)

    raw_chunks: list[str] = []
    buffer: list[str] = []
    buf_len = 0

    def flush() -> None:
        nonlocal buffer, buf_len
        if buffer:
            raw_chunks.append("\n\n".join(buffer))
            buffer = []
            buf_len = 0

    for para in paragraphs:
        plen = len(para)
        if plen > max_chars:
            flush()
            raw_chunks.extend(chunk_text(para, max_chars=max_chars, overlap=overlap))
            continue
        sep = 2 if buffer else 0
        if buf_len + sep + plen > max_chars:
            flush()
        buffer.append(para)
        buf_len += plen + sep

    flush()

    if not raw_chunks:
        return chunk_text(normalized, max_chars=max_chars, overlap=overlap)

    return raw_chunks


def make_chunk_id(source_url: str, chunk_index: int, chunk_body: str) -> str:
    digest_input = f"{source_url}|{chunk_index}|{chunk_body[:240]}"
    return hashlib.sha256(digest_input.encode("utf-8")).hexdigest()[:24]
