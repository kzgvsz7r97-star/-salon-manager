const MODEL = process.env.OPENAI_MODEL || 'gpt-6-luna';
const ALLOWED_ORIGINS = new Set([
  'https://kzgvsz7r97-star.github.io',
  'https://salon-manager-kzgvsz7r97-star.vercel.app'
]);

function setCors(req, res) {
  const origin = req.headers.origin || '';

  if (
    ALLOWED_ORIGINS.has(origin)
  ) {
    res.setHeader(
      'Access-Control-Allow-Origin',
      origin
    );
  }

  res.setHeader(
    'Vary',
    'Origin'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Backup-Key'
  );
}
function json(res, status, body) {
  res
    .status(status)
    .setHeader(
      'Content-Type',
      'application/json; charset=utf-8'
    );

  res.end(
    JSON.stringify(body)
  );
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

const rawKind =
  String(req.body?.kind || '');

const kind =
  [
    'story',
    'nextbooking',
    'storydesign'
  ].includes(rawKind)
    ? rawKind
    : 'acquisition';

const imageData =
  String(
    req.body?.imageData || ''
  );
  if(kind === 'storydesign'){
  if(
    !/^data:image\/(jpeg|jpg|png|webp);base64,/i
      .test(imageData)
  ){
    return json(
      res,
      400,
      {
        error:
          '画像を確認してください'
      }
    );
  }

      const designPrompt = `
Instagramストーリー用の美容師の写真を分析してください。

ターゲット：
18〜25歳女性。

世界観：
上品、シンプル、大人可愛い。
安っぽくしない。
写真を主役にする。
文字を詰め込みすぎない。

目的：
この写真の上に「予約空き状況」の文字を載せます。

最重要ルール：
・顔に文字やパネルを被せない
・髪型、髪の質感、毛先に極力被せない
・人物の魅力を隠さない
・空いている背景を最優先で使う
・文字エリアは画面全体の35%以内
・写真の主役を邪魔する場合は文字を小さくする
・単にtop / center / bottomで決めず、実際の余白を見て判断する

必ず以下を分析してください：
1. 顔の位置
2. 髪の位置と広がり
3. 人物全体の位置
4. 背景の空いている場所
5. 明るい場所 / 暗い場所
6. 文字を置いても邪魔にならない領域

3案は必ず違うレイアウトにしてください。

使用できる値：

font:
"maru"
"mincho"
"gothic"

position:
"top"
"center"
"bottom"

textColor:
"white"
"black"

panel:
"none"
"softWhite"
"softBlack"

align:
"left"
"center"

size:
"small"
"medium"
"large"

さらに、文字配置の詳細を0〜100の割合で返してください。

x:
文字ブロック左端の横位置。

y:
文字ブロック上端の縦位置。

width:
30〜90。

maxHeight:
20〜35。

panelOpacity:
0〜0.75。

人物や髪に被る案はおすすめにしないでください。
3案とも同じ位置にしないでください。

必ずJSONだけを返してください。

形式：
{
  "recommended":0,
  "variants":[
    {
      "font":"mincho",
      "position":"top",
      "textColor":"black",
      "panel":"softWhite",
      "align":"left",
      "size":"small",
      "x":8,
      "y":8,
      "width":48,
      "maxHeight":28,
      "panelOpacity":0.45,
      "reason":"左上の背景に余白があり、顔と髪を避けられるため"
    },
    {
      "font":"maru",
      "position":"bottom",
      "textColor":"white",
      "panel":"softBlack",
      "align":"left",
      "size":"small",
      "x":7,
      "y":68,
      "width":52,
      "maxHeight":25,
      "panelOpacity":0.4,
      "reason":"人物を避けた背景側に小さく配置できるため"
    },
    {
      "font":"gothic",
      "position":"top",
      "textColor":"black",
      "panel":"none",
      "align":"center",
      "size":"small",
      "x":12,
      "y":7,
      "width":44,
      "maxHeight":24,
      "panelOpacity":0,
      "reason":"明るい余白のみを使い写真を最も邪魔しないため"
    }
  ]
}
`.trim();

  try{
    const response =
      await fetch(
        'https://api.openai.com/v1/responses',
        {
          method:'POST',

          headers:{
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${apiKey}`
          },

               body:JSON.stringify({
            model:MODEL,

            input:[
              {
                role:'user',

                content:[
                  {
                    type:
                      'input_text',

                    text:
                      designPrompt
                  },

                  {
                    type:
                      'input_image',

                    image_url:
                      imageData,

                    detail:'high'
                  }
                ]
              }
            ],

          max_output_tokens:4000,
reasoning:{
  effort:'low'
}
          })
        }
      );

    const body =
      await response
        .json()
        .catch(
          ()=>({})
        );

    if(!response.ok){
  const detail=
    body?.error?.message ||
    body?.error?.code ||
    JSON.stringify(body);

  console.error(
    'Story design AI error',
    response.status,
    detail
  );

  return json(
    res,
    502,
    {
      error:
        `写真を分析できませんでした: ${detail}`
    }
  );
}
    

    const text=
      outputText(body);

    if(!text){
      return json(
        res,
        502,
        {
          error:
            'AIの返答が空でした'
        }
      );
    }

    return json(
      res,
      200,
      {
        ok:true,
        text,
        model:MODEL
      }
    );

  }catch(error){
    console.error(
      'story design failed',
      error
    );

    return json(
      res,
      500,
      {
        error:
          '写真分析に失敗しました'
      }
    );
  }
}
const variationKey =
  String(req.body?.variationKey || '');

const variationMode =
  Number(req.body?.variationMode || 0);

const previousText =
  String(req.body?.previousText || '')
    .trim()
    .slice(0, 1200);

const metrics =
  req.body?.metrics || {};

const availability =
  Array.isArray(req.body?.availability)
    ? req.body.availability.slice(0, 7)
    : [];

const facts = {
  month: String(metrics.month || ''),
  goal: safeNumber(metrics.goal),
  forecast: safeNumber(metrics.forecast),
  gap: safeNumber(metrics.gap),
  unit: safeNumber(metrics.unit),
  needed:
    metrics.needed == null
      ? null
      : safeNumber(metrics.needed),
  remainingDays:
    safeNumber(metrics.remainingDays),
  perDay:
    metrics.perDay == null
      ? null
      : safeNumber(metrics.perDay),
  newVisits:
    safeNumber(metrics.newVisits),
  nextMissing:
    safeNumber(metrics.nextMissing),
  availability
};

const variationRules = [
  '一文目を短い質問から始める。CTAは柔らかくする。',
  '季節や髪の変化から始める。質問形の書き出しは使わない。',
  'かなり短めにする。絵文字は0〜1個だけ使う。',
  '来店後の状態を気遣う文から始め、最後を相談ベースで締める。',
  '少しカジュアルな口調にする。文の順番を普段と変える。',
  '落ち着いた文章にする。絵文字を使わず自然なLINE文にする。'
];

const variationRule =
  variationRules[
    Math.abs(variationMode) %
    variationRules.length
  ];

const task =
  kind === 'story'
    ? `Instagramストーリー用の予約訴求文を1案だけ作る。
空き枠は入力された日時のみ使用する。
4〜7行程度。
今回の変化ルール：${variationRule}`

    : kind === 'nextbooking'
      ? `今月来店済みで次回予約がまだ決まっていないお客様へ送るLINEまたはDMを1案作る。
monthに合う季節感や髪の悩みを自然に入れる。
売り込み感は強くしない。
4〜7行程度。
名前や予約日時は勝手に作らない。
今回の変化ルール：${variationRule}`

      : `今日使う新規集客文を1案作る。
レイヤーカット・顔まわり・透明感カラーの予約につながる内容にする。
5〜8行程度。
今回の変化ルール：${variationRule}`;

const prompt = `
あなたは原宿の美容師向け文章作成アシスタントです。

ターゲット：18〜25歳女性。
得意：似合わせレイヤー、顔まわり、小顔見えの設計、透明感カラー。

自然な日本語で、美容師本人が送っているような文章にしてください。

今回のvariationKey：
${variationKey}

前回生成した文章：
${previousText || 'なし'}

重要：
前回文章がある場合、同じ文章を返してはいけません。
特に一文目は前回と同じ書き出しにしないでください。

前回から最低でも3つ、
・書き出し
・文の順番
・言い回し
・語尾
・CTA
・絵文字
のどれかを変えてください。

単なるほぼ同じ文章の言い換えではなく、
読んだ時に別パターンだと分かる程度に変えてください。

ただし奇抜、不自然、営業感が強すぎる文章にはしないでください。

禁止：
虚偽の空き状況。
入力にない日時。
根拠のないNo.1表現。
お客様向け文章への売上額の記載。

データ：
${JSON.stringify(facts)}

依頼：
${task}

完成文だけを返してください。
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
