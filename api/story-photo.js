import crypto from 'crypto';

const ALLOWED_ORIGINS = new Set([
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

function storageHeaders(){
  const key=
    process.env
      .SUPABASE_SECRET_KEY;

  return {
    'Content-Type':
      'application/json',

    apikey:key,

    Authorization:
      `Bearer ${key}`
  };
}

async function latestState(){

  const base=
    process.env
      .SUPABASE_URL;

  const secret=
    process.env
      .SUPABASE_SECRET_KEY;

  if(!base||!secret){
    throw new Error(
      'Storage is not configured'
    );
  }

  const r=
    await fetch(
      `${base}/rest/v1/salon-backups?select=data&order=created_at.desc&limit=1`,
      {
        headers:
          storageHeaders()
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

function storySignature(
  date
){
  const secret=
    process.env
      .CRON_SECRET ||
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
    storySignature(
      date
    );

  if(
    !expected ||
    !sig ||
    expected.length !==
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

function adminAuthorized(
  req
){
  return (
    !!process.env
      .BACKUP_KEY &&

    req.headers[
      'x-backup-key'
    ] ===
      process.env
        .BACKUP_KEY
  );
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
    req.method ===
    'OPTIONS'
  ){
    return res
      .status(204)
      .end();
  }

  if(
    req.method !==
    'GET'
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

    if(
      !story ||
      (
        date &&
        story.date !== date
      )
    ){
      return res
        .status(404)
        .json({
          ok:false,
          error:
            'Story photo not found'
        });
    }

    const imageUrl=
      String(
        story.mediaUrl ||
        ''
      );

    if(
      !/^https:\/\//i
        .test(
          imageUrl
        )
    ){
      return res
        .status(404)
        .json({
          ok:false,
          error:
            'Photo URL not found'
        });
    }

    const imageResponse=
      await fetch(
        imageUrl,
        {
          headers:{
            'User-Agent':
              'SalonManager/1.0'
          }
        }
      );

    if(
      !imageResponse.ok
    ){
      return res
        .status(
          imageResponse.status
        )
        .json({
          ok:false,
          error:
            'Instagram photo fetch failed'
        });
    }

    const type=
      imageResponse
        .headers
        .get(
          'content-type'
        ) ||
      'image/jpeg';

    const buffer=
      Buffer.from(
        await imageResponse
          .arrayBuffer()
      );

    res.setHeader(
      'Content-Type',
      type
    );

    res.setHeader(
      'Content-Length',
      buffer.length
    );

    res.setHeader(
      'Cache-Control',
      'private, max-age=300'
    );

    return res
      .status(200)
      .send(
        buffer
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
