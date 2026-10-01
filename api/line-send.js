const ALLOWED_ORIGIN = 'https://kzgvsz7r97-star.github.io';

function setCors(req, res) {
  const origin = req.headers.origin || '';

  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Salon-Key'
  );
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  if (
    !process.env.SALON_APP_KEY ||
    req.headers['x-salon-key'] !== process.env.SALON_APP_KEY
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      ok: false,
      error: 'LINE token is not configured'
    });
  }

  const { userId, text } = req.body || {};

  const id = String(userId || '').trim();
  const message = String(text || '').trim();

  if (!/^U[0-9a-f]{32}$/i.test(id)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid LINE userId'
    });
  }

  if (!message || message.length > 5000) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid message'
    });
  }

  try {
    const r = await fetch(
      'https://api.line.me/v2/bot/message/push',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          to: id,
          messages: [
            {
              type: 'text',
              text: message
            }
          ]
        })
      }
    );

    const raw = await r.text();

    let body = {};

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw };
    }

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        line: body
      });
    }

    return res.status(200).json({
      ok: true
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: 'LINE request failed'
    });
  }
}
