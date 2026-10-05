import {cors,admin,rest,readCatalog,requestBody,validDate,daysUntil} from '../lib/order-store.js';

const ORDER_STATUS=new Set(['new','ordered','ready','completed','cancelled']);

function uid(){
  return crypto.randomUUID();
}

async function latestState(){
  const rows=await rest('salon-backups?select=id,created_at,data&order=created_at.desc&limit=1');
  return rows?.[0]?.data||{};
}

async function writeState(data){
  await rest('salon-backups',{
    method:'POST',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify({data})
  });
}

function ensureState(state){
  state.staffProfiles=Array.isArray(state.staffProfiles)?state.staffProfiles:[];
  state.retail=Array.isArray(state.retail)?state.retail:[];
  state.syncDeleted ||= {bookings:{},customers:{},products:{},sales:{},retail:{}};
  ['bookings','customers','products','sales','retail'].forEach(k=>state.syncDeleted[k] ||= {});
  return state;
}

function ownerProfile(state){
  return (state.staffProfiles||[]).find(x=>x.role==='owner'&&x.active!==false)
    ||(state.staffProfiles||[])[0]
    ||null;
}

function staffProfile(state,staffId){
  return (state.staffProfiles||[]).find(
    x=>String(x.id)===String(staffId)&&x.active!==false
  )||null;
}

function safeLineId(v){
  const id=String(v||'').trim();
  return /^U[0-9a-f]{32}$/i.test(id)?id:'';
}

async function pushLine(userId,text){
  if(!userId||!process.env.LINE_CHANNEL_ACCESS_TOKEN)return false;

  try{
    const r=await fetch('https://api.line.me/v2/bot/message/push',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:'Bearer '+process.env.LINE_CHANNEL_ACCESS_TOKEN
      },
      body:JSON.stringify({
        to:userId,
        messages:[{
          type:'text',
          text:String(text||'').slice(0,5000)
        }]
      })
    });

    if(!r.ok){
      console.error('Order LINE push failed',r.status,await r.text());
      return false;
    }

    return true;
  }catch(e){
    console.error('Order LINE push error',e.message);
    return false;
  }
}

function orderLineText({name,visit,items,total,isStaff}){
  const lines=(items||[]).map(
    i=>`・${i.name} × ${i.quantity}`
  );

  const appUrl=isStaff
    ?'https://kzgvsz7r97-star.github.io/-salon-manager/staff.html'
    :'https://kzgvsz7r97-star.github.io/-salon-manager/';

  return [
    '【新しい商品注文】',
    '',
    `お客様：${name}`,
    `受取日：${visit}`,
    '',
    ...lines,
    '',
    `合計：¥${Number(total||0).toLocaleString('ja-JP')}`,
    '',
    'Salon Managerで確認して発注してください。',
    appUrl
  ].join('\n');
}

async function catalogForOrder(staffId){
  const state=ensureState(await latestState());

  if(staffId){
    const profile=staffProfile(state,staffId);

    if(!profile){
      const e=new Error('担当スタッフの商品ページが見つかりません');
      e.publicMessage='担当スタッフの商品ページが見つかりません';
      throw e;
    }

    const products=(Array.isArray(profile.retailCatalog)?profile.retailCatalog:[])
      .filter(p=>p.active!==false)
      .map(p=>({
        id:String(p.id||''),
        name:String(p.name||''),
        category:String(p.category||'その他'),
        price:Number(p.price||0),
        supplierUrl:String(p.supplierUrl||p.url||''),
        sellerId:profile.id
      }));

    return {
      state,
      profile,
      products,
      notifyLineUserId:safeLineId(profile.notifyLineUserId),
      isStaff:true
    };
  }

  const catalog=await readCatalog();
  const owner=ownerProfile(state);

  const products=(catalog.products||[])
    .filter(p=>p.fulfillment==='salon')
    .map(p=>({
      id:String(p.id||''),
      name:String(p.name||''),
      category:String(p.category||'その他'),
      price:Number(p.price||0),
      supplierUrl:'',
      sellerId:owner?.id||'owner'
    }));

  return {
    state,
    profile:owner,
    products,
    notifyLineUserId:
      safeLineId(owner?.notifyLineUserId)
      ||safeLineId(process.env.OWNER_LINE_USER_ID),
    isStaff:false
  };
}

async function recordCompletedOrder(order){
  const state=ensureState(await latestState());
  const items=Array.isArray(order.items)?order.items:[];
  let changed=false;

  for(const item of items){
    const sellerId=String(item.sellerId||'owner');
    const productId=String(item.productId||'');

    const exists=state.retail.some(
      x=>
        String(x.orderId||'')===String(order.id)
        &&String(x.staffId||'')===sellerId
        &&String(x.productId||'')===productId
        &&x.source==='customer-order'
    );

    if(exists)continue;

    const quantity=Math.max(1,Math.round(Number(item.quantity)||1));
    const amount=Math.max(
      0,
      Math.round(Number(item.price)||0)*quantity
    );

    state.retail.push({
      id:uid(),
      date:String(order.visit_date||new Date().toISOString().slice(0,10)),
      product:String(item.name||'商品').slice(0,150),
      productId,
      category:String(item.category||'その他').slice(0,80),
      quantity,
      customer:String(order.customer_name||'').slice(0,100),
      amount,
      staffId:sellerId,
      orderId:order.id,
      source:'customer-order'
    });

    changed=true;
  }

  if(changed)await writeState(state);
}

export default async function handler(req,res){
  cors(req,res);

  if(req.method==='OPTIONS')
    return res.status(204).end();

  if(!['GET','POST','PATCH'].includes(req.method))
    return res.status(405).json({ok:false,error:'Method not allowed'});

  if(req.method!=='POST'&&!admin(req))
    return res.status(401).json({ok:false,error:'Unauthorized'});

  try{
    if(req.method==='GET'){
      const orders=await rest(
        'salon-product-orders?select=*&order=created_at.desc&limit=200'
      );

      return res.status(200).json({
        ok:true,
        orders:orders||[]
      });
    }

    const b=requestBody(req);

    if(req.method==='PATCH'){
      const id=String(b.id||'');
      const status=String(b.status||'');

      if(
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        ||!ORDER_STATUS.has(status)
      ){
        return res.status(400).json({
          ok:false,
          error:'Invalid order status'
        });
      }

      const before=await rest(
        'salon-product-orders?id=eq.'+encodeURIComponent(id)
        +'&select=id,customer_name,contact,visit_date,note,items,total,status&limit=1'
      );

      const order=before?.[0];

      if(!order)
        return res.status(404).json({ok:false,error:'Order not found'});

      if(order.status==='completed'&&status!=='completed'){
        return res.status(400).json({
          ok:false,
          error:'お渡し済みの注文は元に戻せません'
        });
      }

      if(status==='completed'&&order.status!=='completed'){
        await recordCompletedOrder(order);
      }

      const rows=await rest(
        'salon-product-orders?id=eq.'+encodeURIComponent(id),
        {
          method:'PATCH',
          headers:{Prefer:'return=representation'},
          body:JSON.stringify({
            status,
            updated_at:new Date().toISOString()
          })
        }
      );

      return rows?.length
        ?res.status(200).json({ok:true})
        :res.status(404).json({ok:false,error:'Order not found'});
    }

    const id=String(b.id||'');
    const name=String(b.customerName||'').trim();
    const contact=String(b.contact||'').trim();
    const visit=String(b.visitDate||'');
    const note=String(b.note||'').trim();
    const staffId=String(b.staffId||'').trim();

    if(b.website)
      return res.status(400).json({ok:false,error:'注文を確認してください'});

    if(
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      ||!name
      ||name.length>100
      ||!contact
      ||contact.length>150
      ||note.length>500
      ||!validDate(visit)
      ||daysUntil(visit)<7
      ||daysUntil(visit)>180
      ||!Array.isArray(b.items)
      ||!b.items.length
      ||b.items.length>20
    ){
      return res.status(400).json({
        ok:false,
        error:'お名前・連絡先・商品を確認してください。受取日は7日後〜180日後から選べます。'
      });
    }

    const source=await catalogForOrder(staffId);
    const seen=new Set();
    let invalid=false;

    const items=b.items.map(i=>{
      const p=source.products.find(
        p=>String(p.id)===String(i.productId)
      );

      const q=Number(i.quantity);

      if(
        !p
        ||!Number.isInteger(q)
        ||q<1
        ||q>10
        ||seen.has(String(i.productId))
      ){
        invalid=true;
        return null;
      }

      seen.add(String(i.productId));

      return {
        productId:p.id,
        sellerId:p.sellerId,
        name:p.name,
        category:p.category,
        price:p.price,
        quantity:q,
        supplierUrl:p.supplierUrl||''
      };
    });

    if(invalid){
      return res.status(400).json({
        ok:false,
        error:'商品が変更されています。ページを更新して選び直してください'
      });
    }

    const total=items.reduce(
      (sum,i)=>sum+Number(i.price||0)*Number(i.quantity||0),
      0
    );

    if(
      !Number.isInteger(b.expectedTotal)
      ||b.expectedTotal!==total
    ){
      return res.status(409).json({
        ok:false,
        error:'商品価格が変更されています。ページを更新して確認してください'
      });
    }

    const order={
      id,
      customer_name:name,
      contact,
      visit_date:visit,
      note,
      items,
      total,
      status:'new'
    };

    let inserted=false;

    try{
      await rest('salon-product-orders',{
        method:'POST',
        body:JSON.stringify(order)
      });

      inserted=true;
    }catch(e){
      if(e.code==='23505'){
        const existing=await rest(
          'salon-product-orders?id=eq.'+encodeURIComponent(id)
          +'&select=customer_name,contact,visit_date,note,items,total'
        );

        const o=existing?.[0];

        const same=
          o
          &&o.customer_name===name
          &&o.contact===contact
          &&o.visit_date===visit
          &&o.note===note
          &&o.total===total;

        if(!same){
          return res.status(409).json({
            ok:false,
            error:'注文内容が変更されています。ページを更新してください'
          });
        }
      }else{
        throw e;
      }
    }

    if(inserted&&source.notifyLineUserId){
      await pushLine(
        source.notifyLineUserId,
        orderLineText({
          name,
          visit,
          items,
          total,
          isStaff:source.isStaff
        })
      );
    }

    return res.status(201).json({
      ok:true,
      orderId:id,
      total
    });

  }catch(e){
    console.error('Order storage error',e.status||e.message);

    return res.status(503).json({
      ok:false,
      error:
        e.publicMessage
        ||'注文を保存できませんでした。しばらくして再送するか公式LINEへご相談ください'
    });
  }
}
