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

function cleanProductUrl(value){
  const url=
    safeUrl(value);

  if(!url)return null;

  [
    ...url.searchParams.keys()
  ].forEach(key=>{
    if(
      /^utm_/i.test(key)||
      /^(gclid|fbclid|msclkid|srsl.*)$/i.test(key)
    ){
      url.searchParams.delete(key);
    }
  });

  url.hash='';

  return url;
}

function shopifyProductHandle(url){
  const match=
    String(url?.pathname||'')
      .match(
        /\/products\/([^/?#]+)/i
      );

  return match?.[1]||'';
}

async function fetchWithTimeout(
  url,
  options={},
  timeoutMs=9000
){
  const controller=
    new AbortController();

  const timeout=
    setTimeout(
      ()=>controller.abort(),
      timeoutMs
    );

  try{
    return await fetch(
      url,
      {
        redirect:'follow',
        ...options,
        signal:controller.signal
      }
    );
  }finally{
    clearTimeout(timeout);
  }
}

function browserHeaders(pageUrl=''){
  return {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',

    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',

    'Accept-Language':
      'ja-JP,ja;q=0.9,en-US;q=0.7,en;q=0.5',

    'Cache-Control':
      'no-cache',

    ...(pageUrl
      ?{Referer:pageUrl}
      :{})
  };
}

async function fetchProductHtml(url){
  const response=
    await fetchWithTimeout(
      url.href,
      {
        headers:
          browserHeaders()
      },
      9000
    );

  if(!response.ok){
    throw new Error(
      `商品ページ取得失敗 ${response.status}`
    );
  }

  const type=
    String(
      response.headers
        .get('content-type')||
      ''
    ).toLowerCase();

  if(
    !type.includes('text/html')&&
    !type.includes('application/xhtml')
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
      1800000
    );

  if(!html){
    throw new Error(
      '商品ページが空です'
    );
  }

  return {
    html,
    finalUrl:
      cleanProductUrl(
        response.url
      )||url
  };
}

async function fetchShopifyProduct(pageUrl){
  const handle=
    shopifyProductHandle(
      pageUrl
    );

  if(!handle)return null;

  const base=
    pageUrl.origin+
    '/products/'+
    encodeURIComponent(handle);

  const urls=[
    base+'.js',
    base+'.json'
  ];

  for(const candidate of urls){

    try{
      const response=
        await fetchWithTimeout(
          candidate,
          {
            headers:{
              ...browserHeaders(
                pageUrl.href
              ),
              Accept:
                'application/json,text/javascript,*/*;q=0.8'
            }
          },
          8000
        );

      if(!response.ok){
        continue;
      }

      const type=
        String(
          response.headers
            .get('content-type')||
          ''
        )
        .toLowerCase();

      if(
        !type.includes('json')&&
        !type.includes('javascript')&&
        !type.includes('text/plain')
      ){
        continue;
      }

      const raw=
        await response.json();

      const p=
        raw?.product||
        raw;

      if(
        !p||
        typeof p!=='object'
      ){
        continue;
      }

      const title=
        String(
          p.title||
          ''
        ).trim();

      const description=
        plainText(
          p.body_html||
          p.description||
          ''
        );

      let imageUrl='';

      if(
        typeof p.featured_image===
        'string'
      ){
        imageUrl=
          p.featured_image;
      }else if(
        p.featured_image?.src
      ){
        imageUrl=
          p.featured_image.src;
      }

      if(
        !imageUrl&&
        Array.isArray(p.images)&&
        p.images.length
      ){
        const first=
          p.images[0];

        imageUrl=
          typeof first==='string'
            ?first
            :first?.src||'';
      }

      if(
        imageUrl&&
        imageUrl.startsWith('//')
      ){
        imageUrl=
          'https:'+
          imageUrl;
      }

      return {
        title,
        description,
        imageUrl
      };

    }catch{}
  }

  return null;
}

function imageAttr(tag,name){
  const hit=
    String(tag||'').match(
      new RegExp(
        `${name}=["']([^"']+)["']`,
        'i'
      )
    );

  return hit
    ?decodeHtml(hit[1]).trim()
    :'';
}

function imageAliases(productName){
  const name=
    normalize(productName);

  const aliases=[
    name
  ];

  if(name.includes('リケラ')){
    aliases.push(
      'rekera',
      'rekera'
    );
  }

  if(name.includes('エマルジョン')){
    aliases.push(
      'emulsion',
      'emu'
    );
  }

  if(name.includes('ミスト')){
    aliases.push(
      'mist'
    );
  }

  if(name.includes('オイル')){
    aliases.push(
      'oil'
    );
  }

  return unique(
    aliases
      .map(normalize)
      .filter(Boolean)
  );
}

function badImageWords(value){
  const raw=
    normalize(value);

  return [
    'logo',
    'ロゴ',
    'favicon',
    'icon',
    'アイコン',
    'header',
    'footer',
    'banner',
    'バナー',
    'menu',
    'sns',
    'instagram',
    'facebook',
    'youtube'
  ].some(
    word=>
      raw.includes(
        normalize(word)
      )
  );
}

function imageCandidates(
  html,
  pageUrl,
  productName
){
  const results=[];

  const source=
    String(html||'');

  const aliases=
    imageAliases(
      productName
    );

  const productNameNormalized=
    normalize(
      productName
    );

  const tokens=
    productTokens(
      productName
    );

  const regex=
    /<img\b[^>]*>/gi;

  let match;

  while(
    (
      match=
        regex.exec(source)
    )
  ){
    const tag=
      match[0];

    const alt=
      imageAttr(
        tag,
        'alt'
      );

    const rawUrls=[
      imageAttr(tag,'src'),
      imageAttr(tag,'data-src'),
      imageAttr(tag,'data-lazy-src'),
      imageAttr(tag,'data-original')
    ];

    const srcset=
      imageAttr(
        tag,
        'srcset'
      )
      ||
      imageAttr(
        tag,
        'data-srcset'
      );

    if(srcset){
      srcset
        .split(',')
        .forEach(part=>{
          const value=
            part
              .trim()
              .split(/\s+/)[0];

          if(value){
            rawUrls.push(value);
          }
        });
    }

    const start=
      Math.max(
        0,
        match.index-900
      );

    const end=
      Math.min(
        source.length,
        match.index+
        tag.length+
        1200
      );

    const nearby=
      plainText(
        source.slice(
          start,
          end
        )
      );

    for(
      const rawUrl
      of rawUrls
    ){
      if(!rawUrl)continue;

      try{
        let value=
          String(rawUrl)
            .trim();

        if(
          value.startsWith('//')
        ){
          value=
            'https:'+value;
        }

        const absolute=
          new URL(
            value,
            pageUrl
          );

        const safe=
          safeUrl(
            absolute.href
          );

        if(!safe)continue;

        const combined=
          normalize(
            [
              safe.href,
              alt,
              nearby
            ].join(' ')
          );

        let score=0;

        if(
          productNameNormalized&&
          normalize(nearby)
            .includes(
              productNameNormalized
            )
        ){
          score+=120;
        }

        if(
          productNameNormalized&&
          normalize(alt)
            .includes(
              productNameNormalized
            )
        ){
          score+=100;
        }

        aliases.forEach(
          alias=>{
            if(
              normalize(
                safe.href
              )
              .includes(alias)
            ){
              score+=45;
            }

            if(
              normalize(alt)
                .includes(alias)
            ){
              score+=35;
            }
          }
        );

        tokens.forEach(
          token=>{
            if(
              combined.includes(
                normalize(token)
              )
            ){
              score+=18;
            }
          }
        );

        if(
          /\.(png|jpe?g|webp)(?:\?|$)/i
            .test(
              safe.pathname+
              safe.search
            )
        ){
          score+=8;
        }

        if(
          /product|item|goods|rekera|emu|emulsion|mist|oil/i
            .test(
              safe.pathname
            )
        ){
          score+=12;
        }

        if(
          badImageWords(
            safe.href+
            ' '+
            alt
          )
        ){
          score-=180;
        }

        results.push({
          url:safe,
          score,
          index:match.index
        });

      }catch{}
    }
  }

  return results;
}

function productImageUrl(
  html,
  pageUrl,
  productName=''
){
  const candidates=
    imageCandidates(
      html,
      pageUrl,
      productName
    );

  if(candidates.length){
    candidates.sort(
      (a,b)=>
        b.score-a.score||
        a.index-b.index
    );

    if(
      candidates[0].score>0
    ){
      return candidates[0].url;
    }
  }

  const fallback=[
    meta(
      html,
      'og:image:secure_url'
    ),
    meta(
      html,
      'og:image'
    ),
    meta(
      html,
      'twitter:image'
    ),
    meta(
      html,
      'twitter:image:src'
    )
  ];

  for(
    const candidate
    of fallback
  ){
    if(
      !candidate||
      badImageWords(candidate)
    ){
      continue;
    }

    try{
      let value=
        String(candidate)
          .trim();

      if(
        value.startsWith('//')
      ){
        value=
          'https:'+value;
      }

      const absolute=
        new URL(
          value,
          pageUrl
        );

      const safe=
        safeUrl(
          absolute.href
        );

      if(safe){
        return safe;
      }

    }catch{}
  }

  return null;
}async function fetchProductImageData(
  imageUrl,
  pageUrl=''
){
  if(!imageUrl){
    return {
      imageData:'',
      imageUrl:''
    };
  }

  try{
    const response=
      await fetchWithTimeout(
        imageUrl.href,
        {
          headers:{
            ...browserHeaders(
              pageUrl
            ),

            Accept:
              'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8'
          }
        },
        7000
      );

    if(!response.ok){
      return {
        imageData:'',
        imageUrl:''
      };
    }

    const type=
      String(
        response.headers
          .get('content-type')||
        ''
      )
      .split(';')[0]
      .trim()
      .toLowerCase();

    if(
      ![
        'image/jpeg',
        'image/png',
        'image/webp'
      ].includes(type)
    ){
      return {
        imageData:'',
        imageUrl:''
      };
    }

    const declared=
      Number(
        response.headers
          .get('content-length')||
        0
      );

    const maxBytes=
      1500000;

    if(
      declared&&
      declared>maxBytes
    ){
      return {
        imageData:'',
        imageUrl:''
      };
    }

    const buffer=
      Buffer.from(
        await response.arrayBuffer()
      );

    if(
      !buffer.length||
      buffer.length>maxBytes
    ){
      return {
        imageData:'',
        imageUrl:''
      };
    }

    return {
      imageData:
        `data:${type};base64,${buffer.toString('base64')}`,

      imageUrl:
        imageUrl.href
    };

  }catch{
    return {
      imageData:'',
      imageUrl:''
    };
  }
}

export default async function handler(
  req,
  res
){
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
        error:
          'Method not allowed'
      });
  }

  try{
    const data=
      body(req);

    const url=
      cleanProductUrl(
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
        data.productName||
        ''
      )
      .trim()
      .slice(
        0,
        200
      );

    if(!requestedCategory){
      return res
        .status(400)
        .json({
          ok:false,
          error:
            '商品カテゴリを選択してください'
        });
    }

    let html='';
    let finalUrl=url;

    try{
      const page=
        await fetchProductHtml(
          url
        );

      html=
        page.html;

      finalUrl=
        page.finalUrl;

    }catch(error){
      console.warn(
        'normal product page fetch failed',
        error.message
      );
    }

    let shopify=null;

    try{
      shopify=
        await fetchShopifyProduct(
          finalUrl
        );
    }catch{}

    if(
      !html&&
      !shopify
    ){
      throw new Error(
        '商品ページを取得できません'
      );
    }

    const htmlTitle=
      html
        ?(
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
          ).trim()
        )
        :'';

    const title=
      shopify?.title||
      htmlTitle||
      productName;

    const summary=
      html
        ?(
          meta(
            html,
            'description'
          )
          ||
          meta(
            html,
            'og:description'
          )
        )
        :'';

    const fullText=
      [
        shopify?.description,
        summary,
        html
          ?plainText(html)
          :''
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

    let imageUrl=null;

    if(
      shopify?.imageUrl
    ){
      try{
        imageUrl=
          safeUrl(
            new URL(
              shopify.imageUrl,
              finalUrl.href
            ).href
          );
      }catch{}
    }

    if(
      !imageUrl&&
      html
    ){
      imageUrl=
        productImageUrl(
          html,
          finalUrl.href
        );
    }

    const image=
      await fetchProductImageData(
        imageUrl,
        finalUrl.href
      );

    return res
      .status(200)
      .json({
        ok:true,

        title:
          String(
            title||''
          )
          .slice(
            0,
            200
          ),

        sourceUrl:
          finalUrl.href,

        category:
          requestedCategory,

        focusLabel:
          productName
            ?`${productName} / ${requestedCategory}`
            :requestedCategory,

        imageData:
          image.imageData,

        imageUrl:
          image.imageUrl,

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
