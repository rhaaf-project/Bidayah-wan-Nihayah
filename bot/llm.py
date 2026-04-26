import os
import logging
import requests

logger = logging.getLogger(__name__)

API_KEY = os.environ["GEMINI_API_KEY"]
MODEL_NAME = "gemini-2.5-flash"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent"

REQUEST_TIMEOUT = 90


def _generate(prompt: str) -> str:
    """Direct REST call to Gemini. Bypasses google-generativeai SDK to avoid
    region-specific gRPC/header issues that trigger 403 from some networks."""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
    }
    resp = requests.post(
        ENDPOINT,
        params={"key": API_KEY},
        json=payload,
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code != 200:
        logger.error(f"Gemini API {resp.status_code}: {resp.text[:500]}")
        resp.raise_for_status()
    data = resp.json()

    try:
        candidate = data["candidates"][0]
        parts = candidate["content"]["parts"]
        return "".join(p.get("text", "") for p in parts).strip()
    except (KeyError, IndexError) as e:
        logger.error(f"Unexpected Gemini response shape: {data}")
        raise RuntimeError(f"could not parse Gemini response: {e}")


def translate_query(query_indo: str) -> list[str]:
    """Indonesian question → list of Arabic search keywords."""
    prompt = f"""Pertanyaan dalam bahasa Indonesia tentang sejarah Islam klasik:
"{query_indo}"

Tugas: berikan 5 sampai 8 keyword pencarian dalam bahasa Arab klasik yang paling relevan untuk mencari passage di kitab al-Bidayah wan-Nihayah karya Ibn Katsir.

Aturan:
- Gunakan ejaan Arab klasik (tanpa harakat).
- Untuk nama tokoh, sertakan variasi (nama lengkap + bagian penting nama, misal "خالد بن الوليد" dan "خالد").
- Untuk peristiwa, sertakan kata kunci spesifik (nama tempat, tahun hijriah, dll).
- Format output: HANYA satu keyword per baris, tanpa nomor, tanpa penjelasan, tanpa tanda kutip.

Contoh untuk "kapan wafat khalid bin walid":
خالد بن الوليد
وفاة خالد
حمص
سنة إحدى وعشرين
سيف الله المسلول
"""
    raw = _generate(prompt)
    keywords = [k.strip().strip('"\'`*-') for k in raw.split("\n")]
    keywords = [k for k in keywords if k and len(k) >= 2]
    return keywords[:8]


def summarize(query_indo: str, passages: list[dict]) -> str:
    """Pass query + retrieved passages to Gemini, return Indonesian answer with citations."""
    if not passages:
        return ("ga nemu passage yang cocok di al-Bidayah wan-Nihayah. "
                "coba reformulasi pertanyaan, atau pake nama/tempat/tahun yang lebih spesifik.")

    passages_text = "\n\n---\n\n".join(
        f"[Jilid {p['vol']} hal {p['page']}]\n{p['text'][:2500]}"
        for p in passages
    )
    prompt = f"""Kamu adalah asisten riset untuk kitab al-Bidayah wan-Nihayah karya Ibn Katsir (rahimahullah).

Pertanyaan user (bahasa Indonesia):
"{query_indo}"

Passage Arab yang ditemukan dari kitab:
{passages_text}

Tugas:
1. Jawab pertanyaan user dalam bahasa Indonesia yang jelas dan padat, BERDASARKAN passage di atas.
2. Sertakan citation (Jilid X hal Y) untuk setiap fakta penting.
3. Kalo passage ga cukup untuk menjawab, bilang terus terang — JANGAN mengarang fakta dari pengetahuan umum.
4. Maksimal 4 paragraf jawaban + 1 baris sumber di akhir.
5. Pake bahasa Indonesia kasual yang sopan, ga perlu formal banget.

Format:
[jawaban 2-4 paragraf]

Sumber: al-Bidayah wan-Nihayah (Ibn Katsir), [list jilid + halaman yang dikutip]
"""
    return _generate(prompt) or "maaf, gemini ga balikin jawaban. coba ulangi."
