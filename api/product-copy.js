const ALLOWED_ORIGINS = new Set([
  'https://kzgvsz7r97-star.github.io',
  'https://salon-manager-kzgvsz7r97-star.vercel.app'
]);

function cors(req,res){
  const origin=String(req.headers.origin||'');

  if(ALLOWED_ORIGINS.has(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
  }

  res.setHeader('Vary','Origin');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Backup-Key'
  );
}

function body(req){
  if(typeof req.body==='string'){
    try{
      return JSON.parse(req.body);
    }catch{
      return {};
    }
  }

  return req.body||{};
}

function safeUrl(value){
  try{
    const url=
      new URL(
        String(value||'').trim()
      );

    if(
      url.protocol!=='https:'||
      url.username||
      url.password
    ){
      return null;
    }

    const host=
      url.hostname.toLowerCase();

    if(
      host==='localhost'||
      host==='127.0.0.1'||
      host==='0.0.0.0'||
      host==='::1'||
      host.endsWith('.local')
    ){
      return null;
    }

    return url;

  }catch{
    return null;
  }
}

function decodeHtml(value){

  return String(value||'')

    .replace(/&nbsp;/gi,' ')

    .replace(/&amp;/gi,'&')

    .replace(/&quot;/gi,'"')

    .replace(/&#39;/gi,"'")

    .replace(/&lt;/gi,'<')

    .replace(/&gt;/gi,'>')

    .replace(
      /&#(\d+);/g,
      (_,n)=>
        String.fromCharCode(
          Number(n)||32
        )
    );
}

function meta(html,name){

  const list=[

    new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      'i'
    )

  ];

  for(const regex of list){

    const hit=
      html.match(regex);

    if(hit){
      return decodeHtml(
        hit[1]
      ).trim();
    }
  }

  return '';
}

function plainText(html){

  return decodeHtml(

    String(html||'')

      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        ' '
      )

      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        ' '
      )

      .replace(
        /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
        ' '
      )

      .replace(
        /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
        ' '
      )

      .replace(
        /<[^>]+>/g,
        ' '
      )

  )

  .replace(
    /\s+/g,
    ' '
  )

  .trim();
}

function unique(list){

  return [
    ...new Set(
      list.filter(Boolean)
    )
  ];
}

function makeCopy(text,title){

  const source=
    (
      String(title||'')+
      ' '+
      String(text||'')
    )
    .toLowerCase();

  const description=[];
  const recommended=[];
  const usage=[];

  if(
    /補修|ダメージ|ケラチン|cmc|タンパク|protein|repair/
      .test(source)
  ){

    description.push(
      'ダメージ部分を補修し、扱いやすい質感へ整えるヘアケアアイテムです。'
    );

    recommended.push(
      'カラーやブリーチ、アイロンなどによるダメージが気になる方'
    );
  }

  if(
    /保湿|うるお|潤い|moist|hydrate|乾燥/
      .test(source)
  ){

    description.push(
      '髪にうるおいを与え、乾燥によるパサつきを抑えます。'
    );

    recommended.push(
      '乾燥やパサつきが気になる方'
    );
  }

  if(
    /熱|ヒート|ドライヤー|アイロン|heat/
      .test(source)
  ){

    description.push(
      'ドライヤーやアイロンを使う毎日のケアにも取り入れやすいアイテムです。'
    );

    recommended.push(
      'ドライヤーやアイロンをよく使う方'
    );
  }

  if(
    /くせ|クセ|うねり|まとまり|広がり|frizz/
      .test(source)
  ){

    description.push(
      '広がりやうねりを抑え、まとまりやすい髪に整えます。'
    );

    recommended.push(
      '広がり・うねり・まとまりにくさが気になる方'
    );
  }

  if(
    /ツヤ|艶|shine|gloss/
      .test(source)
  ){

    description.push(
      '自然なツヤ感のある仕上がりを目指せます。'
    );

    recommended.push(
      'ツヤのある仕上がりが好きな方'
    );
  }

  if(
    /ミルク|emulsion|cream|クリーム/
      .test(source)
  ){

    usage.push(
      'タオルドライ後の髪に適量をなじませ、毛先中心に塗布してから乾かしてください。'
    );
  }

  if(
    /オイル|oil/
      .test(source)
  ){

    usage.push(
      '乾かす前または仕上げに、毛先中心へ少量ずつなじませてください。'
    );
  }

  if(
    /シャンプー|shampoo/
      .test(source)
  ){

    usage.push(
      '髪と頭皮をしっかり濡らし、適量を泡立てて洗ったあと十分にすすいでください。'
    );
  }

  if(
    /トリートメント|treatment|mask|マスク/
      .test(source)
  ){

    usage.push(
      'シャンプー後に水気を切り、中間〜毛先を中心になじませてからすすいでください。'
    );
  }

  if(!description.length){

    description.push(
      '公式商品情報をもとに、毎日のホームケアに取り入れやすい特徴をまとめたアイテムです。'
    );
  }

  if(!recommended.length){

    recommended.push(
      '自宅でもサロン帰りの質感をキープしたい方'
    );
  }

  if(!usage.length){

    usage.push(
      '使用量やタイミングは商品表示に従い、髪の長さ・量に合わせて調整してください。'
    );
  }

  return {

    description:
      unique(description)
        .slice(0,3)
        .join(' '),

    recommended:
      unique(recommended)
        .slice(0,4)
        .map(x=>'・'+x)
        .join('\n'),

    usage:
      unique(usage)
        .slice(0,3)
        .join(' ')

  };
}

export default async function handler(req,res){

  cors(req,res);

  if(req.method==='OPTIONS'){
    return res
      .status(204)
      .end();
  }

  if(req.method!=='POST'){

    return res
      .status(405)
      .json({
        ok:false,
        error:'Method not allowed'
      });
  }

  try{

    const data=
      body(req);

    const url=
      safeUrl(
        data.url
      );

    if(!url){

      return res
        .status(400)
        .json({
          ok:false,
          error:
            'https:// から始まる公式商品ページURLを入力してください'
        });
    }

    const controller=
      new AbortController();

    const timeout=
      setTimeout(
        ()=>
          controller.abort(),
        8000
      );

    let response;

    try{

      response=
        await fetch(
          url.href,
          {
            signal:
              controller.signal,

            headers:{
              'User-Agent':
                'Mozilla/5.0 SalonManager',
              Accept:
                'text/html,application/xhtml+xml'
            }
          }
        );

    }finally{

      clearTimeout(
        timeout
      );
    }

    if(!response.ok){

      throw new Error(
        '商品ページを取得できません'
      );
    }

    const type=
      String(
        response.headers
          .get('content-type')||
        ''
      );

    if(
      !type.includes(
        'text/html'
      )
    ){

      throw new Error(
        '商品ページではありません'
      );
    }

    const html=
      (
        await response.text()
      )
      .slice(
        0,
        1500000
      );

    const title=

      meta(
        html,
        'og:title'
      )

      ||

      decodeHtml(
        (
          html.match(
            /<title[^>]*>([\s\S]*?)<\/title>/i
          )||[]
        )[1]||''
      ).trim();

    const summary=

      meta(
        html,
        'description'
      )

      ||

      meta(
        html,
        'og:description'
      );

    const text=
      plainText(
        html
      )
      .slice(
        0,
        45000
      );

    const copy=
      makeCopy(
        [
          summary,
          text
        ]
        .filter(Boolean)
        .join(' '),
        title
      );

    return res
      .status(200)
      .json({
        ok:true,
        title:
          title.slice(
            0,
            200
          ),
        sourceUrl:
          url.href,
        ...copy
      });

  }catch(error){

    console.error(
      'product-copy',
      error.message
    );

    return res
      .status(502)
      .json({
        ok:false,
        error:
          'この商品ページを読み込めませんでした。別の公式商品ページURLを試してください'
      });
  }
}
