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
