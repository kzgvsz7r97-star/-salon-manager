const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const ALLOWED_ORIGIN = 'https://kzgvsz7r97-star.github.io';

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Backup-Key');
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function outputText(body) {
  if (typeof body?.output_text === 'string' && body.output_text.trim()) {
    return body.output_text.trim();
  }

  return (body?.output || [])
    .flatMap(item => item?.content || [])
    .filter(part => part?.type === 'output_text' && part?.text)
    .map(part => part.text)
    .join('\n')
    .trim();
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const backupKey = process.env.BACKUP_KEY || '';
  const suppliedKey = String(req.headers['x-backup-key'] || '');
  if (!backupKey || !suppliedKey || suppliedKey !== backupKey) {
    return json(res, 401, { error: '認証できませんでした' });
  }

  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return json(res, 503, { error: 'OPENAI_API_KEY未設定' });
  }

  const kind = req.body?.kind === 'story' ? 'story' : 'acquisition';
  const metrics = req.body?.metrics || {};
  const availability = Array.isArray(req.body?.availability)
    ? req.body.availability.slice(0, 7)
    : [];

  const facts = {
    goal: safeNumber(metrics.goal),
    forecast: safeNumber(metrics.forecast),
    gap: safeNumber(metrics.gap),
    unit: safeNumber(metrics.unit),
    needed: metrics.needed == null ? null : safeNumber(metrics.needed),
    remainingDays: safeNumber(metrics.remainingDays),
    perDay: metrics.perDay == null ? null : safeNumber(metrics.perDay),
    newVisits: safeNumber(metrics.newVisits),
    availability
  };

  const task = kind === 'story'
    ? `Instagramストーリー用の予約訴求文を1案だけ作る。空き枠は入力された日時をそのまま使い、存在しない枠を作らない。4〜7行程度。最初の1行は短いフック。最後は予約リンクかDMへのCTA。`
    : `今日使う新規集客文を1案だけ作る。目標までの不足人数と残り営業日を踏まえ、レイヤーカット・顔まわり・透明感カラーの予約につながる短い訴求にする。Instagramストーリーまたは予約媒体にそのまま転用できる5〜8行程度。最後は予約・相談CTA。`;

  const prompt = `
あなたは原宿の美容師向け集客アシスタントです。
優先順位そのものはアプリ側で目標差から計算済みです。あなたは文章だけを作ってください。

ターゲット：18〜25歳女性。
得意：似合わせレイヤー、顔まわり、小顔見えの設計、透明感カラー。
トーン：短い、自然、少し可愛い。煽りすぎない。説明しすぎない。赤裸々な売上額はお客様向け文章に書かない。
禁止：予約が埋まっているように見せる虚偽、入力にない空き枠の捏造、No.1など根拠のない表現。

今日の目標データ：
${JSON.stringify(facts)}

依頼：
${task}

完成文だけを返してください。前置き・解説・見出しは不要です。
  `.trim();

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        max_output_tokens: 260
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('OpenAI error', response.status, body?.error?.message || body);
      return json(res, 502, { error: 'AI文面を作れませんでした' });
    }

    const text = outputText(body);
    if (!text) {
      return json(res, 502, { error: 'AIの返答が空でした' });
    }

    return json(res, 200, { ok: true, text, model: MODEL });
  } catch (error) {
    console.error('goal-ai failed', error);
    return json(res, 500, { error: 'AI接続に失敗しました' });
  }
}
