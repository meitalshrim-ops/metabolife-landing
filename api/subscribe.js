// Serverless proxy: מקבל שם+מייל מהטופס ומוסיף את הליד לרשימה ברב מסר (Responder v2).
// המפתחות הסודיים יושבים ב-Environment Variables של Vercel ולא נחשפים בדפדפן.
const TOKEN_URL = 'https://graph.responder.live/v2/oauth/token';
const SUBS_URL  = 'https://graph.responder.live/v2/subscribers';

const ALLOWED_ORIGINS = [
  'https://meitalshrim-ops.github.io',
  'https://metabolife-landing.vercel.app'
];

function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.indexOf(origin) > -1 ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method' }); return; }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const name  = String(body.name  || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().slice(0, 200);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) { res.status(400).json({ ok: false, error: 'email' }); return; }

    const listId = parseInt(process.env.RAV_LIST_ID || '103192', 10);

    // פיצול "שם מלא" לשם פרטי + משפחה (Responder משתמש ב-first/last/name, לא first_name)
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts.shift() || name;
    const last = parts.join(' ');

    // 1) קבלת token
    const tr = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        scope: '*',
        client_id: parseInt(process.env.RAV_CLIENT_ID, 10),
        client_secret: process.env.RAV_CLIENT_SECRET,
        user_token: process.env.RAV_USER_TOKEN
      })
    });
    const tj = await tr.json().catch(() => ({}));
    const token = tj.access_token || tj.token;
    if (!token) { res.status(502).json({ ok: false, error: 'token' }); return; }

    // 2) הוספת הנרשם לרשימה
    const sr = await fetch(SUBS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ email: email, name: name, first: first, last: last, list_ids: [listId], override: true })
    });
    const sj = await sr.json().catch(() => ({}));

    if (sj && sj.status) {
      res.status(200).json({ ok: true, duplicate: !!sj.duplicate });
    } else {
      res.status(200).json({ ok: false, error: 'subscribe' });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server' });
  }
};
