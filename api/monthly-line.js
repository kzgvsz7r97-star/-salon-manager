import crypto from 'crypto';

const MONTH_COPY = {
  1: [
    '1月は乾燥で毛先のパサつきや静電気が気になりやすい時期です。',
    '冬服で首元が重く見えやすいので、顔まわりやレイヤーを少し整えるだけでもかなり雰囲気変わります◎'
  ],
  2: [
    '2月はまだ乾燥しやすいですが、少しずつ春っぽく雰囲気を変えたくなる時期です。',
    '長さを大きく変えなくても、顔まわりやレイヤー、透明感のあるカラーで印象を変えられます◎'
  ],
  3: [
    '3月は卒業や新生活前で、髪を変えたくなる方が増える時期です🌸',
    '初カラーや少し雰囲気を変えたい方は、顔まわりのレイヤーや透明感カラーもおすすめです◎'
  ],
  4: [
    '4月は新生活で服装やメイクが変わって、髪も少し変えたくなる時期です。',
    '長さは残しつつ顔まわりやレイヤーを入れるだけでも、かなり印象を変えられます◎'
  ],
  5: [
    '5月は紫外線も強くなってきて、カラーの褪色や毛先の乾燥が気になり始める時期です。',
    '梅雨前にまとまりやすく整えたり、透明感を残したカラーにしておくのもおすすめです◎'
  ],
  6: [
    '6月は湿気で広がったり、顔まわりがうまく決まらない日が増えやすい時期です☔️',
    'レイヤーも入れ方を調整すると、まとまりを残しながら動きを出せます◎'
  ],
  7: [
    '7月は暑さや汗で、髪を結ぶことが増える時期です。',
    '結んだ時も可愛く見える顔まわりや、軽く見えるレイヤーに整えるのもおすすめです◎'
  ],
  8: [
    '8月は紫外線や海・プールなどで、カラーの褪色や毛先のダメージが出やすい時期です。',
    '夏の終わりに一度整えて、レイヤーやカラーをきれいに戻しておくのもおすすめです◎'
  ],
  9: [
    '9月は服が少しずつ秋っぽくなって、髪色や雰囲気も変えたくなる時期です🍂',
    '明るさを落としても透明感を残したカラーや、秋服に合うレイヤーもおすすめです◎'
  ],
  10: [
    '10月は乾燥が少しずつ出てきて、夏のダメージや毛先のパサつきが気になりやすい時期です。',
    '重く見えやすい秋冬の服にも、顔まわりやレイヤーを整えるとバランスが取りやすくなります◎'
  ],
  11: [
    '11月はニットやアウターが増えて、顔まわりや毛先が重く見えやすい時期です。',
    '巻きすぎなくても動くレイヤーや、冬服に合う透明感カラーに変えるのもおすすめです◎'
  ],
  12: [
    '12月はクリスマスや年末年始など、写真を撮ったり人に会う予定が増えやすい時期です🎄',
    '顔まわりやカラーを少し整えるだけでも、かなり印象が変わります◎'
  ]
};

function jstNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(new Date());

  const get = type =>
    Number(parts.find(x => x.type === type)?.value || 0);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day')
  };
}

function makeMessage(month) {
  const copy = MONTH_COPY[month];

  return `${copy[0]}
${copy[1]}

ご来店周期は1〜1.5ヶ月くらいが目安です◎

※次回予約をいただいている方にも一斉配信しています。
ご予約の変更などは、分かり次第お早めにご連絡ください🙇‍♂️

髪どうしようか迷っている方も、このLINEにそのまま気軽に相談してください☺️`;
}

function retryKey(year, month) {
  const hex = crypto
    .createHash('sha256')
    .update(`monthly-line-${year}-${month}`)
    .digest('hex')
    .slice(0, 32);

  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok:false });
  }

  if (
    !process.env.CRON_SECRET ||
    req.headers.authorization !==
      `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ ok:false });
  }

  const token =
    process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      ok:false,
      error:'LINE token missing'
    });
  }

  const now = jstNow();
  const message = makeMessage(now.month);

  if (req.query.preview === '1') {
    return res.status(200).json({
      ok:true,
      message
    });
  }

  if (now.day !== 1) {
    return res.status(200).json({
      ok:true,
      skipped:true
    });
  }

  const r = await fetch(
    'https://api.line.me/v2/bot/message/narrowcast',
    {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${token}`,
        'X-Line-Retry-Key':
          retryKey(now.year, now.month)
      },
      body:JSON.stringify({
        messages:[
          {
            type:'text',
            text:message
          }
        ],
        filter:{
          demographic:{
            type:'operator',
            and:[
              {
                type:'gender',
                oneOf:['female']
              },
              {
                type:'age',
                gte:'age_15',
                lt:'age_30'
              },
              {
                type:'subscriptionPeriod',
                lt:'day_365'
              }
            ]
          }
        },
        limit:{
          upToRemainingQuota:true,
          forbidPartialDelivery:true
        }
      })
    }
  );

  const raw = await r.text();

  if (r.status === 409) {
    return res.status(200).json({
      ok:true,
      alreadySent:true
    });
  }

  if (!r.ok) {
    return res.status(r.status).json({
      ok:false,
      error:raw
    });
  }

  return res.status(202).json({
    ok:true,
    accepted:true
  });
}
