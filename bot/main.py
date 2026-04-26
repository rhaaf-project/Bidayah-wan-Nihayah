import os
import logging
from dotenv import load_dotenv
from flask import Flask, request, jsonify

load_dotenv(override=True)

import search
import llm

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("bidaya-bot")

CORPUS_PATH = os.environ.get("CORPUS_PATH", "corpus/bidaya_arab.txt")
PORT = int(os.environ.get("PORT", 7860))
BACKEND_API_KEY = os.environ.get("BACKEND_API_KEY", "")

if not BACKEND_API_KEY:
    raise SystemExit("BACKEND_API_KEY env var is required")

logger.info(f"Loading corpus from {CORPUS_PATH} ...")
CHUNKS = search.load_corpus(CORPUS_PATH)
logger.info(f"Corpus ready: {len(CHUNKS)} page-chunks indexed.")

flask_app = Flask(__name__)


@flask_app.get("/")
def index():
    return "bidaya bot backend is alive\n"


@flask_app.get("/health")
def health():
    return {"status": "ok", "chunks_loaded": len(CHUNKS)}


@flask_app.post("/query")
def query():
    if request.headers.get("X-API-Key") != BACKEND_API_KEY:
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({"error": "missing 'text'"}), 400
    if len(text) > 500:
        return jsonify({"error": "text too long (max 500)"}), 400

    logger.info(f"Query: {text!r}")

    try:
        keywords = llm.translate_query(text)
        logger.info(f"  → keywords: {keywords}")

        passages = search.search(CHUNKS, keywords, top_k=5)
        logger.info(f"  → matched {len(passages)} passages")

        answer = llm.summarize(text, passages)

        if len(answer) > 4000:
            answer = answer[:4000] + "\n\n[... dipotong, terlalu panjang]"

        return jsonify({"answer": answer, "keywords": keywords, "passages_count": len(passages)})
    except Exception as e:
        logger.exception("query failed")
        return jsonify({"error": f"{type(e).__name__}: {e}"}), 500


if __name__ == "__main__":
    flask_app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
