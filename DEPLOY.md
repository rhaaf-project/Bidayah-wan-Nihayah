# Deploy Guide — al-Bidayah wan-Nihayah Search Bot

Panduan lengkap deploy bot dari nol. Total waktu : ~30-45 menit.

## Yang dibutuhkan (semua gratis)

* Akun **Google** untuk Gemini API
* Akun **Hugging Face** (sign up gratis di huggingface.co)
* Akun **Cloudflare** (sign up gratis di cloudflare.com)
* Akun **Telegram** + akses ke @BotFather
* Akun **cron-job.org** (sign up gratis, untuk keepalive)
* Python 3.10+ lokal (opsional, untuk testing sebelum deploy)
* Git + Git LFS lokal

## Step 1 — Generate Gemini API Key (~2 menit)

1. Buka https://aistudio.google.com/apikey
2. Login dengan akun Google
3. Klik **Create API key** → pilih **Create API key in new project** (jangan pilih project Cloud Console lama, sering 403)
4. Copy key, simpan aman. Format `AIzaSy...`

## Step 2 — Bikin Telegram bot (~3 menit)

1. Buka Telegram, chat **@BotFather**
2. Ketik `/newbot`
3. Kasih nama display (bebas, contoh : "Bidaya Nihaya Search")
4. Kasih username (harus ending `_bot`, unik global, contoh : `bidaya_nihaya_search_bot`)
5. BotFather kasih **token** format `12345:ABC...` — copy, simpan aman

Set deskripsi/tentang/foto (opsional) :
* `/setdescription` → pilih bot → paste description text
* `/setabouttext` → pilih bot → paste about text
* `/setuserpic` → pilih bot → upload foto

## Step 3 — Deploy HF Space backend (~10 menit)

### 3.1 Bikin Space

1. Login https://huggingface.co
2. Avatar pojok kanan → **+ New Space**
3. Isi :
   * **Owner** : pilih (otomatis username lo)
   * **Space name** : `bidaya-nihaya-bot`
   * **License** : `mit`
   * **SDK** : klik **Docker** → template **Blank**
   * **Hardware** : **CPU basic - Free**
   * **Visibility** : Public atau Private (terserah)
4. Klik **Create Space**

### 3.2 Set 2 Secrets

Di halaman Space → tab **Settings** → scroll ke **Variables and secrets** → klik **New secret** dua kali :

| Name | Value |
|------|-------|
| `GEMINI_API_KEY` | (key dari Step 1) |
| `BACKEND_API_KEY` | random string panjang, generate dengan `python -c "import secrets; print(secrets.token_urlsafe(32))"` |

⚠️ Simpan `BACKEND_API_KEY` — bakal dipake juga di Worker (Step 4).

### 3.3 Bikin HF write token

1. https://huggingface.co/settings/tokens → **+ Create new token**
2. Tab **Write** (paling gampang) atau Fine-grained dengan write access ke Space
3. Token name : `bidaya-bot-deploy`
4. Klik **Create token** → copy `hf_xxx`, simpan aman

### 3.4 Push code

```bash
# Clone HF Space repo (kosong)
git clone https://USERNAME:hf_TOKEN@huggingface.co/spaces/USERNAME/bidaya-nihaya-bot hf-space
cd hf-space

# Copy bot files dari project
cp ../bot/main.py .
cp ../bot/search.py .
cp ../bot/llm.py .
cp ../bot/requirements.txt .
cp ../bot/Dockerfile .
cp ../bot/README.md .
cp ../bot/.gitignore .

# Copy corpus (22 MB, perlu git LFS)
mkdir -p corpus
cp ../corpus/bidaya_arab.txt corpus/

# Tambah LFS rule untuk corpus
echo "" >> .gitattributes
echo "corpus/bidaya_arab.txt filter=lfs diff=lfs merge=lfs -text" >> .gitattributes

# Set git identity
git config user.email "you@example.com"
git config user.name "Your Name"

# Commit + push
git add .
git commit -m "Initial deploy"
git push
```

### 3.5 Tunggu build

HF auto-build Docker container (~3-5 menit). Cek di tab Logs. Sukses kalo ada line :
```
INFO bidaya-bot: Corpus ready: 13095 page-chunks indexed.
```

Test endpoint :
```bash
curl https://USERNAME-bidaya-nihaya-bot.hf.space/health
# {"status":"ok","chunks_loaded":13095}
```

## Step 4 — Deploy Cloudflare Worker (~7 menit)

### 4.1 Bikin Worker

1. Login https://dash.cloudflare.com
2. Sidebar kiri → **Compute (Workers)** atau **Workers & Pages**
3. Klik **Create** → **Create Worker**
4. Worker name : `bidaya-bot`
5. Pilih **Start with Hello World!**
6. Klik **Deploy**

URL Worker : `https://bidaya-bot.<your-subdomain>.workers.dev` — catat.

### 4.2 Replace code

1. Klik **Edit code** (kanan atas)
2. Ctrl+A → Delete → paste isi `worker/worker.js` lengkap
3. Klik **Save and deploy**

### 4.3 Set 4 environment variables

Tab **Settings** → **Variables and Secrets** → tambah 4 :

| Name | Type | Value |
|------|------|-------|
| `TELEGRAM_TOKEN` | **Secret** | token dari Step 2 |
| `HF_BACKEND_URL` | Plaintext | `https://USERNAME-bidaya-nihaya-bot.hf.space` |
| `BACKEND_API_KEY` | **Secret** | sama persis dengan yang di HF (Step 3.2) |
| `WEBHOOK_SECRET` | **Secret** | random string, generate `python -c "import secrets; print(secrets.token_urlsafe(24))"` |

⚠️ Setelah tambah env vars, **klik Deploy lagi** atau pencet button "Deploy" di banner kuning — kalo ga, var-nya ga ke-apply.

### 4.4 Verify env vars terbaca

```bash
curl https://bidaya-bot.<your-subdomain>.workers.dev/debug
# {"TELEGRAM_TOKEN":"set (46 chars)","HF_BACKEND_URL":"...","BACKEND_API_KEY":"set (43 chars)","WEBHOOK_SECRET":"set (32 chars)"}
```

Kalo ada `MISSING`, balik ke Settings, delete + re-add var tersebut, click Deploy lagi.

## Step 5 — Register Telegram webhook (~1 menit)

```bash
TOKEN="your_telegram_token_from_step_2"
WEBHOOK_SECRET="your_webhook_secret_from_step_4"
WORKER_URL="https://bidaya-bot.<your-subdomain>.workers.dev"

curl "https://api.telegram.org/bot${TOKEN}/setWebhook?url=${WORKER_URL}/webhook/${WEBHOOK_SECRET}"
# {"ok":true,"result":true,"description":"Webhook was set"}

# Verify :
curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
# Should show your worker URL + pending_update_count: 0
```

## Step 6 — Setup keepalive cron (~3 menit)

HF Spaces pause setelah 48 jam tanpa traffic. Worker pings HF setiap user query, tapi kalo ga ada user 2 hari, Space mati. Solusi : ping `/health` tiap 25-30 menit pake cron eksternal.

1. Sign up gratis di https://cron-job.org
2. Verify email
3. Klik **CREATE CRONJOB** :
   * **Title** : `bidaya-bot keepalive`
   * **URL** : `https://USERNAME-bidaya-nihaya-bot.hf.space/health`
   * **Schedule** : Every 30 minutes (atau Every 25 menit kalo paranoid)
4. Klik **CREATE**

Cek History tab setelah 30 menit — harus muncul status 200 OK.

## Step 7 — Test

Buka Telegram, chat bot lo. Coba `/start` (welcome message), lalu `/tanya kapan wafat khalid bin walid` atau pertanyaan apapun.

Jawaban harus muncul dalam 5-10 detik dengan sitasi format `Jilid X hal Y`.

---

## Troubleshooting

### Bot ga respond di Telegram

1. Check Worker `/debug` — semua env var harus `set`
2. Check Worker logs (CF dashboard → Worker → Observability/Logs)
3. Check HF Space stage : `curl -H "Authorization: Bearer hf_TOKEN" https://huggingface.co/api/spaces/USERNAME/bidaya-nihaya-bot/runtime`
4. Check Telegram webhook info : `curl https://api.telegram.org/botTOKEN/getWebhookInfo`

### HF Space "in error"

* Cek tab Logs di Space — biasanya stack trace jelas
* Common issue : `BACKEND_API_KEY` env var hilang → container crash on startup
* Solusi : verify Secrets tab di Settings, restart Space (Settings → Factory rebuild)

### Gemini "403 PERMISSION_DENIED"

* API key bukan dari AI Studio (Cloud Console keys sering 403)
* Generate ulang via aistudio.google.com/apikey, **pilih "Create in new project"**

### "Telegram TimedOut" di HF logs

* Konfirmasi : HF Spaces emang block outbound ke api.telegram.org
* Pastikan main.py tidak punya kode Telegram polling (harus pure Flask backend)

### Cron-job.org limit

Free tier unlimited untuk schedule >= 1 menit. Kalo butuh < 1 menit, harus paid.

---

## Update bot setelah deploy

### Update HF backend code

```bash
cd hf-space  # local clone of HF Space repo
cp ../bot/main.py .  # atau file lain yang berubah
git add .
git commit -m "your message"
git push
```

HF auto-rebuild ~3 menit.

### Update Worker code

Edit di CF dashboard → Worker → Edit code → paste new content → Save and deploy.

Atau pakai wrangler CLI :
```bash
npm install -g wrangler
wrangler login
cd worker/
wrangler deploy worker.js --name bidaya-bot
```

### Update env vars / secrets

* HF : Settings → Variables and Secrets → edit
* Worker : Settings → Variables and Secrets → delete + re-add → **Deploy**
* Telegram webhook : panggil `setWebhook` ulang dengan URL baru

---

## Biaya kalo trafik naik

| trafik | rekomendasi |
|--------|-------------|
| < 1500 query/hari | tetap free tier semua |
| 1500-15000 query/hari | upgrade Gemini ke pay-as-you-go (~Rp 4.800 per 1000 query) ATAU switch ke Groq Llama 3.3 70B (14.400 req/hari free) |
| 15000-50000 query/hari | tetap di Worker free, tapi Gemini paid (~Rp 240k/bulan) |
| \> 100k req/hari Worker | upgrade Cloudflare Workers Paid ($5/bulan, 10M req/bulan) |
