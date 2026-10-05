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

  const productName=
    String(title||'')
      .split('|')[0]
      .trim();

  let source=
    (
      productName+
      ' '+
      String(text||'')
    )
    .replace(/\s+/g,' ')
    .trim();

  // 商品名が本文内にあれば、その商品付近から読む
  const productIndex=
    source.indexOf(productName);

  if(productName && productIndex>=0){
    source=
      source.slice(productIndex);
  }

  // 関連商品・ラインナップ以降を切って、
  // 他商品の情報が混ざるのを防ぐ
  const stopWords=[
    ' ラインナップ ',
    ' 関連商品 ',
    ' RELATED PRODUCTS ',
    ' RELATED ITEMS ',
    ' RECOMMEND '
  ];

  let cut=
    source.length;

  stopWords.forEach(word=>{

    const i=
      source.indexOf(word,100);

    if(i>=0 && i<cut){
      cut=i;
    }
  });

  source=
    source
      .slice(0,cut)
      .slice(0,6000);

  const lower=
    source.toLowerCase();

  const description=[];
  const recommended=[];
  const usage=[];


  // =========================
  // スプレー
  // =========================

  if(
    /スプレー|spray/
      .test(
        (
          productName+
          ' '+
          source.slice(0,1000)
        )
        .toLowerCase()
      )
  ){

    const hard=
      /しっかりハード|ハード|hard|strong hold|強力/
        .test(lower);

    const quick=
      /瞬間セット|速乾|クイック|quick/
        .test(lower);

    const soft=
      /ふんわり|やわらか|軽やか|soft/
        .test(lower);


    if(quick && hard){

      description.push(
        '瞬間的にセットしやすく、しっかりハードな仕上がりでスタイルをキープするヘアスプレーです。'
      );

    }else if(hard){

      description.push(
        'しっかりしたセット力で、仕上げたスタイルをキープしやすいハードタイプのヘアスプレーです。'
      );

    }else if(soft){

      description.push(
        '固めすぎず、軽さや動きを残しながら仕上げやすいヘアスプレーです。'
      );

    }else{

      description.push(
        'スタイリングの仕上げに使いやすいヘアスプレーです。'
      );
    }


    if(hard){

      recommended.push(
        'スタイルをしっかりキープしたい方'
      );

      recommended.push(
        '前髪や顔まわりなど、崩したくない部分がある方'
      );

      recommended.push(
        '巻き髪やスタイリングを長持ちさせたい方'
      );

    }else{

      recommended.push(
        'スタイリングの仕上げにスプレーを使いたい方'
      );
    }


    usage.push(
      'スタイリングの仕上げに、キープしたい部分へ少量ずつスプレーしてください。使用距離や使用量は商品表示に従って調整してください。'
    );


    return {

      description:
        unique(description)
          .join(' '),

      recommended:
        unique(recommended)
          .slice(0,4)
          .map(x=>'・'+x)
          .join('\n'),

      usage:
        unique(usage)
          .join(' ')
    };
  }


  // =========================
  // ヘアオイル
  // =========================

  if(
    /オイル|oil/
      .test(lower)
  ){

    description.push(
      '髪の質感を整え、毛先のまとまりやツヤを出しやすくするヘアオイルです。'
    );

    if(
      /ダメージ|補修|repair/
        .test(lower)
    ){

      recommended.push(
        'カラーやブリーチなどによるダメージが気になる方'
      );
    }

    if(
      /乾燥|パサつき|保湿|うるお/
        .test(lower)
    ){

      recommended.push(
        '乾燥やパサつきが気になる方'
      );
    }

    recommended.push(
      'ツヤやまとまりのある仕上がりにしたい方'
    );

    usage.push(
      'タオルドライ後または仕上げに、毛先を中心へ少量ずつなじませてください。'
    );
  }


  // =========================
  // ヘアミルク
  // =========================

  else if(
    /ミルク|エマルジョン|milk|emulsion/
      .test(lower)
  ){

    description.push(
      '髪にうるおいを与え、扱いやすい質感に整える洗い流さないトリートメントです。'
    );

    recommended.push(
      '乾燥やパサつきが気になる方'
    );

    recommended.push(
      '毛先のまとまりを良くしたい方'
    );

    usage.push(
      'タオルドライ後の髪に適量をなじませ、毛先を中心に塗布してから乾かしてください。'
    );
  }


  // =========================
  // シャンプー
  // =========================

  else if(
    /シャンプー|shampoo/
      .test(lower)
  ){

    description.push(
      '髪と頭皮を洗いながら、毎日のヘアケアをサポートするシャンプーです。'
    );

    recommended.push(
      '毎日のホームケアから髪を整えたい方'
    );

    usage.push(
      '髪と頭皮をしっかり濡らし、適量を泡立てて洗ったあと十分にすすいでください。'
    );
  }


  // =========================
  // トリートメント
  // =========================

  else if(
    /トリートメント|treatment|ヘアマスク|mask/
      .test(lower)
  ){

    description.push(
      'シャンプー後の髪をケアし、手触りやまとまりを整えるトリートメントです。'
    );

    if(
      /ダメージ|補修|repair/
        .test(lower)
    ){

      recommended.push(
        'カラーやブリーチなどによるダメージが気になる方'
      );
    }

    recommended.push(
      '手触りやまとまりを整えたい方'
    );

    usage.push(
      'シャンプー後に水気を切り、中間〜毛先を中心になじませてからすすいでください。'
    );
  }


  // =========================
  // その他
  // =========================

  else{

    description.push(
      `${productName || 'こちらの商品'}の公式商品情報をもとに、特徴をまとめています。`
    );

    recommended.push(
      '自宅でのヘアケアやスタイリングを整えたい方'
    );

    usage.push(
      '使用量やタイミングは商品表示に従って使用してください。'
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
        .slice(0,2)
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
