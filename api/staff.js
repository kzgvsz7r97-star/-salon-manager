import crypto from 'crypto';

const ORIGINS=new Set([
  'https://kzgvsz7r97-star.github.io',
  'https://salon-manager-kzgvsz7r97-star.vercel.app'
]);
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
const STATUS=new Set(['booked','visited','cancelled','noshow']);
const BOOKING_TYPE=new Set(['','free','designated']);
const ORDER_STATUS=new Set(['new','ordered','ready','completed','cancelled']);

function cors(req,res){
  const origin=req.headers.origin||'';
  if(ORIGINS.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Backup-Key');
}

function body(req){
  if(typeof req.body==='string'){
    try{return JSON.parse(req.body);}catch{return {};}
  }
  return req.body||{};
}

function admin(req){
  return !!process.env.BACKUP_KEY&&req.headers['x-backup-key']===process.env.BACKUP_KEY;
}

async function rest(path,options={}){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)
    throw new Error('Storage is not configured');

  const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+path,{
    ...options,
    headers:{
      'Content-Type':'application/json',
      apikey:process.env.SUPABASE_SECRET_KEY,
      Authorization:'Bearer '+process.env.SUPABASE_SECRET_KEY,
      ...options.headers
    }
  });

  const raw=await r.text();

  if(!r.ok){
    const e=new Error(raw||'Storage request failed');
    e.status=r.status;
    try{e.code=JSON.parse(raw).code;}catch{}
    throw e;
  }

  return raw?JSON.parse(raw):null;
}

function normalizeUsername(v){
  return String(v||'').trim().toLowerCase();
}

function validUsername(v){
  return /^[a-z0-9._-]{3,40}$/.test(normalizeUsername(v));
}

function validPassword(v){
  return typeof v==='string'&&v.length>=8&&v.length<=128;
}

function hashPassword(password){
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync(password,salt,32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password,stored){
  try{
    const [kind,salt,hex]=String(stored||'').split('$');
    if(kind!=='scrypt'||!salt||!hex)return false;

    const a=crypto.scryptSync(password,salt,32);
    const b=Buffer.from(hex,'hex');

    return a.length===b.length&&crypto.timingSafeEqual(a,b);
  }catch{
    return false;
  }
}

function sessionSecret(){
  const root=process.env.SALON_SESSION_SECRET||process.env.SALON_APP_KEY;

  if(!root)throw new Error('Session secret is not configured');

  return crypto
    .createHmac('sha256',root)
    .update('salon-manager-staff-session-v1')
    .digest();
}

function signSession(user){
  const payload={
    sub:user.id,
    staffId:user.staff_id,
    exp:Math.floor(Date.now()/1000)+60*60*24*30
  };

  const data=Buffer.from(JSON.stringify(payload)).toString('base64url');

  const sig=crypto
    .createHmac('sha256',sessionSecret())
    .update(data)
    .digest('base64url');

  return data+'.'+sig;
}

function readSession(req){
  const auth=String(req.headers.authorization||'');
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  const parts=token.split('.');

  if(parts.length!==2)return null;

  try{
    const [data,sig]=parts;

    const expected=crypto
      .createHmac('sha256',sessionSecret())
      .update(data)
      .digest('base64url');

    const a=Buffer.from(sig);
    const b=Buffer.from(expected);

    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;

    const p=JSON.parse(
      Buffer.from(data,'base64url').toString('utf8')
    );

    if(
      !p.exp||
      p.exp<Math.floor(Date.now()/1000)||
      !p.staffId
    )return null;

    return p;
  }catch{
    return null;
  }
}

function normalizeName(v){
  return String(v||'')
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60))
    .replace(/[\s・･]/g,'')
    .toLowerCase();
}

function uid(){
  return crypto.randomUUID();
}

async function latestState(){
  const rows=await rest(
    'salon-backups?select=id,created_at,data&order=created_at.desc&limit=1'
  );

  return rows?.[0]||null;
}

async function writeState(data){
  await rest('salon-backups',{
    method:'POST',
    headers:{
      Prefer:'return=minimal'
    },
    body:JSON.stringify({
      data
    })
  });
}

function ensureDeleted(state){
  state.syncDeleted ||= {
    bookings:{},
    customers:{},
    products:{},
    sales:{},
    retail:{}
  };

  ['bookings','customers','products','sales','retail']
    .forEach(k=>state.syncDeleted[k] ||= {});
}

function deleted(state,kind,id){
  return !!state?.syncDeleted?.[kind]?.[String(id)];
}

function profileFor(state,staffId){
  return (state.staffProfiles||[])
    .find(
      p=>
        p.id===staffId&&
        p.active!==false
    )||null;
}

function staffBookings(state,staffId){
  return (state.bookings||[])
    .filter(
      b=>
        b.staffId===staffId&&
        !deleted(state,'bookings',b.id)
    );
}

function staffCustomers(state,bookings){
  const names=new Set(
    bookings
      .map(b=>normalizeName(b.customer))
      .filter(Boolean)
  );

  return (state.customers||[])
    .filter(
      c=>
        names.has(normalizeName(c.name))&&
        !deleted(state,'customers',c.id)
    );
}

function staffSales(state,staffId){
  return (state.sales||[])
    .filter(
      x=>
        x.staffId===staffId&&
        !deleted(state,'sales',x.id)
    );
}

function staffRetail(state,staffId){
  return (state.retail||[])
    .filter(
      x=>
        x.staffId===staffId&&
        !deleted(state,'retail',x.id)
    );
}

function safeHTTPS(v){
  const raw=String(v||'').trim();

  if(!raw)return '';

  try{
    const u=new URL(raw);

    if(
      u.protocol!=='https:'||
      u.username||
      u.password
    )return '';

    return u.href;
  }catch{
    return '';
  }
}

function ownCatalog(profile){
  return Array.isArray(profile.retailCatalog)
    ?profile.retailCatalog
    :[];
}

async function ordersForStaff(profile){
  const rows=await rest(
    'salon-product-orders?select=id,customer_name,contact,visit_date,note,items,total,status,created_at,updated_at&order=created_at.desc&limit=200'
  );

  const catalog=ownCatalog(profile);

  return (rows||[])
    .map(o=>{

      const items=
        (Array.isArray(o.items)?o.items:[])
          .filter(
            i=>
              String(i.sellerId||'')===
              String(profile.id)
          )
          .map(i=>{

            const p=
              catalog.find(
                x=>
                  String(x.id)===
                  String(i.productId)
              );

            return{
              productId:i.productId,
              sellerId:profile.id,
              name:i.name||p?.name||'商品',
              category:i.category||p?.category||'その他',
              price:Number(i.price??p?.price??0),
              quantity:Number(i.quantity||1),
              supplierUrl:p?.supplierUrl||p?.url||'',
              cost:Number(p?.cost||0),
              customerLineQr:String(i.customerLineQr||'')
            };
          });

      if(!items.length)return null;

      return{
        id:o.id,
        customer_name:o.customer_name,
        contact:o.contact,
        visit_date:o.visit_date,
        note:o.note,
        items,

        total:
          items.reduce(
            (sum,i)=>
              sum+
              Number(i.price||0)*
              Number(i.quantity||1),
            0
          ),

        status:o.status,
        created_at:o.created_at,
        updated_at:o.updated_at
      };

    })
    .filter(Boolean);
}

async function responseState(state,profile){
  const bookings=staffBookings(
    state,
    profile.id
  );

  return{
    profile:{
      id:profile.id,
      name:profile.name,
      role:profile.role||'staff',
      sources:Array.isArray(profile.sources)?profile.sources:[],
      retailCatalog:ownCatalog(profile),
      notifyLineUserId:String(profile.notifyLineUserId||''),
      goals:profile.goals||{}
    },

    bookings,

    customers:
      staffCustomers(
        state,
        bookings
      ),

    sales:
      staffSales(
        state,
        profile.id
      ),

    retail:
      staffRetail(
        state,
        profile.id
      ),

    products:[],

    orders:
      await ordersForStaff(
        profile
      )
  };
}

function sanitizeBooking(raw,profile,id){
  const sources=
    Array.isArray(profile.sources)&&profile.sources.length
      ?profile.sources
      :['その他'];

  const source=
    sources.includes(raw.source)
      ?raw.source
      :sources[0];

  const date=String(raw.date||'');
  const time=String(raw.time||'');
  const end=String(raw.end||'');
  const customer=String(raw.customer||'').trim().slice(0,100);
  const menu=String(raw.menu||'').trim().slice(0,200);

  if(
    !DATE.test(date)||
    !TIME.test(time)||
    (end&&!TIME.test(end))||
    !customer
  ){
    throw new Error('予約内容を確認してください');
  }

  return{
    id:id||uid(),
    date,
    time,
    end,
    customer,
    menu,

    price:
      Math.max(
        0,
        Math.min(
          1000000,
          Math.round(Number(raw.price)||0)
        )
      ),

    source,

    staffId:
      profile.id,

    bookingType:
      BOOKING_TYPE.has(raw.bookingType)
        ?raw.bookingType
        :'',

    isModel:
      !!raw.isModel,

    newGuest:
      !!raw.newGuest,

    status:
      STATUS.has(raw.status)
        ?raw.status
        :'booked',

    nextBookingTaken:
      !!raw.nextBookingTaken,

    followAftercare:
      !!raw.followAftercare,

    followWeek:
      !!raw.followWeek,

    follow2Days:
      !!raw.follow2Days,

    paymentComplete:
      !!raw.paymentComplete,

    formula:
      String(raw.formula||'').slice(0,1500),

    visitNote:
      String(raw.visitNote||'').slice(0,2500)
  };
}

function touchCustomer(state,b){
  const n=normalizeName(b.customer);

  if(!n)return;

  let c=(state.customers||[])
    .find(
      x=>
        normalizeName(x.name)===n&&
        !deleted(state,'customers',x.id)
    );

  if(!c){
    c={
      id:uid(),
      name:b.customer,
      lastVisit:'',
      note:''
    };

    state.customers=[
      ...(state.customers||[]),
      c
    ];
  }

  const visited=
    b.status==='visited'||
    (
      b.paymentComplete&&
      b.date<
      new Date()
        .toISOString()
        .slice(0,10)
    );

  if(
    visited&&
    (
      !c.lastVisit||
      b.date>c.lastVisit
    )
  ){
    c.lastVisit=b.date;
  }
}

async function adminHandler(req,res){
  if(!admin(req)){
    return res
      .status(401)
      .json({
        ok:false,
        error:'Unauthorized'
      });
  }

  if(req.method==='GET'){
    const users=await rest(
      'salon_staff_users?select=id,staff_id,username,role,active,created_at,updated_at&order=created_at.asc'
    );

    return res
      .status(200)
      .json({
        ok:true,
        users:users||[]
      });
  }

  const b=body(req);

  if(b.action!=='adminSave'){
    return res
      .status(400)
      .json({
        ok:false,
        error:'操作を確認してください'
      });
  }

  const staffId=String(b.staffId||'').trim();
  const username=normalizeUsername(b.username);
  const password=String(b.password||'');
  const active=b.active!==false;
  const role=b.role==='owner'?'owner':'staff';

  if(
    !/^[-a-zA-Z0-9_]{1,100}$/.test(staffId)||
    !validUsername(username)
  ){
    return res
      .status(400)
      .json({
        ok:false,
        error:'スタッフIDまたはユーザー名を確認してください'
      });
  }

  const existing=await rest(
    'salon_staff_users?staff_id=eq.'+
    encodeURIComponent(staffId)+
    '&select=id,password_hash&limit=1'
  );

  const row=existing?.[0];

  if(
    !row&&
    !validPassword(password)
  ){
    return res
      .status(400)
      .json({
        ok:false,
        error:'初回パスワードは8文字以上にしてください'
      });
  }

  if(
    password&&
    !validPassword(password)
  ){
    return res
      .status(400)
      .json({
        ok:false,
        error:'パスワードは8〜128文字にしてください'
      });
  }

  const payload={
    staff_id:staffId,
    username,
    role,
    active,
    updated_at:new Date().toISOString()
  };

  if(password){
    payload.password_hash=
      hashPassword(password);
  }

  if(row){

    await rest(
      'salon_staff_users?id=eq.'+
      encodeURIComponent(row.id),
      {
        method:'PATCH',
        headers:{
          Prefer:'return=minimal'
        },
        body:JSON.stringify(payload)
      }
    );

  }else{

    payload.password_hash=
      hashPassword(password);

    await rest(
      'salon_staff_users',
      {
        method:'POST',
        headers:{
          Prefer:'return=minimal'
        },
        body:JSON.stringify(payload)
      }
    );
  }

  return res
    .status(200)
    .json({
      ok:true
    });
}

async function loginHandler(req,res,b){
  const username=normalizeUsername(b.username);
  const password=String(b.password||'');

  if(
    !username||
    !password
  ){
    return res
      .status(400)
      .json({
        ok:false,
        error:'ユーザー名とパスワードを入力してください'
      });
  }

  const rows=await rest(
    'salon_staff_users?username=eq.'+
    encodeURIComponent(username)+
    '&select=id,staff_id,username,password_hash,role,active&limit=1'
  );

  const user=rows?.[0];

  if(
    !user||
    user.active===false||
    !verifyPassword(password,user.password_hash)
  ){
    return res
      .status(401)
      .json({
        ok:false,
        error:'ログイン情報が違います'
      });
  }

  return res
    .status(200)
    .json({
      ok:true,
      token:signSession(user),

      staff:{
        staffId:user.staff_id,
        username:user.username
      }
    });
}

async function staffHandler(req,res,session){
  const users=await rest(
    'salon_staff_users?id=eq.'+
    encodeURIComponent(session.sub)+
    '&select=id,staff_id,active&limit=1'
  );

  const user=users?.[0];

  if(
    !user||
    user.active===false||
    user.staff_id!==session.staffId
  ){
    return res
      .status(401)
      .json({
        ok:false,
        error:'アカウントが無効です'
      });
  }

  const latest=await latestState();
  const state=latest?.data||{};

  ensureDeleted(state);

  const profile=profileFor(
    state,
    session.staffId
  );

  if(!profile){
    return res
      .status(403)
      .json({
        ok:false,
        error:'スタッフ設定が停止されています'
      });
  }

  if(req.method==='GET'){
    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  const b=body(req);
  const action=String(b.action||'');

  if(action==='upsertBooking'){
    const raw=b.booking||{};
    const id=String(raw.id||'').trim();

    const existing=
      id
        ?(state.bookings||[]).find(x=>x.id===id)
        :null;

    if(
      existing&&
      existing.staffId!==profile.id
    ){
      return res
        .status(403)
        .json({
          ok:false,
          error:'この予約は編集できません'
        });
    }

    const clean=
      sanitizeBooking(
        raw,
        profile,
        id||existing?.id||''
      );

    state.bookings=
      existing
        ?(state.bookings||[])
          .map(
            x=>
              x.id===existing.id
                ?{...existing,...clean}
                :x
          )
        :[
          ...(state.bookings||[]),
          clean
        ];

    if(
      state.syncDeleted.bookings[clean.id]
    ){
      delete state.syncDeleted.bookings[clean.id];
    }

    touchCustomer(
      state,
      clean
    );

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='deleteBooking'){
    const id=String(b.id||'');

    const existing=
      (state.bookings||[])
        .find(x=>x.id===id);

    if(
      !existing||
      existing.staffId!==profile.id
    ){
      return res
        .status(404)
        .json({
          ok:false,
          error:'予約が見つかりません'
        });
    }

    state.syncDeleted.bookings[id]=
      Date.now();

    state.bookings=
      (state.bookings||[])
        .filter(x=>x.id!==id);

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='updateCustomer'){
    const c=b.customer||{};
    const id=String(c.id||'');

    const own=
      staffCustomers(
        state,
        staffBookings(state,profile.id)
      );

    const existing=
      own.find(x=>x.id===id);

    if(!existing){
      return res
        .status(403)
        .json({
          ok:false,
          error:'この顧客は編集できません'
        });
    }

    const patch={
      note:
        String(c.note||'').slice(0,4000),

      kana:
        String(c.kana||'').slice(0,100),

      instagram:
        String(c.instagram||'').trim().slice(0,200),

      reminderSnoozeUntil:
        String(c.reminderSnoozeUntil||'').slice(0,10)
    };

    state.customers=
      (state.customers||[])
        .map(
          x=>
            x.id===id
              ?{...x,...patch}
              :x
        );

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='updatePreferences'){
    const rawSources=
      Array.isArray(b.sources)
        ?b.sources
        :[];

    const sources=[
      ...new Set(
        rawSources
          .map(
            x=>
              String(x||'')
                .trim()
                .slice(0,80)
          )
          .filter(Boolean)
      )
    ].slice(0,20);

    if(!sources.length){
      return res
        .status(400)
        .json({
          ok:false,
          error:'予約サイトを1つ以上選んでください'
        });
    }

    profile.sources=sources;

    state.staffProfiles=
      (state.staffProfiles||[])
        .map(
          p=>
            p.id===profile.id
              ?{...p,sources:profile.sources}
              :p
        );

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='updateOrderNotification'){
    const notifyLineUserId=
      String(b.notifyLineUserId||'').trim();

    if(
      notifyLineUserId&&
      !/^U[0-9a-f]{32}$/i.test(notifyLineUserId)
    ){
      return res
        .status(400)
        .json({
          ok:false,
          error:'LINE連携IDを確認してください'
        });
    }

    profile.notifyLineUserId=
      notifyLineUserId;

    state.staffProfiles=
      (state.staffProfiles||[])
        .map(
          p=>
            p.id===profile.id
              ?{...p,notifyLineUserId}
              :p
        );

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='upsertStaffProduct'){
    const raw=b.product||{};
    const id=String(raw.id||'').trim();
    const catalog=ownCatalog(profile);

    const existing=
      id
        ?catalog.find(x=>String(x.id)===id)
        :null;

    const name=
      String(raw.name||'')
        .trim()
        .slice(0,150);

    const category=
      String(raw.category||'その他')
        .trim()
        .slice(0,80)
      ||
      'その他';

    const supplierUrl=
      safeHTTPS(
        raw.supplierUrl||
        raw.url
      );

    const officialUrl=
      safeHTTPS(
        raw.officialUrl
      );

    const price=
      Math.max(
        0,
        Math.min(
          1000000,
          Math.round(Number(raw.price)||0)
        )
      );

    const cost=
      Math.max(
        0,
        Math.min(
          1000000,
          Math.round(Number(raw.cost)||0)
        )
      );

    const description=
      String(raw.description||'')
        .trim()
        .slice(0,1500);

    const recommended=
      String(raw.recommended||'')
        .trim()
        .slice(0,1500);

    const usage=
      String(raw.usage||'')
        .trim()
        .slice(0,1500);

    const active=
      raw.active!==false;

    if(!name){
      return res
        .status(400)
        .json({
          ok:false,
          error:'商品名を入力してください'
        });
    }

    if(!supplierUrl){
      return res
        .status(400)
        .json({
          ok:false,
          error:'https://から始まる仕入れ先URLを入力してください'
        });
    }

    if(
      active&&
      price<=0
    ){
      return res
        .status(400)
        .json({
          ok:false,
          error:'注文ページに掲載する商品の販売価格を入力してください'
        });
    }

    const clean={
      id:existing?.id||uid(),
      name,
      category,
      officialUrl,
      supplierUrl,
      price,
      cost,
      description,
      recommended,
      usage,
      active
    };

    profile.retailCatalog=
      existing
        ?catalog.map(
          x=>
            String(x.id)===String(existing.id)
              ?{...x,...clean}
              :x
        )
        :[
          ...catalog,
          clean
        ];

    state.staffProfiles=
      (state.staffProfiles||[])
        .map(
          p=>
            p.id===profile.id
              ?{
                ...p,
                retailCatalog:
                  profile.retailCatalog
              }
              :p
        );

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='reorderStaffProducts'){
    const catalog=ownCatalog(profile);

    const ids=
      Array.isArray(b.ids)
        ?b.ids.map(x=>String(x||'')).filter(Boolean)
        :[];

    const currentIds=
      catalog.map(x=>String(x.id||''));

    const valid=
      ids.length===currentIds.length&&
      new Set(ids).size===ids.length&&
      currentIds.every(id=>ids.includes(id));

    if(!valid){
      return res
        .status(400)
        .json({
          ok:false,
          error:'商品順を確認してください'
        });
    }

    const map=
      new Map(
        catalog.map(
          p=>[
            String(p.id),
            p
          ]
        )
      );

    profile.retailCatalog=
      ids
        .map(id=>map.get(id))
        .filter(Boolean);

    state.staffProfiles=
      (state.staffProfiles||[])
        .map(
          p=>
            p.id===profile.id
              ?{
                ...p,
                retailCatalog:
                  profile.retailCatalog
              }
              :p
        );

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='deleteStaffProduct'){
    const id=String(b.id||'');
    const catalog=ownCatalog(profile);

    if(
      !catalog.some(
        x=>String(x.id)===id
      )
    ){
      return res
        .status(404)
        .json({
          ok:false,
          error:'商品が見つかりません'
        });
    }

    profile.retailCatalog=
      catalog.filter(
        x=>String(x.id)!==id
      );

    state.staffProfiles=
      (state.staffProfiles||[])
        .map(
          p=>
            p.id===profile.id
              ?{
                ...p,
                retailCatalog:
                  profile.retailCatalog
              }
              :p
        );

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='updateOrderStatus'){
    const id=String(b.id||'');
    const nextStatus=String(b.status||'');

    if(
      !ORDER_STATUS.has(nextStatus)
    ){
      return res
        .status(400)
        .json({
          ok:false,
          error:'注文状況を確認してください'
        });
    }

    const found=await rest(
      'salon-product-orders?id=eq.'+
      encodeURIComponent(id)+
      '&select=id,customer_name,contact,visit_date,note,items,total,status&limit=1'
    );

    const order=found?.[0];

    if(!order){
      return res
        .status(404)
        .json({
          ok:false,
          error:'注文が見つかりません'
        });
    }

    const ownItems=
      (Array.isArray(order.items)?order.items:[])
        .filter(
          i=>
            String(i.sellerId||'')===
            String(profile.id)
        );

    if(!ownItems.length){
      return res
        .status(403)
        .json({
          ok:false,
          error:'この注文は変更できません'
        });
    }

    if(
      order.status==='completed'&&
      nextStatus!=='completed'
    ){
      return res
        .status(400)
        .json({
          ok:false,
          error:'お渡し済みの注文は元に戻せません'
        });
    }

    if(
      nextStatus==='completed'&&
      order.status!=='completed'
    ){

      const existingOrderRows=
        (state.retail||[])
          .filter(
            x=>
              x.staffId===profile.id&&
              String(x.orderId||'')===
              String(order.id)
          );

      for(
        const item
        of ownItems
      ){

        const already=
          existingOrderRows.some(
            x=>
              String(x.productId||'')===
              String(item.productId)
          );

        if(already)continue;

        const quantity=
          Math.max(
            1,
            Math.round(
              Number(item.quantity)||1
            )
          );

        const amount=
          Math.max(
            0,
            Math.round(
              Number(item.price)||0
            )*
            quantity
          );

        state.retail=[
          ...(state.retail||[]),
          {
            id:uid(),

            date:
              String(
                order.visit_date||
                new Date()
                  .toISOString()
                  .slice(0,10)
              ),

            product:
              String(item.name||'商品')
                .slice(0,150),

            productId:
              String(item.productId||''),

            category:
              String(item.category||'その他')
                .slice(0,80),

            quantity,

            customer:
              String(order.customer_name||'')
                .slice(0,100),

            amount,

            staffId:
              profile.id,

            orderId:
              order.id,

            source:
              'customer-order'
          }
        ];
      }

      await writeState(state);
    }

    await rest(
      'salon-product-orders?id=eq.'+
      encodeURIComponent(id),
      {
        method:'PATCH',
        headers:{
          Prefer:'return=minimal'
        },
        body:JSON.stringify({
          status:nextStatus,
          updated_at:new Date().toISOString()
        })
      }
    );

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='setGoal'){
    const month=String(b.month||'');

    const amount=
      Math.max(
        0,
        Math.min(
          100000000,
          Math.round(Number(b.amount)||0)
        )
      );

    if(!/^20\d{2}-\d{2}$/.test(month)){
      return res
        .status(400)
        .json({
          ok:false,
          error:'対象月を確認してください'
        });
    }

    profile.goals={
      ...(profile.goals||{}),
      [month]:amount
    };

    state.staffProfiles=
      (state.staffProfiles||[])
        .map(
          p=>
            p.id===profile.id
              ?{
                ...p,
                goals:profile.goals
              }
              :p
        );

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='addSale'){
    const x=b.sale||{};
    const date=String(x.date||'');

    const amount=
      Math.max(
        0,
        Math.min(
          1000000,
          Math.round(Number(x.amount)||0)
        )
      );

    if(
      !DATE.test(date)||
      !amount
    ){
      return res
        .status(400)
        .json({
          ok:false,
          error:'日付と金額を確認してください'
        });
    }

    state.sales=[
      ...(state.sales||[]),
      {
        id:uid(),
        date,

        customer:
          String(x.customer||'')
            .trim()
            .slice(0,100),

        menu:
          String(x.menu||'追加売上')
            .trim()
            .slice(0,200),

        amount,
        staffId:profile.id
      }
    ];

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='deleteSale'){
    const id=String(b.id||'');

    const existing=
      (state.sales||[])
        .find(
          x=>
            x.id===id&&
            x.staffId===profile.id
        );

    if(!existing){
      return res
        .status(404)
        .json({
          ok:false,
          error:'売上が見つかりません'
        });
    }

    state.syncDeleted.sales[id]=Date.now();

    state.sales=
      (state.sales||[])
        .filter(x=>x.id!==id);

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='addRetail'){
    const x=b.retail||{};
    const productId=String(x.productId||'');
    const catalog=ownCatalog(profile);

    const product=
      catalog.find(
        p=>
          String(p.id)===productId&&
          p.active!==false
      );

    const date=String(x.date||'');
    const quantity=Math.round(Number(x.quantity)||0);

    const amount=
      Math.max(
        0,
        Math.min(
          1000000,
          Math.round(Number(x.amount)||0)
        )
      );

    if(!product){
      return res
        .status(400)
        .json({
          ok:false,
          error:'登録した商品から選択してください'
        });
    }

    if(
      !DATE.test(date)||
      quantity<1||
      quantity>100
    ){
      return res
        .status(400)
        .json({
          ok:false,
          error:'日付と数量を確認してください'
        });
    }

    const row={
      id:uid(),
      date,
      product:product.name,
      productId:product.id,
      productUrl:product.supplierUrl||product.url||'',
      category:product.category||'その他',
      quantity,

      customer:
        String(x.customer||'')
          .trim()
          .slice(0,100),

      amount,
      staffId:profile.id,
      source:'manual'
    };

    state.retail=[
      ...(state.retail||[]),
      row
    ];

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='deleteRetail'){
    const id=String(b.id||'');

    const existing=
      (state.retail||[])
        .find(
          x=>
            x.id===id&&
            x.staffId===profile.id
        );

    if(!existing){
      return res
        .status(404)
        .json({
          ok:false,
          error:'店販履歴が見つかりません'
        });
    }

    if(
      existing.source==='customer-order'
    ){
      return res
        .status(400)
        .json({
          ok:false,
          error:'お客様注文から反映された売上は注文履歴から管理してください'
        });
    }

    state.syncDeleted.retail[id]=Date.now();

    state.retail=
      (state.retail||[])
        .filter(x=>x.id!==id);

    await writeState(state);

    return res
      .status(200)
      .json({
        ok:true,
        ...await responseState(state,profile)
      });
  }

  if(action==='sendLine'){
    const customerId=String(b.customerId||'');
    const text=String(b.text||'').trim().slice(0,1500);

    const own=
      staffCustomers(
        state,
        staffBookings(state,profile.id)
      );

    const customer=
      own.find(c=>c.id===customerId);

    if(
      !customer||
      !customer.lineUserId
    ){
      return res
        .status(400)
        .json({
          ok:false,
          error:'この顧客はLINE連携されていません'
        });
    }

    if(!text){
      return res
        .status(400)
        .json({
          ok:false,
          error:'送信文を入力してください'
        });
    }

    if(!process.env.LINE_CHANNEL_ACCESS_TOKEN){
      return res
        .status(503)
        .json({
          ok:false,
          error:'LINE送信設定がありません'
        });
    }

    const lr=await fetch(
      'https://api.line.me/v2/bot/message/push',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:
            'Bearer '+
            process.env.LINE_CHANNEL_ACCESS_TOKEN
        },
        body:JSON.stringify({
          to:customer.lineUserId,
          messages:[
            {
              type:'text',
              text
            }
          ]
        })
      }
    );

    if(!lr.ok){
      throw new Error(
        'LINE送信に失敗しました'
      );
    }

    return res
      .status(200)
      .json({
        ok:true
      });
  }

  return res
    .status(400)
    .json({
      ok:false,
      error:'操作を確認してください'
    });
}

export default async function handler(req,res){
  cors(req,res);

  if(req.method==='OPTIONS'){
    return res
      .status(204)
      .end();
  }

  if(
    ![
      'GET',
      'POST'
    ].includes(req.method)
  ){
    return res
      .status(405)
      .json({
        ok:false,
        error:'Method not allowed'
      });
  }

  try{
    const b=body(req);

    if(
      admin(req)&&
      (
        req.method==='GET'||
        b.action==='adminSave'
      )
    ){
      return await adminHandler(
        req,
        res
      );
    }

    if(
      req.method==='POST'&&
      b.action==='login'
    ){
      return await loginHandler(
        req,
        res,
        b
      );
    }

    const session=
      readSession(req);

    if(!session){
      return res
        .status(401)
        .json({
          ok:false,
          error:'ログインし直してください'
        });
    }

    return await staffHandler(
      req,
      res,
      session
    );

  }catch(e){

    console.error(
      'staff-api',
      e.message
    );

    if(e.code==='23505'){
      return res
        .status(409)
        .json({
          ok:false,
          error:'そのユーザー名はすでに使われています'
        });
    }

    const safe=
      new Set([
        '予約内容を確認してください',
        'LINE送信に失敗しました'
      ]);

    return res
      .status(503)
      .json({
        ok:false,

        error:
          safe.has(e.message)
            ?e.message
            :'スタッフ機能を利用できません'
      });
  }
}
