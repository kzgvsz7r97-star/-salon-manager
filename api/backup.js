const ALLOWED_ORIGINS = new Set([
  'https://salon-manager-kzgvsz7r97-star.vercel.app',
  'https://kzgvsz7r97-star.github.io'
]);

function setCors(req, res) {
  const origin = req.headers.origin || '';

  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Backup-Key'
  );
}

function authorized(req) {
  return (
    process.env.BACKUP_KEY &&
    req.headers['x-backup-key'] === process.env.BACKUP_KEY
  );
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SECRET_KEY;

  return {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`
  };
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!authorized(req)) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!base || !secret) {
    return res.status(500).json({
      ok: false,
      error: 'Supabase is not configured'
    });
  }

  try {
    if (req.method === 'POST') {
      const data = req.body?.data;

      if (!data || typeof data !== 'object') {
        return res.status(400).json({
          ok: false,
          error: 'Invalid backup data'
        });
      }

      const r = await fetch(
        `${base}/rest/v1/salon_backups`,
        {
          method: 'POST',
          headers: {
            ...supabaseHeaders(),
            Prefer: 'return=representation'
          },
          body: JSON.stringify({ data })
        }
      );

      const raw = await r.text();

      if (!r.ok) {
        return res.status(r.status).json({
          ok: false,
          error: raw || 'Backup failed'
        });
      }

      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const r = await fetch(
        `${base}/rest/v1/salon_backups?select=id,created_at,data&order=created_at.desc&limit=10`,
        {
          headers: supabaseHeaders()
        }
      );

      const raw = await r.text();

      if (!r.ok) {
        return res.status(r.status).json({
          ok: false,
          error: raw || 'Restore failed'
        });
      }

      return res.status(200).json({
        ok: true,
        backups: raw ? JSON.parse(raw) : []
      });
    }

    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: 'Backup API failed'
    });
  }
}
