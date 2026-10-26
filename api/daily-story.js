
import crypto from 'crypto';
import sharp from 'sharp';


const ALLOWED_ORIGINS = new Set([
  'https://kzgvsz7r97-star.github.io',
  'https://salon-manager-kzgvsz7r97-star.vercel.app'
]);

function setCors(req,res){
  const origin=req.headers.origin||'';

  if(ALLOWED_ORIGINS.has(origin)){
    res.setHeader(
      'Access-Control-Allow-Origin',
      origin
    );
  }

  res.setHeader('Vary','Origin');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Backup-Key, Authorization'
  );
}

function adminAuthorized(req){
  return (
    !!process.env.BACKUP_KEY &&
    req.headers['x-backup-key']===
      process.env.BACKUP_KEY
  );
}

function cronAuthorized(req){
  return (
    !!process.env.CRON_SECRET &&
    req.headers.authorization===
      `Bearer ${process.env.CRON_SECRET}`
  );
}

function storageHeaders(){
  const key=
    process.env.SUPABASE_SECRET_KEY;

  return {
    'Content-Type':'application/json',
    apikey:key,
    Authorization:`Bearer ${key}`
  };
}

async function latestState(){
  const base=
    process.env.SUPABASE_URL;

  const secret=
    process.env.SUPABASE_SECRET_KEY;

  if(!base||!secret){
    throw new Error(
      'Storage is not configured'
    );
  }

  const r=
    await fetch(
      `${base}/rest/v1/salon-backups?select=data&order=created_at.desc&limit=1`,
      {
        headers:storageHeaders()
      }
    );

  const raw=
    await r.text();

  if(!r.ok){
    throw new Error(
      raw ||
      'Storage read failed'
    );
  }

  const rows=
    raw
      ? JSON.parse(raw)
      : [];

  return rows?.[0]?.data || {};
}

async function writeState(data){
  const base=
    process.env.SUPABASE_URL;

  const r=
    await fetch(
      `${base}/rest/v1/salon-backups`,
      {
        method:'POST',

        headers:{
          ...storageHeaders(),
          Prefer:'return=minimal'
        },

        body:
          JSON.stringify({
            data
          })
      }
    );

  if(!r.ok){
    throw new Error(
      await r.text()
    );
  }
}

function jstParts(
  date=new Date()
){
  const parts=
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:'Asia/Tokyo',
        year:'numeric',
        month:'2-digit',
        day:'2-digit'
      }
    ).formatToParts(
      date
    );

  const get=
    t=>
      Number(
        parts.find(
          x=>x.type===t
        )?.value || 0
      );

  return {
    year:get('year'),
    month:get('month'),
    day:get('day')
  };
}

function isoJst(
  date=new Date()
){
  const p=
    jstParts(date);

  return (
    `${p.year}-`+
    `${String(p.month).padStart(2,'0')}-`+
    `${String(p.day).padStart(2,'0')}`
  );
}

function addDaysISO(
  iso,
  n
){
  const d=
    new Date(
      `${iso}T12:00:00+09:00`
    );

  d.setUTCDate(
    d.getUTCDate()+n
  );

  return isoJst(d);
}

function dateObjJst(iso){
  return new Date(
    `${iso}T12:00:00+09:00`
  );
}

function dayLabelJa(iso){
  const d=
    dateObjJst(iso);

  const p=
    jstParts(d);

  const weekday=
    [
      '日','月','火',
      '水','木','金','土'
    ][d.getUTCDay()];

  return (
    `${p.month}/${p.day}`+
    `(${weekday})`
  );
}

function timeToMin(t){
  if(!t)return 0;

  const [h,m]=
    String(t)
      .split(':')
      .map(Number);

  return (
    (h||0)*60+
    (m||0)
  );
}

function minToClock(n){
  const h=
    Math.floor(n/60);

  const m=
    n%60;

  return (
    `${String(h).padStart(2,'0')}:`+
    `${String(m).padStart(2,'0')}`
  );
}

function activeBooking(b){
  const s=
    b?.status ||
    'booked';

  return (
    s!=='cancelled' &&
    s!=='noshow'
  );
}

function mergeBusyIntervals(
  bookings
){
  const rows=
    (bookings||[])
      .map(
        b=>[
          timeToMin(b.time),
          timeToMin(
            b.end||b.time
          )
        ]
      )
      .filter(
        x=>x[1]>x[0]
      )
      .sort(
        (a,b)=>a[0]-b[0]
      );

  const out=[];

  for(const r of rows){

    const p=
      out[
        out.length-1
      ];

    if(
      p &&
      r[0]<=p[1]
    ){
      p[1]=
        Math.max(
          p[1],
          r[1]
        );
    }
    else{
      out.push(
        [...r]
      );
    }
  }

  return out;
}

function availabilityForDate(
  state,
  iso,
  startMin,
  endMin,
  durationMin
){
  const bookings=
    (state.bookings||[])
      .filter(
        b=>
          b.date===iso &&
          activeBooking(b)
      );

  const busy=
    mergeBusyIntervals(
      bookings
    );

  const gaps=[];
  let cursor=startMin;

  for(
    let [s,e]
    of busy
  ){

    if(
      e<=startMin ||
      s>=endMin
    ){
      continue;
    }

    s=
      Math.max(
        s,
        startMin
      );

    e=
      Math.min(
        e,
        endMin
      );

    if(s>cursor){
      gaps.push(
        [cursor,s]
      );
    }

    cursor=
      Math.max(
        cursor,
        e
      );
  }

  if(cursor<endMin){
    gaps.push(
      [cursor,endMin]
    );
  }

  return gaps
    .filter(
      ([s,e])=>
        e-s>=durationMin
    )
    .map(
      ([s,e])=>
        [
          s,
          e-durationMin
        ]
    );
}

function storyAvailabilityText(
  state,
  start,
  end,
  durationMin=120,
  bizStart=660,
  bizEnd=1260
){
  const lines=[];
  let iso=start;

  for(
    let i=0;
    i<31;
    i++
  ){

    if(iso>end)break;

    const d=
      dateObjJst(iso);

    // 月曜定休
    if(
      d.getUTCDay()!==1
    ){

      const slots=
        availabilityForDate(
          state,
          iso,
          bizStart,
          bizEnd,
          durationMin
        );

      if(slots.length){

        const parts=
          slots.map(
            ([s,e])=>
              s===e
                ? minToClock(s)
                : `${minToClock(s)}〜${minToClock(e)}`
          );

        lines.push(
          `${dayLabelJa(iso)}  ${parts.join(' / ')}`
        );
      }
    }

    iso=
      addDaysISO(
        iso,
        1
      );
  }

  return lines.length
    ? `${lines.join('\n')}\n`
    : '空き枠はありません';
}

const RECOMMENDS={

  1:[
    [
      '・乾燥で毛先がパサつきやすい',
      '・静電気で広がりやすい'
    ],
    [
      '・顔まわりが伸びて扱いづらくなってきた',
      '・カラーのツヤが落ちてきた'
    ],
    [
      '・レイヤーの動きが出づらくなってきた',
      '・毛先のまとまりが悪くなってきた'
    ],
    [
      '・巻いても形が決まりづらくなってきた',
      '・カラーの色落ちが気になってきた'
    ]
  ],

  2:[
    [
      '・乾燥で毛先がパサつきやすい',
      '・静電気で広がりやすい'
    ],
    [
      '・顔まわりが伸びて扱いづらくなってきた',
      '・レイヤーがまとまりづらくなってきた'
    ],
    [
      '・毛先の引っかかりが気になる',
      '・カラーの色落ちが気になってきた'
    ],
    [
      '・巻いても形が決まりづらくなってきた',
      '・毛先のまとまりが悪くなってきた'
    ]
  ],

  3:[
    [
      '・毛先のパサつきや引っかかりが気になる',
      '・顔まわりが扱いづらくなってきた'
    ],
    [
      '・湿気でまとまりづらくなってきた',
      '・カラーの色落ちが気になってきた'
    ],
    [
      '・レイヤーの動きが出づらくなってきた',
      '・毛先のまとまりが悪くなってきた'
    ],
    [
      '・巻いても形が決まりづらくなってきた',
      '・顔まわりの形が崩れてきた'
    ]
  ],

  4:[
    [
      '・湿気で広がりやすくなってきた',
      '・顔まわりが扱いづらくなってきた'
    ],
    [
      '・レイヤーの形が崩れてきた',
      '・カラーの色落ちが気になってきた'
    ],
    [
      '・毛先がまとまりづらくなってきた',
      '・巻いても形が決まりづらくなってきた'
    ],
    [
      '・顔まわりの長さが気になってきた',
      '・毛先のパサつきが気になってきた'
    ]
  ],

  5:[
    [
      '・湿気で広がりやすくなってきた',
      '・毛先がまとまりづらくなってきた'
    ],
    [
      '・顔まわりが扱いづらくなってきた',
      '・レイヤーの形が崩れてきた'
    ],
    [
      '・うねりや広がりが気になってきた',
      '・カラーの色落ちが気になってきた'
    ],
    [
      '・巻いても形が決まりづらくなってきた',
      '・毛先の引っかかりが気になる'
    ]
  ],

  6:[
    [
      '・湿気で広がりやすくなってきた',
      '・うねりが気になってきた'
    ],
    [
      '・顔まわりが扱いづらくなってきた',
      '・カラーの色落ちが気になってきた'
    ],
    [
      '・レイヤーの動きが出づらくなってきた',
      '・毛先がまとまりづらくなってきた'
    ],
    [
      '・巻いても広がりやすくなってきた',
      '・顔まわりの形が崩れてきた'
    ]
  ],

  7:[
    [
      '・紫外線で毛先がパサつきやすい',
      '・カラーの色落ちが早く感じる'
    ],
    [
      '・湿気でまとまりづらくなってきた',
      '・顔まわりが扱いづらくなってきた'
    ],
    [
      '・レイヤーの動きが出づらくなってきた',
      '・毛先の引っかかりが気になる'
    ],
    [
      '・巻いても形が決まりづらくなってきた',
      '・毛先のツヤがなくなってきた'
    ]
  ],

  8:[
    [
      '・紫外線で毛先がパサつきやすい',
      '・カラーの色落ちが気になってきた'
    ],
    [
      '・夏ダメージで毛先の引っかかりが気になる',
      '・レイヤーがまとまりづらくなってきた'
    ],
    [
      '・顔まわりが伸びて扱いづらくなってきた',
      '・毛先のツヤがなくなってきた'
    ],
    [
      '・巻いても形が決まりづらくなってきた',
      '・毛先が広がりやすくなってきた'
    ]
  ],

  9:[
    [
      '・夏ダメージで毛先がパサつきやすい',
      '・カラーの色落ちが気になってきた'
    ],
    [
      '・レイヤーの形が崩れてきた',
      '・顔まわりが扱いづらくなってきた'
    ],
    [
      '・毛先の引っかかりが気になる',
      '・巻いても形が決まりづらくなってきた'
    ],
    [
      '・毛先のまとまりが悪くなってきた',
      '・カラーのツヤが落ちてきた'
    ]
  ],

  10:[
    [
      '・顔まわりが伸びて扱いづらくなってきた',
      '・カラーの赤みや色落ちが気になってきた'
    ],
    [
      '・毛先のパサつきや引っかかりが気になる',
      '・レイヤーの動きが出づらくなってきた'
    ],
    [
      '・毛先のまとまりが悪くなってきた',
      '・巻いても形が決まりづらくなってきた'
    ],
    [
      '・顔まわりの形が崩れてきた',
      '・カラーのツヤが落ちてきた'
    ]
  ],

  11:[
    [
      '・乾燥で毛先がパサつきやすい',
      '・カラーのツヤが落ちてきた'
    ],
    [
      '・顔まわりが扱いづらくなってきた',
      '・レイヤーがまとまりづらくなってきた'
    ],
    [
      '・毛先の引っかかりが気になる',
      '・巻いても形が決まりづらくなってきた'
    ],
    [
      '・毛先のまとまりが悪くなってきた',
      '・カラーの色落ちが気になってきた'
    ]
  ],

  12:[
    [
      '・乾燥で毛先がパサつきやすい',
      '・静電気で広がりやすい'
    ],
    [
      '・カラーのツヤが落ちてきた',
      '・顔まわりが扱いづらくなってきた'
    ],
    [
      '・レイヤーの動きが出づらくなってきた',
      '・毛先の引っかかりが気になる'
    ],
    [
      '・巻いても形が決まりづらくなってきた',
      '・毛先のまとまりが悪くなってきた'
    ]
  ]
};

function visitPeriod(
  month,
  day
){
  const prevMonth=
    month===1
      ? 12
      : month-1;

  if(day<=15){
    return (
      `${prevMonth}月頭〜`+
      `${prevMonth}月中旬`
    );
  }

  return (
    `${prevMonth}月中旬〜`+
    `${prevMonth}月末`
  );
}

function storyText(
  state,
  today
){
  const {
    month,
    day
  }=
    jstParts(
      new Date(
        `${today}T12:00:00+09:00`
      )
    );


  const end=
    addDaysISO(
      today,
      2
    );


  const base=
    storyAvailabilityText(
      state,
      today,
      end,
      120,
      11*60,
      21*60
    );

  const pairs=
    RECOMMENDS[month] ||
    RECOMMENDS[10];

  const pair=
    pairs[
      (day-1) %
      pairs.length
    ];

  return `${base}
おすすめの方
${pair.join('\n')}
前回来店目安
${visitPeriod(month,day)}
ご予約・ご相談はDMまたは予約リンクから`;
}

async function fetchJson(url){

  const r=
    await fetch(
      url,
      {
        headers:{
          'User-Agent':
            'SalonManager/1.0'
        }
      }
    );

  const raw=
    await r.text();

  let body={};

  try{
    body=
      raw
        ? JSON.parse(raw)
        : {};
  }
  catch{
    body={};
  }

  if(!r.ok){
    throw new Error(
      body?.error?.message ||
      raw ||
      `Instagram API ${r.status}`
    );
  }

  return body;
}

async function instagramPhotos(
  token
){
  if(!token){
    throw new Error(
      'INSTAGRAM_ACCESS_TOKEN is not configured'
    );
  }

  const fields=
    'id,media_type,media_url,thumbnail_url,permalink,timestamp';

  const url=
    'https://graph.instagram.com/me/media'+
    `?fields=${encodeURIComponent(fields)}`+
    '&limit=50'+
    `&access_token=${encodeURIComponent(token)}`;

  const body=
    await fetchJson(url);

  const out=[];

  for(
    const m
    of body.data||[]
  ){

    if(
      m.media_type==='IMAGE' &&
      m.media_url
    ){
      out.push({
        id:String(m.id),
        mediaUrl:m.media_url,
        permalink:
          m.permalink||'',
        timestamp:
          m.timestamp||''
      });

      continue;
    }

    if(
      m.media_type===
      'CAROUSEL_ALBUM'
    ){

      const childUrl=
        `https://graph.instagram.com/${encodeURIComponent(m.id)}/children`+
        `?fields=${encodeURIComponent(fields)}`+
        '&limit=20'+
        `&access_token=${encodeURIComponent(token)}`;

      const childBody=
        await fetchJson(
          childUrl
        );

      for(
        const c
        of childBody.data||[]
      ){

        if(
          c.media_type==='IMAGE' &&
          c.media_url
        ){

          out.push({
            id:String(c.id),

            parentId:
              String(m.id),

            mediaUrl:
              c.media_url,

            permalink:
              m.permalink ||
              c.permalink ||
              '',

            timestamp:
              m.timestamp ||
              c.timestamp ||
              ''
          });
        }
      }
    }
  }

  return out;
}

function hashNumber(text){

  const hex=
    crypto
      .createHash('sha256')
      .update(text)
      .digest('hex')
      .slice(0,8);

  return (
    parseInt(hex,16) >>>
    0
  );
}

function choosePhoto(
  photos,
  history,
  today
){
  if(!photos.length){

    throw new Error(
      'Instagramの写真投稿が見つかりません'
    );
  }

  const used=
    new Set(
      (history||[])
        .map(
          x=>
            String(
              x.mediaId||''
            )
        )
    );

  let pool=
    photos.filter(
      x=>
        !used.has(
          String(x.id)
        )
    );

  if(!pool.length){

    const lastUsed=
      new Map();

    for(
      const h
      of history||[]
    ){
      lastUsed.set(
        String(
          h.mediaId||''
        ),
        String(
          h.date||''
        )
      );
    }

    pool=
      [...photos]
        .sort(
          (a,b)=>
            String(
              lastUsed.get(
                a.id
              )||''
            )
              .localeCompare(
                String(
                  lastUsed.get(
                    b.id
                  )||''
                )
              )
        );
  }

  return pool[
    hashNumber(today) %
    pool.length
  ];
}

function ownerLineId(
  state
){
  const profiles=
    state.staffProfiles||[];

  const owner=
    profiles.find(
      p=>
        p.role==='owner'
    ) ||
    profiles[0];

  return String(
    owner
      ?.notifyLineUserId ||
    ''
  ).trim();
}

async function pushLine(
  state,
  messages
){

  const userId=
    ownerLineId(state);

  const token=
    process.env
      .LINE_CHANNEL_ACCESS_TOKEN;

  if(!token){
    throw new Error(
      'LINE_CHANNEL_ACCESS_TOKEN is not configured'
    );
  }

  if(
    !/^U[0-9a-f]{32}$/i.test(
      userId
    )
  ){
    throw new Error(
      '自分へのLINE通知IDが未設定です'
    );
  }

  const r=
    await fetch(
      'https://api.line.me/v2/bot/message/push',
      {
        method:'POST',

        headers:{
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${token}`
        },

        body:
          JSON.stringify({
            to:userId,
            messages
          })
      }
    );

  const raw=
    await r.text();

  if(!r.ok){
    throw new Error(
      raw ||
      'LINE送信に失敗しました'
    );
  }
}

function storySignature(
  date
){
  const secret=
    process.env.CRON_SECRET ||
    '';

  if(!secret)return '';

  return crypto
    .createHmac(
      'sha256',
      secret
    )
    .update(
      `story-auto:${date}`
    )
    .digest('hex');
}

function validStorySignature(
  date,
  sig
){
  const expected=
    storySignature(date);

  if(
    !expected ||
    !sig ||
    expected.length!==
      String(sig).length
  ){
    return false;
  }

  try{
    return crypto
      .timingSafeEqual(
        Buffer.from(
          expected
        ),
        Buffer.from(
          String(sig)
        )
      );
  }
  catch{
    return false;
  }
}

function appUrl(today){

  const base=
    process.env.STORY_APP_URL ||
    'https://kzgvsz7r97-star.github.io/-salon-manager/';

  const u=
    new URL(base);

  u.searchParams.set(
    'autoStory',
    today
  );

  u.searchParams.set(
    'sig',
    storySignature(today)
  );

  return u.toString();
}



async function loadStoryPhoto(storagePath){

  const base=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY;

  if(!base||!key){
    throw new Error('Storage is not configured');
  }

  const path=String(storagePath||'');

  if(!/^uploads\/[a-zA-Z0-9._-]+$/.test(path)){
    throw new Error('Invalid story photo path');
  }

  const encoded=path
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  const response=await fetch(
    `${base}/storage/v1/object/authenticated/story-photos/${encoded}`,
    {
      headers:{
        apikey:key,
        Authorization:`Bearer ${key}`
      }
    }
  );

  if(!response.ok){
    throw new Error(
      `写真読み込みエラー：${response.status}`
    );
  }

  return Buffer.from(
    await response.arrayBuffer()
  );
}

async function createCompletedStory(photoBuffer, text){

  const width=1080;
  const height=1920;
  const photoHeight=1410;

  // 元写真を切り抜かずに配置
  const photo=await sharp(photoBuffer)
    .rotate()
    .resize(width,photoHeight,{
      fit:'contain',
      background:'#161616'
    })
    .jpeg({quality:94})
    .toBuffer();

  const escapeXml=value=>String(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');

  const lines=String(text||'')
    .split('\n')
    .map(x=>x.trim())
    .filter(Boolean);

  const maxLines=12;
  const visible=lines.slice(0,maxLines);

  const fontSize=30;
  const lineHeight=39;

  const textElements=visible.map((line,i)=>`
    <text
      x="80"
      y="${1510+i*lineHeight}"
      font-family="Noto Sans CJK JP, sans-serif"
      font-size="${fontSize}"
      fill="#ffffff"
    >${escapeXml(line)}</text>
  `).join('');

  const overlay=Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${width}" height="${height}">
      <rect x="0" y="1410"
            width="1080" height="510"
            fill="#161616"/>
      ${textElements}
    </svg>
  `);

  return sharp({
    create:{
      width,
      height,
      channels:3,
      background:'#161616'
    }
  })
    .composite([
      {input:photo,top:0,left:0},
      {input:overlay,top:0,left:0}
    ])
    .jpeg({quality:92})
    .toBuffer();
}

async function saveCompletedStory(imageBuffer, date){

  const base=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY;

  if(!base||!key){
    throw new Error('Storage is not configured');
  }

  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){
    throw new Error('Invalid story date');
  }

  if(!Buffer.isBuffer(imageBuffer)){
    throw new Error('Invalid story image');
  }

  const id=crypto.randomUUID();
  const path=`completed/${date}-${id}.jpg`;

  const response=await fetch(
    `${base}/storage/v1/object/story-photos/${path}`,
    {
      method:'POST',
      headers:{
        apikey:key,
        Authorization:`Bearer ${key}`,
        'Content-Type':'image/jpeg',
        'x-upsert':'false'
      },
      body:imageBuffer
    }
  );

  if(!response.ok){
    throw new Error(
      `完成画像の保存に失敗：${response.status}`
    );
  }

  return path;
}

async function makeDailyStory(
  state,
  {
    force=false
  }={}
){

  const today=
    isoJst();

  state.storyAuto=
    state.storyAuto || {};

  state.storyAuto.history=
    Array.isArray(
      state.storyAuto.history
    )
      ? state.storyAuto.history
      : [];

  if(
    !force &&
    state.storyAuto.last?.date===
      today
  ){
    return {
      today,
      last:
        state.storyAuto.last,
      already:true
    };
  }

  const photos=
    (
      Array.isArray(
        state.storyPhotoLibrary
      )
        ? state.storyPhotoLibrary
        : []
    )
    .filter(
      x=>
        x &&
        x.active !== false &&
        x.storagePath
    )
    .map(
      x=>({
        id:String(x.id),
        storagePath:
          String(x.storagePath),
        contentType:
          String(
            x.contentType ||
            'image/jpeg'
          ),
        originalName:
          String(
            x.originalName ||
            ''
          ),
        uploadedAt:
          String(
            x.uploadedAt ||
            ''
          )
      })
    );

  if(!photos.length){
    throw new Error(
      'ストーリー用の登録写真がありません'
    );
  }


  // 登録順に写真を並べる
  const ordered=[...photos].sort(
    (a,b)=>a.uploadedAt.localeCompare(b.uploadedAt)
  );

  const history=state.storyAuto.history||[];

  const lastId=String(
    state.storyAuto.last?.mediaId||''
  );

  // 直近に使用した写真IDを取得
  const recentIds=[
    lastId,
    ...history.slice().reverse().map(
      x=>String(x.mediaId||'')
    )
  ].filter(Boolean);

  const uniqueRecent=[...new Set(recentIds)];

  // 枚数に応じて除外する写真数を調整
  const avoidCount=Math.min(
    3,
    ordered.length-1
  );

  const excluded=new Set(
    uniqueRecent.slice(0,avoidCount)
  );

  // 直近の写真を除いた候補
  let candidates=ordered.filter(
    x=>!excluded.has(x.id)
  );

  if(!candidates.length){
    candidates=ordered;
  }

  // 最後に使用した写真の次から選択
  const lastIndex=ordered.findIndex(
    x=>x.id===lastId
  );

  const selected=
    Array.from(
      {length:ordered.length},
      (_,i)=>ordered[
        (lastIndex+1+i)%ordered.length
      ]
    ).find(
      x=>candidates.some(c=>c.id===x.id)
    )||candidates[0];


  const text=
    storyText(
      state,
      today
    );

  // 選択した登録写真を取得
  const photoBuffer=await loadStoryPhoto(
    selected.storagePath
  );

  // 写真と文章を合成
  const completedBuffer=await createCompletedStory(
    photoBuffer,
    text
  );

  // 完成画像をSupabaseに保存
  const completedPath=await saveCompletedStory(
    completedBuffer,
    today
  );

  const sig=
    storySignature(
      today
    );


  const mediaUrl=
    'https://salon-manager-kzgvsz7r97-star.vercel.app'+
    `/api/story-library?completed=1`+
    `&date=${encodeURIComponent(today)}`+
    `&sig=${encodeURIComponent(sig)}`;

  const last={
    date:today,

    mediaId:
      selected.id,

    storagePath:
      selected.storagePath,

    contentType:
      selected.contentType,

    originalName:
      selected.originalName,

    completedPath,

    mediaUrl,

    permalink:'',

    source:
      'library',

    sourceTimestamp:
      selected.uploadedAt,

    text,

    generatedAt:
      new Date()
        .toISOString()
  };

  state.storyAuto.last=
    last;

  if(
    !state.storyAuto.history
      .some(
        x=>
          x.date===today &&
          String(
            x.mediaId
          )===
          String(
            selected.id
          )
      )
  ){
    state.storyAuto.history
      .push({
        date:today,

        mediaId:
          selected.id
      });
  }

  state.storyAuto.history=
    state.storyAuto.history
      .slice(-120);

  state.storyAuto.lastError=
    '';

  state.storyAuto.lastSuccessAt=
    new Date()
      .toISOString();

  await writeState(
    state
  );

  return {
    today,
    last,
    already:false
  };
}

export default async function handler(
  req,
  res
){

  setCors(
    req,
    res
  );

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  if(
    req.method==='OPTIONS'
  ){
    return res
      .status(204)
      .end();
  }

  const isAdmin=
    adminAuthorized(req);

  const isCron=
    cronAuthorized(req);

  // 投稿リンクを開いた時
  if(
    req.method==='GET' &&
    req.query?.preview==='1'
  ){

    const date=
      String(
        req.query?.date||''
      );

    const signed=
      validStorySignature(
        date,
        String(
          req.query?.sig||''
        )
      );

    if(
      !isAdmin &&
      !signed
    ){
      return res
        .status(401)
        .json({
          ok:false,
          error:'Unauthorized'
        });
    }

    try{

      const state=
        await latestState();

      const last=
        state.storyAuto
          ?.last ||
        null;

      if(
        date &&
        last?.date!==date
      ){
        return res
          .status(404)
          .json({
            ok:false,
            error:
              'Story date not found'
          });
      }

      return res
        .status(200)
        .json({
          ok:true,
          story:last
        });

    }
    catch(e){

      return res
        .status(500)
        .json({
          ok:false,
          error:e.message
        });
    }
  }

  // 手動テスト
  if(
    req.method==='POST'
  ){

    if(!isAdmin){
      return res
        .status(401)
        .json({
          ok:false,
          error:'Unauthorized'
        });
    }

    if(
     !['test','send-test'].includes(req.body?.action)
    ){
      return res
        .status(400)
        .json({
          ok:false,
          error:
            'Invalid action'
        });
    }
  }
  else if(
    req.method==='GET'
  ){

    if(!isCron){
      return res
        .status(401)
        .json({
          ok:false,
          error:'Unauthorized'
        });
    }

  }
  else{

    return res
      .status(405)
      .json({
        ok:false,
        error:
          'Method not allowed'
      });
  }

  let state;

  try{

    state=
      await latestState();

    if(
      state.storyAuto
        ?.enabled===false
    ){
      return res
        .status(200)
        .json({
          ok:true,
          skipped:true,
          reason:
            'Auto story disabled'
        });
    }

    const manual=
      req.method==='POST';

    const result=
      await makeDailyStory(
        state,
        {
          force:manual
        }
      );

    const link=
      appUrl(
        result.today
      );

    // 手動テスト時はLINEを送らない
 if(!manual || req.body?.action==='send-test'){

     if(
  result.already &&
  state.storyAuto?.lastSentAt &&
  isoJst(new Date(state.storyAuto.lastSentAt)) === result.today
){
        return res
          .status(200)
          .json({
            ok:true,
            alreadyGenerated:true,
            date:
              result.today
          });
      }

      await pushLine(
        state,
        [
          {
            type:'image',

            originalContentUrl:
              result.last.mediaUrl,

            previewImageUrl:
              result.last.mediaUrl
          },

          {
            type:'text',

            text:
`今日のストーリーを用意しました。

投稿用を開く：
${link}`
          }
        ]
      );

     if(!manual){
  state.storyAuto.lastSentAt =
    new Date().toISOString();

  await writeState(state);
}
    }

    return res
      .status(200)
      .json({
        ok:true,

        date:
          result.today,

        mediaId:
          result.last.mediaId,

        permalink:
          result.last.permalink,

        link
      });

  }
  catch(e){

    console.error(
      'daily story error',
      e
    );

    if(state){

      try{

        state.storyAuto=
          state.storyAuto || {};

        state.storyAuto
          .lastError=
          String(
            e.message||e
          );

        state.storyAuto
          .lastErrorAt=
          new Date()
            .toISOString();

        await writeState(
          state
        );

      }
      catch(_){}
    }

    return res
      .status(500)
      .json({
        ok:false,
        error:
          e.message ||
          'Daily story failed'
      });
  }
}
