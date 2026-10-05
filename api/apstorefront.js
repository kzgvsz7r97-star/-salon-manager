import {cors,rest} from '../lib/order-store.js';

function text(v,max){
  return String(v||'').trim().slice(0,max);
}

export default async function handler(req,res){

  cors(req,res);

  if(req.method==='OPTIONS')
    return res.status(204).end();

  if(req.method!=='GET'){
    return res.status(405).json({
      ok:false,
      error:'Method not allowed'
    });
  }

  try{

    const staffId=
      String(req.query?.staff||'').trim();

    if(!/^[-a-zA-Z0-9_]{1,100}$/.test(staffId)){
      return res.status(400).json({
        ok:false,
        error:'担当スタッフを確認してください'
      });
    }

    const rows=await rest(
      'salon-backups?select=data&order=created_at.desc&limit=1'
    );

    const state=
      rows?.[0]?.data||{};

    const profile=
      (state.staffProfiles||[]).find(
        p=>
          String(p.id)===staffId
          &&p.active!==false
      );

    if(!profile){
      return res.status(404).json({
        ok:false,
        error:'商品ページが見つかりません'
      });
    }

    const products=
      (
        Array.isArray(profile.retailCatalog)
          ?profile.retailCatalog
          :[]
      )
      .filter(
        p=>
          p.active!==false
          &&Number(p.price)>0
      )
      .map(p=>({

        id:String(p.id||''),

        name:text(
          p.name,
          150
        ),

        category:text(
  p.category||'その他',
  80
)||'その他',

concern:text(
  p.concern||'',
  80
),

price:Number(p.price||0),

        fulfillment:'salon',

        description:text(
          p.description,
          1500
        ),

        recommended:text(
          p.recommended,
          1500
        ),

        usage:text(
          p.usage,
          1500
        )

      }))
      .filter(
        p=>p.id&&p.name
      );

    return res.status(200).json({

      ok:true,

      seller:{
        id:profile.id,
        name:profile.name||'担当スタッフ'
      },

      products,

      settings:{}

    });

  }catch(e){

    console.error(
      'storefront-api',
      e.status||e.message
    );

    return res.status(503).json({
      ok:false,
      error:'商品ページを読み込めませんでした'
    });

  }
}
