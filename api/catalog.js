import {cors,admin,httpsURL,rest,readCatalog,requestBody} from '../lib/order-store.js';
export default async function handler(req,res){
  cors(req,res);if(req.method==='OPTIONS')return res.status(204).end();
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'Method not allowed'});
  if(req.method==='POST'&&!admin(req))return res.status(401).json({ok:false,error:'Unauthorized'});
  try{
    if(req.method==='GET')return res.status(200).json({ok:true,...await readCatalog()});
    const body=requestBody(req),source=body.products;
    if(!Array.isArray(source)||source.length>200)return res.status(400).json({ok:false,error:'商品データを確認してください'});
    const products=source.map(p=>({id:String(p.id||''),name:String(p.name||'').trim(),category:String(p.category||'その他'),price:Number(p.price),fulfillment:p.fulfillment==='external'?'external':'salon',externalUrl:p.externalUrl?httpsURL(p.externalUrl):''}));
    if(products.some(p=>!/^[-a-zA-Z0-9_]{1,80}$/.test(p.id)||!p.name||p.name.length>150||!Number.isInteger(p.price)||p.price<0||p.price>1000000||(p.fulfillment==='salon'&&p.price===0)||(p.fulfillment==='external'&&!p.externalUrl))||new Set(products.map(p=>p.id)).size!==products.length)return res.status(400).json({ok:false,error:'商品名・価格・B happy URLを確認してください'});
    const settings={lineUrl:body.settings?.lineUrl?httpsURL(body.settings.lineUrl):'',bHappyUrl:body.settings?.bHappyUrl?httpsURL(body.settings.bHappyUrl):''};
    if((body.settings?.lineUrl&&!settings.lineUrl)||(body.settings?.bHappyUrl&&!settings.bHappyUrl))return res.status(400).json({ok:false,error:'URLを確認してください'});
    await rest('salon-product-catalog?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'main',payload:{products,settings},updated_at:new Date().toISOString()})});
    return res.status(200).json({ok:true});
  }catch(e){console.error('Catalog storage error',e.status||e.message);return res.status(503).json({ok:false,error:'注文用の保存先が未設定、または一時的に利用できません'});}
}
