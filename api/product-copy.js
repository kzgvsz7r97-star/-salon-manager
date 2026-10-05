const ALLOWED_ORIGINS = new Set([
  'https://kzgvsz7r97-star.github.io',
  'https://salon-manager-kzgvsz7r97-star.vercel.app'
]);

const CATEGORIES = new Set([
  'シャンプー',
  'トリートメント',
  'オイル',
  'スプレー',
  '電子機器'
]);

const CATEGORY_WORDS = {
  'シャンプー': [
    'シャンプー','shampoo','洗浄','泡','頭皮','洗う'
  ],
  'トリートメント': [
    'トリートメント','treatment','ヘアマスク','hair mask','マスク',
    'コンディショナー','conditioner','ケア'
  ],
  'オイル': [
    'オイル','oil','セラム','serum','エッセンス','essence',
    '洗い流さない','アウトバス'
  ],
  'スプレー': [
    'スプレー','spray','ミスト','mist','キープ','hold','セット'
  ],
  '電子機器': [
    'ドライヤー','dryer','アイロン','iron','コテ','ブラシ','brush',
    '電子機器','refa','リファ'
  ]
};

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
    const hit=html.match(regex);

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
        /<(?:br|\/p|\/li|\/h1|\/h2|\/h3|\/h4|\/section|\/div)>/gi,
        '\n'
      )
      .replace(
        /<[^>]+>/g,
        ' '
      )
  )
  .replace(/[ \t]+/g,' ')
  .replace(/\n[ \t]+/g,'\n')
  .replace(/\n{3,}/g,'\n\n')
  .trim();
}

function unique(list){
  return [
    ...new Set(
      list.filter(Boolean)
    )
  ];
}

function normalize(value){
  return String(value||'')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g,' ')
    .trim();
}

function categoryFrom(value){
  const raw=String(value||'').trim();

  if(CATEGORIES.has(raw)){
    return raw;
  }

  const lower=normalize(raw);

  for(const [category,words] of Object.entries(CATEGORY_WORDS)){
    if(words.some(word=>lower.includes(normalize(word)))){
      return category;
    }
  }

  return '';
}

function productTokens(productName){
  const ignored=
    new Set([
      'professional','プロフェッショナル',
      'schwarzkopf','シュワルツコフ',
      'fibreplex','ファイバープレックス',
      'hair','ヘア'
    ]);

  return unique(
    String(productName||'')
      .normalize('NFKC')
      .split(/[\s|｜/／・\-–—_:：]+/)
      .map(x=>normalize(x))
      .filter(x=>x.length>=2&&!ignored.has(x))
  );
}

function sentenceList(text){
  return String(text||'')
    .split(
      /(?<=[。！？!?])\s+|\n+|(?<=\.)\s+(?=[A-Z0-9])/u
    )
    .map(x=>x.replace(/\s+/g,' ').trim())
    .filter(x=>x.length>=6&&x.length<=800);
}

function focusText(text,productName,category){
  const rows=sentenceList(text);

  if(!rows.length){
    return String(text||'').slice(0,7000);
  }

  const targetWords=
    CATEGORY_WORDS[category]||[];

  const otherWords=
    Object.entries(CATEGORY_WORDS)
      .filter(([name])=>name!==category)
      .flatMap(([,words])=>words);

  const tokens=
    productTokens(productName);

  const scored=
    rows.map((row,index)=>{
      const lower=normalize(row);
      let score=0;

      if(
        productName&&
        lower.includes(
          normalize(productName)
        )
      ){
        score+=18;
      }

      for(const token of tokens){
        if(lower.includes(token)){
          score+=7;
        }
      }

      for(const word of targetWords){
        if(
          lower.includes(
            normalize(word)
          )
        ){
          score+=5;
        }
      }

      for(const word of otherWords){
        if(
          lower.includes(
            normalize(word)
          )
        ){
          score-=3;
        }
      }

      if(
        /特徴|特長|おすすめ|使用方法|使い方|how to|technology|テクノロジー|成分|効果|ダメージ|補修|保湿|うるおい|まとまり|ツヤ|カラー|ブリーチ|頭皮/
          .test(lower)
      ){
        score+=2;
      }

      return {
        row,
        index,
        score
      };
    });

  const winners=
    scored
      .filter(x=>x.score>0)
      .sort(
        (a,b)=>
          b.score-a.score||
          a.index-b.index
      )
      .slice(0,18);

  if(!winners.length){
    return rows
      .filter(row=>{
        const lower=normalize(row);

        return targetWords.some(
          word=>
            lower.includes(
              normalize(word)
            )
        );
      })
      .slice(0,22)
      .join(' ')
      .slice(0,7000);
  }

  const wanted=
    new Set();

  winners.forEach(x=>{
    wanted.add(x.index);

    if(x.score>=10){
      if(x.index>0)wanted.add(x.index-1);
      if(x.index<rows.length-1)wanted.add(x.index+1);
    }
  });

  return [...wanted]
    .sort((a,b)=>a-b)
    .map(i=>rows[i])
    .join(' ')
    .slice(0,7000);
}

function hasAny(text,patterns){
  const lower=normalize(text);

  return patterns.some(
    x=>
      lower.includes(
        normalize(x)
      )
  );
}

function makeCopy(text,title,{category,productName}){
  const product=
    String(productName||'').trim();

  const source=
    (
      product+
      ' '+
      String(title||'')+
      ' '+
      String(text||'')
    )
    .replace(/\s+/g,' ')
    .trim();

  const description=[];
  const recommended=[];
  const usage=[];

  const damage=
    hasAny(
      source,
      [
        'ダメージ','補修','repair','bond','ボンド',
        'ブリーチ','bleach','カラー','color','fibreplex','ファイバープレックス'
      ]
    );

  const moisture=
    hasAny(
      source,
      [
        '保湿','うるおい','潤い','moisture','乾燥','パサつき'
      ]
    );

  const shine=
    hasAny(
      source,
      [
        'ツヤ','艶','shine','gloss','まとまり','smooth'
      ]
    );

  if(category==='シャンプー'){
    description.push(
      damage
        ?'カラーやブリーチなどでダメージを受けた髪を毎日の洗浄からケアし、扱いやすい状態へ整えるシャンプーです。'
        :'髪と頭皮を洗いながら、毎日のホームケアで髪を扱いやすい状態へ整えるシャンプーです。'
    );

    if(damage){
      recommended.push(
        'カラーやブリーチによるダメージが気になる方'
      );
    }

    if(moisture){
      recommended.push(
        '乾燥やパサつきが気になる方'
      );
    }

    recommended.push(
      '毎日のシャンプーから髪のコンディションを整えたい方'
    );

    usage.push(
      '髪と頭皮をしっかり濡らし、適量を泡立ててやさしく洗ったあと十分にすすいでください。'
    );
  }

  else if(category==='トリートメント'){
    description.push(
      damage
        ?'カラーやブリーチなどによるダメージをケアし、毛先まで手触りとまとまりを整えるトリートメントです。'
        :'シャンプー後の髪をケアし、手触りやまとまりを整えるトリートメントです。'
    );

    if(damage){
      recommended.push(
        'カラーやブリーチによるダメージが気になる方'
      );
    }

    if(moisture){
      recommended.push(
        '乾燥やパサつきを抑えたい方'
      );
    }

    recommended.push(
      '手触りやまとまりを整えたい方'
    );

    usage.push(
      'シャンプー後に水気を切り、中間〜毛先を中心になじませてから十分にすすいでください。'
    );
  }

  else if(category==='オイル'){
    description.push(
      damage
        ?'ダメージを受けた髪の質感を整えながら、毛先のまとまりやツヤを出しやすくするヘアオイルです。'
        :'髪の質感を整え、毛先のまとまりやツヤを出しやすくするヘアオイルです。'
    );

    if(damage){
      recommended.push(
        'カラーやブリーチによるダメージが気になる方'
      );
    }

    if(moisture){
      recommended.push(
        '乾燥やパサつきが気になる方'
      );
    }

    if(shine){
      recommended.push(
        'ツヤやまとまりのある仕上がりにしたい方'
      );
    }else{
      recommended.push(
        '毛先をまとまりやすくしたい方'
      );
    }

    usage.push(
      'タオルドライ後または仕上げに、毛先を中心へ少量ずつなじませてください。'
    );
  }

  else if(category==='スプレー'){
    const hard=
      hasAny(
        source,
        [
          'ハード','hard','strong hold','強力','キープ'
        ]
      );

    const soft=
      hasAny(
        source,
        [
          'ふんわり','やわらか','soft','軽やか'
        ]
      );

    if(hard){
      description.push(
        '仕上げたスタイルをしっかりキープしやすいヘアスプレーです。'
      );
      recommended.push(
        '前髪や顔まわりなど崩したくない部分がある方'
      );
      recommended.push(
        '巻き髪やスタイリングを長持ちさせたい方'
      );
    }else if(soft){
      description.push(
        '固めすぎず、軽さや動きを残しながら仕上げやすいヘアスプレーです。'
      );
      recommended.push(
        '自然な質感を残しながらスタイリングしたい方'
      );
    }else{
      description.push(
        'スタイリングの仕上げに使いやすいヘアスプレーです。'
      );
      recommended.push(
        'スタイリングの仕上げにスプレーを使いたい方'
      );
    }

    usage.push(
      'スタイリングの仕上げに、キープしたい部分へ少量ずつスプレーしてください。使用距離や使用量は商品表示に従って調整してください。'
    );
  }

  else if(category==='電子機器'){
    description.push(
      '毎日のスタイリングやヘアケアをサポートする美容機器です。'
    );

    recommended.push(
      '自宅でのスタイリングをしやすくしたい方'
    );

    usage.push(
      '安全上の注意を確認し、商品説明書に記載された方法で使用してください。'
    );
  }

  else{
    description.push(
      `${product||'こちらの商品'}の公式商品情報をもとに特徴をまとめています。`
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

    const requestedCategory=
      categoryFrom(
        data.category
      );

    const productName=
      String(
        data.productName||''
      )
      .trim()
      .slice(0,200);

    if(!requestedCategory){
      return res
        .status(400)
        .json({
          ok:false,
          error:
            '商品カテゴリを選択してください'
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

    const fullText=
      [
        summary,
        plainText(
          html
        )
      ]
      .filter(Boolean)
      .join('\n')
      .slice(
        0,
        50000
      );

    const focused=
      focusText(
        fullText,
        productName,
        requestedCategory
      );

    const copy=
      makeCopy(
        focused,
        title,
        {
          category:
            requestedCategory,
          productName
        }
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

        category:
          requestedCategory,

        focusLabel:
          productName
            ?`${productName} / ${requestedCategory}`
            :requestedCategory,

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
