import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => {
      chunks.push(Buffer.from(chunk));
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', reject);
  });
}

function validSignature(raw, signature, secret) {
  if (!signature || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(raw)
    .digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}

async function replyMessage(replyToken, text, token) {
  return fetch(
    'https://api.line.me/v2/bot/message/reply',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        replyToken,
        messages: [
          {
            type: 'text',
            text
          }
        ]
      })
    }
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const secret = process.env.LINE_CHANNEL_SECRET;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!secret || !token) {
    return res.status(500).json({
      ok: false,
      error: 'LINE environment variables are missing'
    });
  }

  try {
    const raw = await readRawBody(req);
    const signature = req.headers['x-line-signature'];

    if (!validSignature(raw, signature, secret)) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid signature'
      });
    }

    const body = JSON.parse(raw.toString('utf8'));

    for (const event of body.events || []) {
      const userId = event?.source?.userId || '';

      if (
        event.type === 'message' &&
        event.message?.type === 'text' &&
        event.message.text.trim() === '連携ID' &&
        event.replyToken &&
        userId
      ) {
        await replyMessage(
          event.replyToken,
          `LINE連携ID\n${userId}`,
          token
        );
      }
    }

    return res.status(200).json({
      ok: true
    });

  } catch (e) {
    console.error(e);

    return res.status(500).json({
      ok: false,
      error: 'Webhook failed'
    });
  }
}
