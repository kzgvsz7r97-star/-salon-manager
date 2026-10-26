import crypto from 'crypto';

const BUCKET='story-photos';

const ALLOWED_ORIGINS=new Set([
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
    'Content-Type, X-Backup-Key'
  );
}

function authorized(req){
  return (
    !!process.env.BACKUP_KEY &&
    req.headers['x-backup-key']===
      process.env.BACKUP_KEY
  );
}

function base(){
  const url=
    process.env.SUPABASE_URL;

  const key=
    process.env.SUPABASE_SECRET_KEY;

  if(!url||!key){
    throw new Error(
      'Storage is not configured'
    );
  }

  return {url,key};
}

function authHeaders(extra={}){
  const {key}=base();

  return {
    apikey:key,
    Authorization:`Bearer ${key}`,
    ...extra
  };
}

async function latestState(){
  const {url}=base();

  const r=
    await fetch(
      `${url}/rest/v1/salon-backups?select=data&order=created_at.desc&limit=1`,
      {
        headers:{
          ...authHeaders(),
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

  return rows?.[0]?.data || {};
}

async function writeState(data){
  const {url}=base();

  const r=
    await fetch(
      `${url}/rest/v1/salon-backups`,
      {
        method:'POST',

        headers:{
          ...authHeaders(),
          'Content-Type':
            'application/json',
          Prefer:
            'return=minimal'
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

async function ensureBucket(){
  const {url}=base();

  const check=
    await fetch(
      `${url}/storage/v1/bucket/${BUCKET}`,
      {
        headers:
          authHeaders()
      }
    );

  if(check.ok)return;

  if(check.status!==404){
    throw new Error(
      await check.text() ||
      'Bucket check failed'
    );
  }

  const r=
    await fetch(
      `${url}/storage/v1/bucket`,
      {
        method:'POST',

        headers:{
          ...authHeaders(),
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify({
            id:BUCKET,
            name:BUCKET,
            public:false,

            file_size_limit:
              6291456,

            allowed_mime_types:[
              'image/jpeg',
              'image/png',
              'image/webp'
            ]
          })
      }
    );

  if(
    !r.ok &&
    r.status!==409
  ){
    throw new Error(
      await r.text() ||
      'Bucket creation failed'
    );
  }
}

function parseImageData(
  dataUrl
){
  const m=
    String(dataUrl||'')
      .match(
        /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i
      );

  if(!m){
    throw new Error(
      '画像形式を確認してください'
    );
  }

  const type=
    m[1].toLowerCase();

  const buffer=
    Buffer.from(
      m[2],
      'base64'
    );

  if(!buffer.length){
    throw new Error(
      '画像データが空です'
    );
  }

  if(
    buffer.length >
    6*1024*1024
  ){
    throw new Error(
      '画像が大きすぎます'
    );
  }

  const ext=
    type==='image/png'
      ? 'png'
      : type==='image/webp'
        ? 'webp'
        : 'jpg';

  return {
    type,
    buffer,
    ext
  };
}

async function uploadObject(
  path,
  type,
  buffer
){
  const {url}=base();

  const encoded=
    path
      .split('/')
      .map(
        encodeURIComponent
      )
      .join('/');

  const r=
    await fetch(
      `${url}/storage/v1/object/${BUCKET}/${encoded}`,
      {
        method:'POST',

        headers:{
          ...authHeaders(),
          'Content-Type':type,
          'x-upsert':'false'
        },

        body:buffer
      }
    );


  if(r.status===409){
    return;
  }

  if(!r.ok){
    throw new Error(
      await r.text() ||
      '画像保存に失敗しました'
    );
  }

}

function library(state){
  return Array.isArray(
    state.storyPhotoLibrary
  )
    ? state.storyPhotoLibrary
    : [];
}

export default async function handler(
  req,
  res
){
  setCors(req,res);

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
  
  // LINE送信用の完成画像を取得
  if(
    req.method==='GET' &&
    req.query?.completed==='1'
  ){
    const date=String(req.query?.date||'');
    const sig=String(req.query?.sig||'');
    const secret=process.env.CRON_SECRET||'';

    const expected=
      secret && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? crypto
            .createHmac('sha256',secret)
            .update(`story-auto:${date}`)
            .digest('hex')
        : '';

    const valid=
      /^[0-9a-f]{64}$/i.test(sig) &&
      expected.length===64 &&
      crypto.timingSafeEqual(
        Buffer.from(expected,'hex'),
        Buffer.from(sig,'hex')
      );

    if(!valid){
      return res.status(401).json({
        ok:false,
        error:'Unauthorized'
      });
    }

    try{
      const state=await latestState();
      const story=state.storyAuto?.last;

      if(!story || story.date!==date){
        return res.status(404).json({
          ok:false,
          error:'Story not found'
        });
      }

      const path=String(
        story.completedPath||''
      );

      if(!/^completed\/[a-zA-Z0-9._-]+\.jpg$/.test(path)){
        return res.status(404).json({
          ok:false,
          error:'Completed image not found'
        });
      }

      const {url}=base();

      const photo=await fetch(
        `${url}/storage/v1/object/authenticated/${BUCKET}/${path}`,
        {
          headers:authHeaders()
        }
      );

      if(!photo.ok){
        return res.status(502).json({
          ok:false,
          error:'Image retrieval failed'
        });
      }

      const buffer=Buffer.from(
        await photo.arrayBuffer()
      );

      if(buffer.length>10*1024*1024){
        throw new Error('Image too large');
      }

      res.setHeader('Content-Type','image/jpeg');
      res.setHeader('Cache-Control','no-store');

      return res.status(200).send(buffer);

    }catch(e){
      console.error('Completed story error',e);

      return res.status(500).json({
        ok:false,
        error:'Completed image fetch failed'
      });
    }
  }


  // 登録済み写真をストーリー用に取得
  if(
    req.method==='GET' &&
    req.query?.photo==='1'
  ){
    const date=String(req.query?.date||'');
    const sig=String(req.query?.sig||'');
    const secret=process.env.CRON_SECRET||'';

    const expected=
      secret && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? crypto
            .createHmac('sha256',secret)
            .update(`story-auto:${date}`)
            .digest('hex')
        : '';

    const valid=
      /^[0-9a-f]{64}$/i.test(sig) &&
      expected.length===sig.length &&
      crypto.timingSafeEqual(
        Buffer.from(expected,'hex'),
        Buffer.from(sig,'hex')
      );

    if(!valid){
      return res.status(401).json({
        ok:false,
        error:'Unauthorized'
      });
    }

    try{
     const state=await latestState();

const requestedId=String(req.query?.id||'');

const registered=Array.isArray(state.storyPhotoLibrary)
  ? state.storyPhotoLibrary.find(
      x=>String(x.id)===requestedId &&
         x.active!==false &&
         x.storagePath
    )
  : null;

const story=requestedId
  ? registered
    ? {
        date,
        storagePath:registered.storagePath,
        contentType:registered.contentType
      }
    : null
  : state.storyAuto?.last;

      if(!story || story.date!==date){
        return res.status(404).json({
          ok:false,
          error:'Story not found'
        });
      }

      const path=String(story.storagePath||'');

      if(!/^uploads\/[a-zA-Z0-9._-]+$/.test(path)){
        return res.status(404).json({
          ok:false,
          error:'Photo not found'
        });
      }

      const {url}=base();

      const photo=await fetch(
        `${url}/storage/v1/object/authenticated/${BUCKET}/${path}`,
        {
          headers:authHeaders()
        }
      );

      if(!photo.ok){
        return res.status(502).json({
          ok:false,
          error:'Photo retrieval failed'
        });
      }

      const type=
        photo.headers.get('content-type') ||
        story.contentType ||
        'image/jpeg';

      if(!/^image\/(jpeg|png|webp)(;|$)/i.test(type)){
        throw new Error('Invalid image type');
      }

      const buffer=Buffer.from(
        await photo.arrayBuffer()
      );

      if(buffer.length>6*1024*1024){
        throw new Error('Image too large');
      }

      res.setHeader('Content-Type',type);
     res.setHeader('Cache-Control','no-store');

      return res.status(200).send(buffer);

    }catch(e){
      console.error('Story photo error',e);

      return res.status(500).json({
        ok:false,
        error:'Photo fetch failed'
      });
    }
  }
  if(!authorized(req)){
    return res
      .status(401)
      .json({
        ok:false,
        error:'Unauthorized'
      });
  }

  try{

    if(req.method==='GET'){

      const state=
        await latestState();

      const photos=
        library(state)
          .slice()
          .sort(
            (a,b)=>
              String(
                b.uploadedAt||''
              )
              .localeCompare(
                String(
                  a.uploadedAt||''
                )
              )
          );

      return res
        .status(200)
        .json({
          ok:true,
          photos
        });
    }

    if(
      req.method!=='POST'
    ){
      return res
        .status(405)
        .json({
          ok:false,
          error:
            'Method not allowed'
        });
    }

    const action=
      String(
        req.body?.action ||
        ''
      );

    const state=
      await latestState();

    state.storyPhotoLibrary=
      library(state);


    if(action==='upload'){

      const requestId=String(
        req.body?.requestId||''
      );

      if(!/^[0-9a-f-]{36}$/i.test(requestId)){
        return res.status(400).json({
          ok:false,
          error:'Invalid upload request ID'
        });
      }

      const existing=state.storyPhotoLibrary.find(
        x=>String(x.id)===requestId
      );

      if(existing){
        return res.status(200).json({
          ok:true,
          photo:existing,
          count:state.storyPhotoLibrary.length,
          alreadyRegistered:true
        });
      }


      const {type,buffer,ext}=parseImageData(
        req.body?.imageData
      );

      const imageHash=crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex');

      // 同じ画像が登録済みなら再利用
      const duplicate=state.storyPhotoLibrary.find(
        x=>x.imageHash===imageHash
      );

      if(duplicate){
        return res.status(200).json({
          ok:true,
          photo:duplicate,
          count:state.storyPhotoLibrary.length,
          alreadyRegistered:true
        });
      }

      await ensureBucket();

      const path=`uploads/${requestId}.${ext}`;

      const latest=await latestState();
      latest.storyPhotoLibrary=library(latest);

      // 再試行・重複登録を再確認
      const found=latest.storyPhotoLibrary.find(
        x=>String(x.id)===requestId ||
           x.imageHash===imageHash
      );

      if(found){
        return res.status(200).json({
          ok:true,
          photo:found,
          count:latest.storyPhotoLibrary.length,
          alreadyRegistered:true
        });
      }

      await uploadObject(path,type,buffer);

      const item={
        id:requestId,
        storagePath:path,
        contentType:type,
        imageHash,
        originalName:String(req.body?.name||''),
        uploadedAt:new Date().toISOString(),
        active:true
      };

      latest.storyPhotoLibrary.push(item);
      await writeState(latest);

      return res.status(200).json({
        ok:true,
        photo:item,
        count:latest.storyPhotoLibrary.length
      });
    }



    if(action==='toggle'){

      const id=
        String(
          req.body?.id ||
          ''
        );

      const item=
        state
          .storyPhotoLibrary
          .find(
            x=>
              String(x.id)===
              id
          );

      if(!item){
        return res
          .status(404)
          .json({
            ok:false,
            error:
              'Photo not found'
          });
      }

      item.active=
        req.body?.active !==
        false;

      await writeState(
        state
      );

      return res
        .status(200)
        .json({
          ok:true,
          photo:item
        });
    }

    return res
      .status(400)
      .json({
        ok:false,
        error:
          'Invalid action'
      });

  }
  catch(e){

    console.error(
      'story library error',
      e
    );

    return res
      .status(500)
      .json({
        ok:false,
        error:
          e.message ||
          'Story library failed'
      });
  }
}
