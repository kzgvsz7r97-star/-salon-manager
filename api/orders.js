import {cors,admin,rest,readCatalog,requestBody,validDate,daysUntil} from '../lib/order-store.js';
export default async function handler(req,res){
  cors(req,res);if(req.method==='OPTIONS')return res.status(204).end();
  if(!['GET','POST','PATCH'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed'});
  if(req.method!=='POST'&&!admin(req))return res.status(401).json({ok:false,error:'Unauthorized'});
  try{
    if(req.method==='GET'){const orders=await rest('salon-product-orders?select=*&order=created_at.desc&limit=200');return res.status(200).json({ok:true,orders:orders||[]});}
    const b=requestBody(req);
    if(req.method==='PATCH'){
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id||'')||!['new','ordered','ready','completed','cancelled'].includes(b.status))return res.status(400).json({ok:false,error:'Invalid order status'});
      const rows=await rest('salon-product-orders?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:b.status,updated_at:new Date().toISOString()})});
      return rows?.length?res.status(200).json({ok:true}):res.status(404).json({ok:false,error:'Order not found'});
    }
    const id=String(b.id||''),name=String(b.customerName||'').trim(),contact=String(b.contact||'').trim(),visit=String(b.visitDate||''),note=String(b.note||'').trim();
    if(b.website)return res.status(400).json({ok:false,error:'注文を確認してください'});
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!name||name.length>100||!contact||contact.length>150||note.length>500||!validDate(visit)||daysUntil(visit)<7||daysUntil(visit)>180||!Array.isArray(b.items)||!b.items.length||b.items.length>20)return res.status(400).json({ok:false,error:'お名前・連絡先・商品を確認してください。受取日は7日後〜180日後から選べます。'});
    const catalog=await readCatalog(),seen=new Set();let invalid=false;
    const items=b.items.map(i=>{const p=catalog.products.find(p=>p.id===i.productId&&p.fulfillment==='salon');const q=Number(i.quantity);if(!p||!Number.isInteger(q)||q<1||q>10||seen.has(i.productId)){invalid=true;return null;}seen.add(i.productId);return {productId:p.id,name:p.name,category:p.category,price:p.price,quantity:q};});
    if(invalid)return res.status(400).json({ok:false,error:'商品が変更されています。ページを更新して選び直してください'});
    const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0);
    if(!Number.isInteger(b.expectedTotal)||b.expectedTotal!==total)return res.status(409).json({ok:false,error:'商品価格が変更されています。ページを更新して確認してください'});
    const order={id,customer_name:name,contact,visit_date:visit,note,items,total,status:'new'};
    try{await rest('salon-product-orders',{method:'POST',body:JSON.stringify(order)});}catch(e){if(e.code==='23505'){
      // Retry only succeeds for the same request; an existing ID never reveals customer data.
      const existing=await rest('salon-product-orders?id=eq.'+encodeURIComponent(id)+'&select=customer_name,contact,visit_date,note,items,total');
      const o=existing?.[0];if(!o||o.customer_name!==name||o.contact!==contact||o.visit_date!==visit||o.note!==note||o.total!==total||o.items.length!==items.length||o.items.some((v,i)=>['productId','name','category','price','quantity'].some(k=>v[k]!==items[i][k])))return res.status(409).json({ok:false,error:'注文内容が変更されています。ページを更新してください'});
    }else throw e;}
    return res.status(201).json({ok:true,orderId:id,total});
  }catch(e){console.error('Order storage error',e.status||e.message);return res.status(503).json({ok:false,error:'注文を保存できませんでした。しばらくして再送するか公式LINEへご相談ください'});}
}
