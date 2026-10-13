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
・最優先は「顔に絶対に被せない」こと
・文字もパネルも、顔・目・鼻・口・輪郭に少しでも重ねない
・顔の周囲にも余白を取り、ギリギリまで近づけない
・次に、できるだけ髪型・前髪・毛先・髪の質感にも被せない
・人物の魅力を隠さない
・写真の下側に十分な安全余白がある場合は、下配置を第一候補にする
・下側が使えない場合のみ、左上・右上など他の余白を候補にする
・単にtop / center / bottomで決めず、実際の余白を見て判断する
・文字エリアは画面全体の35%以内
・写真の主役を邪魔する場合は文字を小さくする

配置の優先順位：
1. 顔に絶対に被らない
2. できるだけ髪にも被らない
3. 下側の余白が十分なら下を優先
4. 下が使えない場合は上側や左右の余白を使う
5. 読みやすさより、人物を隠さないことを優先

必ず以下を分析してください：
1. 顔の位置と、その周囲の安全マージン
2. 髪の位置と広がり
3. 人物全体の位置
4. 下側の空き領域
5. 上側・左右の空き領域
6. 明るい場所 / 暗い場所
7. 文字を置いても人物を邪魔しない領域

3案の作り方：
・顔に被る案は1つも出さない
・安全な下側余白がある場合、recommendedは原則として下配置にする
・3案は必ず配置座標を変える
・少なくとも2案は y を10以上離す
・少なくとも2案は x を8以上離す
・同じ x / y の組み合わせを3案で使わない
・安全な下側余白がある場合、1案目は下側を優先する
・2案目は上側または左右の別余白を使う
・3案目は1案目・2案目と違う安全領域を使う
・安全な余白が1か所しかない場合のみ、同じ領域内で位置を少しずらしてよい
・顔や髪に重なるくらいなら、3案の差を小さくしてよい

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

重要：
・実際の配置は position ではなく x / y を優先して決める
・下配置なら y は55〜78を目安にする
・上配置なら y は5〜28を目安にする
・中央配置なら y は32〜52を目安にする
・3案の x / y を同じにしない
・顔にかかる配置は禁止

必ずJSONだけを返してください。

形式：
{
  "recommended":0,
  "variants":[
    {
      "font":"mincho",
      "position":"bottom",
      "textColor":"black",
      "panel":"softWhite",
      "align":"left",
      "size":"small",
      "x":8,
      "y":66,
      "width":46,
      "maxHeight":25,
      "panelOpacity":0.4,
      "reason":"下側の安全な余白を使えるため"
    },
    {
      "font":"maru",
      "position":"top",
      "textColor":"black",
      "panel":"softWhite",
      "align":"left",
      "size":"small",
      "x":7,
      "y":9,
      "width":42,
      "maxHeight":24,
      "panelOpacity":0.35,
      "reason":"上側の別の余白を使えるため"
    },
    {
      "font":"gothic",
      "position":"bottom",
      "textColor":"white",
      "panel":"softBlack",
      "align":"center",
      "size":"small",
      "x":44,
      "y":70,
      "width":43,
      "maxHeight":23,
      "panelOpacity":0.38,
      "reason":"下側の右寄りに別の安全領域があるため"
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
