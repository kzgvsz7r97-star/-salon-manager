import crypto from 'crypto';

const BUCKET='story-photos';

const ALLOWED_ORIGINS=new Set([
  'https://kzgvsz7r97-star.github.io',
  'https://salon-manager-kzgvsz7r97-star.vercel.app'
]);

function setCors(req,res){
  const origin=
    req.headers.origin || '';

  if(
    ALLOWED_ORIGINS.has(
      origin
    )
  ){
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
    'GET, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Backup-Key'
  );
}

function adminAuthorized(req){
  return (
    !!process.env.BACKUP_KEY &&
    req.headers['x-backup-key']===
      process.env.BACKUP_KEY
  );
}

function storageConfig(){
  const url=
    process.env.SUPABASE_URL;

  const key=
    process.env.SUPABASE_SECRET_KEY;

  if(!url||!key){
    throw new Error(
      'Storage is not configured'
    );
  }

  return {
    url,
    key
  };
}

function storageHeaders(){
  const {key}=
    storageConfig();

  return {
    apikey:key,
    Authorization:
      `Bearer ${key}`
  };
}

async function latestState(){
  const {url}=
    storageConfig();

  const r=
    await fetch(
      `${url}/rest/v1/salon-backups?select=data&order=created_at.desc&limit=1`,
      {
        headers:{
          ...storageHeaders(),
          'Content-Type':
            'application/json'
        }
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

  return (
    rows?.[0]?.data ||
    {}
  );
}

function storySignature(date){
  const secret=
    process.env.CRON_SECRET ||
    '';

  if(!secret){
    return '';
  }

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

function validSignature(
  date,
  sig
){
  const expected=
    storySignature(date);

  const actual=
    String(sig||'');

  if(
    !expected ||
    !actual ||
    expected.length !==
      actual.length
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
          actual
        )
      );
  }
  catch{
    return false;
  }
}

function encodedPath(path){
  return String(path||'')
    .split('/')
    .map(
      encodeURIComponent
    )
    .join('/');
}

async function fetchStoredPhoto(
  storagePath
){
  const {url}=
    storageConfig();

  const path=
    encodedPath(
      storagePath
    );

  const r=
    await fetch(
      `${url}/storage/v1/object/authenticated/${BUCKET}/${path}`,
      {
        headers:
          storageHeaders()
      }
    );

  if(!r.ok){
    const raw=
      await r.text();

    throw new Error(
      raw ||
      '登録写真を読み込めませんでした'
    );
  }

  const type=
    r.headers.get(
      'content-type'
    ) ||
    'image/jpeg';

  const buffer=
    Buffer.from(
      await r.arrayBuffer()
    );

  return {
    type,
    buffer
  };
}

async function fetchLegacyPhoto(
  imageUrl
){
  if(
    !/^https:\/\//i.test(
      String(imageUrl||'')
    )
  ){
    throw new Error(
      'Photo URL not found'
    );
  }

  const r=
    await fetch(
      imageUrl,
      {
        headers:{
          'User-Agent':
            'SalonManager/1.0'
        }
      }
    );

  if(!r.ok){
    throw new Error(
      'Photo fetch failed'
    );
  }

  const type=
    r.headers.get(
      'content-type'
    ) ||
    'image/jpeg';

  const buffer=
    Buffer.from(
      await r.arrayBuffer()
    );

  return {
    type,
    buffer
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

  if(
    req.method==='OPTIONS'
  ){
    return res
      .status(204)
      .end();
  }

  if(
    req.method!=='GET'
  ){
    return res
      .status(405)
      .json({
        ok:false,
        error:
          'Method not allowed'
      });
  }

  const date=
    String(
      req.query?.date ||
      ''
    );

  const sig=
    String(
      req.query?.sig ||
      ''
    );

  if(
    !adminAuthorized(req) &&
    !validSignature(
      date,
      sig
    )
  ){
    return res
      .status(401)
      .json({
        ok:false,
        error:
          'Unauthorized'
      });
  }

  try{
    const state=
      await latestState();

    const story=
      state
        ?.storyAuto
        ?.last;

    if(!story){
      return res
        .status(404)
        .json({
          ok:false,
          error:
            'Story photo not found'
        });
    }

    if(
      date &&
      story.date !== date
    ){
      return res
        .status(404)
        .json({
          ok:false,
          error:
            'Story date not found'
        });
    }

    let photo;

    if(
      story.storagePath
    ){
      photo=
        await fetchStoredPhoto(
          story.storagePath
        );
    }
    else if(
      story.mediaUrl
    ){
      photo=
        await fetchLegacyPhoto(
          story.mediaUrl
        );
    }
    else{
      return res
        .status(404)
        .json({
          ok:false,
          error:
            'Photo data not found'
        });
    }

    res.setHeader(
      'Content-Type',
      photo.type
    );

    res.setHeader(
      'Content-Length',
      photo.buffer.length
    );

    res.setHeader(
      'Cache-Control',
      'private, max-age=300'
    );

    return res
      .status(200)
      .send(
        photo.buffer
      );
  }
  catch(e){
    console.error(
      'story photo error',
      e
    );

    return res
      .status(500)
      .json({
        ok:false,
        error:
          e.message ||
          'Story photo failed'
      });
  }
}
