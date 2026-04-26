# Cloudflare Worker — Bidaya Bot Bridge

Glue layer between Telegram and the HF Space backend, since HF Spaces blocks outbound traffic to `api.telegram.org`.

## Deploy

### Option A — via dashboard (easiest, ~5 minutes)

1. Login to https://dash.cloudflare.com
2. Left sidebar → **Workers & Pages**
3. Click **Create** → **Create Worker**
4. Name: `bidaya-bot` (or whatever — this becomes part of the URL)
5. Click **Deploy** (uses default Hello World template for now)
6. After deploy, click **Edit code**
7. Replace the entire `worker.js` content with the file in this folder
8. Click **Save and deploy**
9. Note the URL shown (e.g. `https://bidaya-bot.<your-subdomain>.workers.dev`)

### Option B — via wrangler CLI

```bash
npm install -g wrangler
wrangler login
cd worker/
wrangler deploy worker.js --name bidaya-bot
```

## Set environment variables

In dashboard → your Worker → **Settings** → **Variables and Secrets** → **Add variable** for each:

| Name | Type | Value |
|------|------|-------|
| `TELEGRAM_TOKEN` | Secret | `8610890708:AAHTAqJtHP8hcAezWtE173hSbmO9lV79kII` |
| `HF_BACKEND_URL` | Plaintext | `https://raaf-gpt-bidaya-nihaya-bot.hf.space` |
| `BACKEND_API_KEY` | Secret | (from `akses.txt`) |
| `WEBHOOK_SECRET` | Secret | any random string ≥ 16 chars |

After adding, click **Deploy** to apply.

## Register Telegram webhook

Once Worker URL is live and env vars are set, point Telegram at it:

```bash
curl "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=https://bidaya-bot.<your-subdomain>.workers.dev/webhook/${WEBHOOK_SECRET}"
```

Should return `{"ok":true,"result":true,"description":"Webhook was set"}`.

Verify:
```bash
curl "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getWebhookInfo"
```

## Test

Send `/start` to the bot in Telegram. Welcome message should appear.
