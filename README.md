# al-Bidayah wan-Nihayah Search Bot

Telegram bot untuk cari isi kitab **al-Bidayah wan-Nihayah** karya Ibn Katsir rahimahullah pakai bahasa Indonesia. Tanya, dapat jawaban dengan kutipan jilid + halaman.

**Bot live :** [@bidaya_nihaya_search_bot](https://t.me/bidaya_nihaya_search_bot)

## Cara kerja

```
[user di Telegram]
    ↓ webhook POST
[Cloudflare Worker]              ← gateway, free, no sleep
    ↓ POST /query (X-API-Key)
[HF Space backend]               ← Python + Flask + Gemini
    ↓ Gemini translate
    ↓ grep corpus 21 jilid
    ↓ Gemini summarize
[Worker → Telegram editMessage]
    ↓
[user dapat jawaban + sitasi]
```

Setiap query : Indo → Arabic keywords (Gemini 2.5 Flash) → grep corpus → ringkas Indo + sitasi (Gemini).

## Kenapa arsitektur split?

HF Spaces **block outbound ke `api.telegram.org`** (Gemini, Google, GitHub jalan; cuma Telegram di-block, kemungkinan policy anti-spam HF). Workaround : HF jadi backend, Cloudflare Worker jadi gateway Telegram.

## Stack

| layer | platform | gratis | tier |
|-------|----------|--------|------|
| LLM | Gemini 2.5 Flash | 1500 req/hari | free tier (AI Studio) |
| Backend | Hugging Face Spaces | unlimited CPU | Docker Space |
| Telegram gateway | Cloudflare Workers | 100k req/hari | free workers.dev |
| Keepalive ping | cron-job.org | unlimited | free |
| Corpus storage | git LFS di HF Space | 1 GB | free |

Total biaya bulanan : **0 rupiah** sampai trafik ~150 user aktif/hari.

## Repo layout

```
ibn_katsir/
├── README.md           ← ini (overview)
├── DEPLOY.md           ← panduan deploy from scratch
├── bot/                ← HF Space backend (Python)
│   ├── main.py         Flask + /query endpoint
│   ├── search.py       OpenITI corpus parser + grep search
│   ├── llm.py          Gemini REST client (raw, bypass SDK)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── README.md       HF Space frontmatter
│   └── .env.example
├── worker/             ← Cloudflare Worker (JS)
│   ├── worker.js       single-file, ES modules, ~180 baris
│   └── README.md       worker-spesifik notes
├── corpus/             ← Arabic source text
│   ├── bidaya_arab.txt 21 jilid lengkap (22 MB)
│   └── per_jilid/      bidaya_V00.txt sampai V20.txt (split per volume)
├── sumber/             ← raw PDF/page scans (referensi)
└── akses.txt           ← credentials (gitignored)
```

## Sumber corpus

* **Edisi** : Dar Hijr, editor Abdullah bin Abdul Muhsin al-Turki (edisi akademik standar)
* **21 jilid** (V00 muqaddimah + V01-V20 isi), ~13,096 halaman
* **Format** : OpenITI plain text Arab, page marker `# PageV{vol}P{page}{vol}`
* **Sumber asal** : [OpenITI RELEASE](https://github.com/OpenITI/RELEASE/tree/master/data/0774IbnKathir/0774IbnKathir.Bidaya) (proofread, tag `.completed`) — derived dari [Shamela book 4445](https://shamela.ws/book/4445)
* **Legal** : open access, public domain

## Deploy from scratch

Lihat [DEPLOY.md](DEPLOY.md) — panduan lengkap step-by-step.

## Maintenance

* **Update welcome message** : edit `bot/main.py` ATAU `worker/worker.js` (ada di kedua tempat — yg dipake worker.js, krn Worker yg jawab `/start`). push ulang.
* **Update prompt Gemini** : edit `bot/llm.py`, push HF Space.
* **Lihat logs** :
  * HF Space : tab Logs di halaman Space
  * CF Worker : tab Observability/Logs di halaman Worker
* **Revoke credentials kalo bocor** :
  * Telegram : `/revoke` di @BotFather → update `TELEGRAM_TOKEN` di Worker secrets
  * Gemini : aistudio.google.com/apikey → delete + bikin baru → update `GEMINI_API_KEY` di HF Secrets
  * HF write token : huggingface.co/settings/tokens
