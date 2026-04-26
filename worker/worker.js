/**
 * Cloudflare Worker — Telegram bot bridge for al-Bidayah wan-Nihayah search.
 *
 * Architecture:
 *   Telegram → POST webhook → THIS Worker → POST /query → HF Space backend
 *                                          ←  JSON answer ←
 *   THIS Worker → Telegram sendMessage → user
 *
 * Required environment variables (set in Cloudflare dashboard → Settings → Variables):
 *   TELEGRAM_TOKEN     — bot token from @BotFather
 *   HF_BACKEND_URL     — full URL to HF Space, e.g. https://raaf-gpt-bidaya-nihaya-bot.hf.space
 *   BACKEND_API_KEY    — shared secret with HF Space
 *   WEBHOOK_SECRET     — random string, used as URL path so randos can't spam our webhook
 */

const WELCOME = `ٱلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ ٱللَّٰهِ وَبَرَكَاتُهُ

Ini adalah bot pencari kitab al-Bidayah wan-Nihayah karya Ibn Katsir rahimahullah.

cara pakai:
- ketik pertanyaan langsung, atau
- /tanya [pertanyaan]

contoh:
kapan wafat Khalid bin Walid
ceritakan pertempuran yarmuk
/tanya kisah masuk islam Umar bin Khattab
/tanya sahabat yang syahid di uhud

bot akan mencari data di 21 jilid kitab dan menjawab dengan kutipan halaman.

sumber: edisi al-Turki (دار هجر، 2003)
shamela.ws/book/4445

dibuat oleh Abu Rafi semoga menjadi sadaqah jariyah إِنْ شَاءَ ٱللَّٰهُ
semoga bermanfaat. Baarakallaahu fiikum`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return new Response('bidaya-bot worker is alive', { status: 200 });
    }

    // Diagnostic endpoint — checks env vars are set (without leaking values)
    if (url.pathname === '/debug') {
      return Response.json({
        TELEGRAM_TOKEN: env.TELEGRAM_TOKEN ? `set (${env.TELEGRAM_TOKEN.length} chars)` : 'MISSING',
        HF_BACKEND_URL: env.HF_BACKEND_URL || 'MISSING',
        BACKEND_API_KEY: env.BACKEND_API_KEY ? `set (${env.BACKEND_API_KEY.length} chars)` : 'MISSING',
        WEBHOOK_SECRET: env.WEBHOOK_SECRET ? `set (${env.WEBHOOK_SECRET.length} chars)` : 'MISSING',
        STATS_KV: env.STATS ? 'bound' : 'MISSING',
      });
    }

    // Public stats endpoint — protected by WEBHOOK_SECRET in URL path
    // Serves HTML to browsers, JSON to API clients (or .json suffix)
    if (url.pathname === `/stats/${env.WEBHOOK_SECRET}` ||
        url.pathname === `/stats/${env.WEBHOOK_SECRET}.json`) {
      if (!env.STATS) {
        return Response.json({ error: 'STATS KV not bound' }, { status: 500 });
      }
      const userList = await env.STATS.list({ prefix: 'u:', limit: 1000 });
      const start = parseInt((await env.STATS.get('c:start')) || '0', 10);
      const tanya = parseInt((await env.STATS.get('c:tanya')) || '0', 10);
      const plain = parseInt((await env.STATS.get('c:plain')) || '0', 10);
      const help = parseInt((await env.STATS.get('c:help')) || '0', 10);
      const newUsers = parseInt((await env.STATS.get('c:new_users')) || '0', 10);
      const data = {
        unique_users: userList.keys.length,
        new_users_counter: newUsers,
        total_starts: start,
        total_queries: tanya + plain,
        total_events: start + tanya + plain + help,
        breakdown: { start, tanya, plain, help },
      };

      const wantsJson = url.pathname.endsWith('.json')
        || !(request.headers.get('Accept') || '').includes('text/html');
      if (wantsJson) {
        return Response.json(data, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        });
      }

      return new Response(renderStatsHtml(data), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    // Webhook path includes WEBHOOK_SECRET so only Telegram can reach it.
    if (url.pathname === `/webhook/${env.WEBHOOK_SECRET}` && request.method === 'POST') {
      // Parse JSON BEFORE returning, so request body is consumed in the right context.
      let update;
      try {
        update = await request.json();
      } catch (e) {
        console.error('Failed to parse webhook JSON:', e);
        return new Response('OK', { status: 200 });
      }
      ctx.waitUntil(handleUpdate(update, env));
      return new Response('OK', { status: 200 });
    }

    return new Response('not found', { status: 404 });
  },
};

async function handleUpdate(update, env) {
  try {
    const message = update.message;
    if (!message || !message.text) {
      console.log('No message or text in update');
      return;
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    console.log(`Update from chat ${chatId}: ${text.slice(0, 80)}`);

    // Analytics — only tracks if STATS (KV namespace) binding is configured
    const eventType = (text === '/start' || text.startsWith('/start ')) ? 'start'
                    : (text === '/help' || text.startsWith('/help ')) ? 'help'
                    : (text.toLowerCase().startsWith('/tanya') ? 'tanya' : 'plain');
    if (env.STATS) {
      try {
        const userKey = `u:${chatId}`;
        const existing = await env.STATS.get(userKey);
        if (!existing) {
          await env.STATS.put(userKey, new Date().toISOString());
          const newUserCount = parseInt((await env.STATS.get('c:new_users')) || '0', 10);
          await env.STATS.put('c:new_users', String(newUserCount + 1));
        }
        const eventCount = parseInt((await env.STATS.get(`c:${eventType}`)) || '0', 10);
        await env.STATS.put(`c:${eventType}`, String(eventCount + 1));
      } catch (e) {
        console.error('Stats write failed:', e);
      }
    }

    if (text === '/start' || text === '/help' || text.startsWith('/start ') || text.startsWith('/help ')) {
      await sendMessage(env, chatId, WELCOME);
      return;
    }

    let query = text;
    if (text.toLowerCase().startsWith('/tanya')) {
      query = text.slice('/tanya'.length).trim();
    }

    if (!query) {
      await sendMessage(env, chatId, 'kasih pertanyaan dong, contoh:\n/tanya pertempuran badar');
      return;
    }
    if (query.length > 500) {
      await sendMessage(env, chatId, 'pertanyaannya kepanjangan, max 500 karakter ya.');
      return;
    }

    const placeholder = await sendMessage(env, chatId, 'sebentar, lagi cari di 21 jilid ...');
    const placeholderId = placeholder?.result?.message_id;

    try {
      const res = await fetch(`${env.HF_BACKEND_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': env.BACKEND_API_KEY,
        },
        body: JSON.stringify({ text: query }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`backend ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const answer = data.answer || '(jawaban kosong)';

      if (placeholderId) {
        await editMessage(env, chatId, placeholderId, answer);
      } else {
        await sendMessage(env, chatId, answer);
      }
    } catch (e) {
      console.error('Query handling error:', e);
      const msg = `maaf, ada error: ${e.message}\nsilakan coba lagi sebentar.`;
      if (placeholderId) {
        await editMessage(env, chatId, placeholderId, msg);
      } else {
        await sendMessage(env, chatId, msg);
      }
    }
  } catch (outer) {
    console.error('handleUpdate outer error:', outer);
  }
}

async function sendMessage(env, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true }),
    });
    const data = await res.json().catch(() => null);
    if (!data || !data.ok) {
      console.error('sendMessage failed:', res.status, data);
    }
    return data;
  } catch (e) {
    console.error('sendMessage threw:', e);
    return null;
  }
}

function renderStatsHtml(d) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BidayahWanNihayah Search — Stats</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 2rem 1rem; background: #f6f7f9; color: #1a1a1a; line-height: 1.5; }
  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 700; }
  .subtitle { color: #6b7280; font-size: 0.875rem; margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.25rem; }
  .num { font-size: 2.25rem; font-weight: 700; line-height: 1; color: #111; }
  .label { color: #6b7280; font-size: 0.8rem; margin-top: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .breakdown { margin-top: 1rem; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.25rem; }
  .breakdown h2 { margin: 0 0 0.75rem; font-size: 0.9rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 0.625rem 0; border-bottom: 1px solid #f3f4f6; }
  .row:last-child { border-bottom: none; }
  .row-label { color: #374151; }
  .row-val { font-weight: 600; color: #111; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 1.5rem; text-align: center; color: #9ca3af; font-size: 0.75rem; }
  .footer a { color: inherit; text-decoration: none; }
  .footer a:hover { text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #e5e7eb; }
    .card, .breakdown { background: #1a1c20; border-color: #2a2d33; }
    .num, .row-val { color: #f3f4f6; }
    .row-label { color: #d1d5db; }
    .row { border-bottom-color: #2a2d33; }
  }
</style>
</head>
<body>
<h1>BidayahWanNihayah Search — Stats</h1>
<div class="subtitle"><a href="https://t.me/bidaya_nihaya_search_bot" style="color:inherit">@bidaya_nihaya_search_bot</a></div>

<div class="grid">
  <div class="card"><div class="num">${d.unique_users}</div><div class="label">Unique Users</div></div>
  <div class="card"><div class="num">${d.total_queries}</div><div class="label">Total Pertanyaan</div></div>
  <div class="card"><div class="num">${d.total_starts}</div><div class="label">Bot Dibuka</div></div>
  <div class="card"><div class="num">${d.total_events}</div><div class="label">Total Pesan</div></div>
</div>

<div class="breakdown">
  <h2>Breakdown per tipe</h2>
  <div class="row"><span class="row-label">/start</span><span class="row-val">${d.breakdown.start}</span></div>
  <div class="row"><span class="row-label">/tanya</span><span class="row-val">${d.breakdown.tanya}</span></div>
  <div class="row"><span class="row-label">pesan langsung</span><span class="row-val">${d.breakdown.plain}</span></div>
  <div class="row"><span class="row-label">/help</span><span class="row-val">${d.breakdown.help}</span></div>
</div>

<div class="footer">data realtime · last loaded ${ts}</div>
</body>
</html>`;
}

async function editMessage(env, chatId, messageId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: text,
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!data || !data.ok) {
      console.error('editMessage failed:', res.status, data);
    }
  } catch (e) {
    console.error('editMessage threw:', e);
  }
}
