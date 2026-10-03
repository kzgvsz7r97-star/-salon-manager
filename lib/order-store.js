const ORIGINS=new Set(['https://kzgvsz7r97-star.github.io','https://salon-manager-kzgvsz7r97-star.vercel.app']);
export function cors(req,res){const origin=req.headers.origin||'';if(ORIGINS.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Backup-Key');}
export function admin(req){return !!process.env.BACKUP_KEY&&req.headers['x-backup-key']===process.env.BACKUP_KEY;}
export function httpsURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function japanDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function daysUntil(iso){const today=japanDate();return (Date.parse(iso+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000;}
export function validDate(iso){try{return /^\d{4}-\d{2}-\d{2}$/.test(iso)&&new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso;}catch{return false;}}
export async function rest(path,options={}){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new Error('Storage is not configured');
  const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{'Content-Type':'application/json',apikey:process.env.SUPABASE_SECRET_KEY,...options.headers}});
  const raw=await r.text();if(!r.ok){const error=new Error('Storage request failed');error.status=r.status;try{error.code=JSON.parse(raw).code;}catch{}throw error;}
  return raw?JSON.parse(raw):null;
}
export async function readCatalog(){const rows=await rest('salon-product-catalog?id=eq.main&select=payload');return rows?.[0]?.payload||{products:[],settings:{}};}
export function requestBody(req){if(typeof req.body==='string'){try{return JSON.parse(req.body);}catch{return {};}}return req.body||{};}
