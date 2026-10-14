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
function normalizeCurrentDate(value) {
  const raw = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return new Date().toISOString().slice(0, 10);
}

function visitPeriodFromCurrentDate(currentDate) {
  const [year, month, day] =
    currentDate.split('-').map(Number);

  const previousMonthDate =
    new Date(Date.UTC(year, month - 2, 1));

  const previousMonth =
    previousMonthDate.getUTCMonth() + 1;

  if (day <= 15) {
    return `${previousMonth}月頭〜${previousMonth}月中旬`;
  }

  return `${previousMonth}月中旬〜${previousMonth}月末`;
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
今っぽいSNS感。
安っぽくしない。
写真を主役にする。
文字を詰め込みすぎない。

目的：
この写真の上に「予約空き状況」の文字を載せます。

配置ルール：
・文字位置は下側固定
・最優先は「顔に絶対に被せない」こと
・顔、目、鼻、口、輪郭に文字やパネルを重ねない
・顔の周囲にも余白を取る
・できるだけ前髪、毛先、髪型の重要部分にも被せない
・下側の中で、人物を避けて左右位置を調整する
・上側や中央には配置しない
・yは原則64〜76の範囲にする

文字サイズ：
・基本は小さめ
・ただし、読みにくい場合はmediumまで上げてよい
・「できるだけ小さく、でも一目で読める」を優先
・largeは基本使わない

フォント選定：
・写真の雰囲気と18〜25歳女性向けSNSデザインに合わせて毎回判断する
・上品、大人っぽい、抜け感 → mincho
・やわらかい、可愛い、親しみやすい → maru
・シンプル、韓国っぽい、洗練、読みやすさ重視 → gothic
・毎回同じフォントに固定しない
・写真に一番合うものを優先する

文字背景パネル：
・写真に合わせて「なし / softWhite / softBlack」を判断する
・背景がシンプルで文字が十分読める場合はpanel:"none"
・背景が暗い、情報量が多い、黒文字を使いたい場合はsoftWhiteを検討
・背景が明るい、白文字を使いたい場合はsoftBlackを検討
・必要以上にパネルを付けない
・写真を隠さないよう透明度は低めにする

文字色：
・背景とのコントラストを見てwhite / blackを選ぶ
・読みやすさを最優先にする

配置幅：
・横幅は写真に合わせて調整
・人物を避けつつ、文字が不自然に細くならない幅にする
・基本は40〜60程度

3案の作り方：
・3案とも位置は下側固定
・違いはフォント、文字色、パネル有無、パネル濃度、横位置、横幅、文字サイズで出す
・3案とも同じ見た目にしない
・顔に被る案は1つも出さない
・recommendedは最も読みやすく、写真の雰囲気に合う案を選ぶ

使用できる値：

font:
"maru"
"mincho"
"gothic"

position:
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

x:
文字ブロック左端の横位置。
0〜100。

y:
64〜76。

width:
35〜65。

maxHeight:
20〜28。

panelOpacity:
0〜0.55。

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
      "y":68,
      "width":48,
      "maxHeight":24,
      "panelOpacity":0.32,
      "reason":"写真が上品で、下側左寄りが読みやすいため"
    },
    {
      "font":"gothic",
      "position":"bottom",
      "textColor":"white",
      "panel":"softBlack",
      "align":"center",
      "size":"small",
      "x":28,
      "y":70,
      "width":52,
      "maxHeight":23,
      "panelOpacity":0.28,
      "reason":"背景が明るく、白文字の視認性を保てるため"
    },
    {
      "font":"maru",
      "position":"bottom",
      "textColor":"black",
      "panel":"none",
      "align":"left",
      "size":"medium",
      "x":10,
      "y":67,
      "width":55,
      "maxHeight":25,
      "panelOpacity":0,
      "reason":"背景がシンプルで、パネルなしでも読みやすいため"
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
const currentDate =
  normalizeCurrentDate(
    req.body?.currentDate
  );

const visitPeriod =
  visitPeriodFromCurrentDate(
    currentDate
  );
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
 currentDate,
visitPeriod,
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

必ず入れる：

・おすすめの方
・前回来店時期の目安

前回来店時期は、
データ内の visitPeriod をそのまま使用する。
AI側で日付を再計算しない。
「1〜1.5ヶ月」などの期間表記は使わない。

おすすめの方は、
その時期に出やすい悩みを2個まで。
例：
・毛先のパサつきが気になる
・顔まわりが扱いづらい
・カラーの色落ちが気になる
・レイヤーの形が崩れてきた

文章は全体的に短くする。
説明文は増やさない。
各見出し＋1〜2行程度にする。

例：

10/14 11:00〜

おすすめの方
・毛先のパサつきが気になる
・顔まわりが扱いづらい

前回来店目安
9月頭〜9月中旬

ご予約・ご相談はDMまたは予約リンクから

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
