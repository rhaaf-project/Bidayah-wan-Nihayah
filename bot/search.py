import re
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

PAGE_RE = re.compile(r'^# PageV(\d+)P(\d+)\s*$')

TASHKEEL_RE = re.compile(r'[ً-ٰٟـ]')

def normalize_arabic(text: str) -> str:
    text = TASHKEEL_RE.sub('', text)
    text = text.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
    text = text.replace('ى', 'ي')
    return text

def _parse_page_marker(vol_str: str, page_full: str) -> tuple[int, int]:
    vol = int(vol_str)
    if len(page_full) > 3 and page_full.endswith(vol_str):
        page = int(page_full[:-len(vol_str)])
    else:
        page = int(page_full) if page_full else 0
    return vol, page

def load_corpus(path: str) -> list[dict]:
    """Parse OpenITI corpus into per-page chunks.

    Each chunk: {'vol': int, 'page': int, 'text': str, 'norm': str}
    """
    chunks: list[dict] = []
    current_vol = 0
    current_page = 0
    current_lines: list[str] = []

    def flush():
        if current_lines:
            text = ' '.join(current_lines).strip()
            if text:
                chunks.append({
                    'vol': current_vol,
                    'page': current_page,
                    'text': text,
                    'norm': normalize_arabic(text),
                })

    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"corpus not found: {path}")

    with p.open(encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n').rstrip('\r')

            m = PAGE_RE.match(line)
            if m:
                flush()
                current_vol, current_page = _parse_page_marker(m.group(1), m.group(2))
                current_lines = []
                continue

            if not line.strip() or line.startswith('#META#') or line.startswith('######'):
                continue

            if line.startswith('# '):
                content = line[2:]
            elif line.startswith('~~'):
                content = line[2:]
            elif line.startswith('###'):
                continue
            else:
                content = line

            current_lines.append(content)
        flush()

    logger.info(f"Loaded {len(chunks)} page-chunks from {path}")
    return chunks


def search(chunks: list[dict], keywords: list[str], top_k: int = 5) -> list[dict]:
    """Score chunks by # keywords matched (substring), return top_k."""
    if not keywords:
        return []
    norm_keywords = [normalize_arabic(k.strip()) for k in keywords if k.strip()]
    norm_keywords = [k for k in norm_keywords if len(k) >= 2]
    if not norm_keywords:
        return []

    scored: list[tuple[int, int, dict]] = []
    for c in chunks:
        norm = c['norm']
        matches = sum(1 for k in norm_keywords if k in norm)
        if matches > 0:
            total_hits = sum(norm.count(k) for k in norm_keywords)
            scored.append((matches, total_hits, c))

    scored.sort(key=lambda x: (-x[0], -x[1]))
    return [c for _, _, c in scored[:top_k]]
