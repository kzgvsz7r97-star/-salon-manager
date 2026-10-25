(() => {
  if(window.__salonAutoStoryV1) return;
  window.__salonAutoStoryV1=true;

  const API='https://salon-manager-kzgvsz7r97-star.vercel.app';
  const BACKUP_KEY_STORAGE='salonManagerCloudBackupKey';

  function params(){ return new URLSearchParams(location.search); }

  async function jsonFetch(url,options={}){
    const r=await fetch(url,options);
    const raw=await r.text();
    let body={};
    try{body=raw?JSON.parse(raw):{};}catch{body={};}
    if(!r.ok) throw new Error(body?.error||raw||`HTTP ${r.status}`);
    return body;
  }

  async function loadPhotoBlob(date,sig){
    const r=await fetch(`${API}/api/story-photo?date=${encodeURIComponent(date)}&sig=${encodeURIComponent(sig)}`);
    if(!r.ok) throw new Error('Instagram写真を読み込めませんでした');
    return URL.createObjectURL(await r.blob());
  }

  function ensureStatus(){
    if(document.getElementById('autoStoryStatus')) return document.getElementById('autoStoryStatus');
    const photo=document.getElementById('storyPhoto');
    if(!photo) return null;
    const box=document.createElement('div');
    box.id='autoStoryStatus';
    box.className='small';
    box.style.cssText='margin:8px 0 10px;padding:10px;border-radius:12px;background:#f6f6f6;line-height:1.5';
    photo.insertAdjacentElement('afterend',box);
    return box;
  }

  function ensureAutoButton(){
    if(document.getElementById('autoStoryPickBtn')) return;
    const photo=document.getElementById('storyPhoto');
    if(!photo) return;
    const btn=document.createElement('button');
    btn.id='autoStoryPickBtn';
    btn.type='button';
    btn.className='ghost';
    btn.style.cssText='width:100%;margin-top:8px';
    btn.textContent='Instagram投稿から自動選択';
    btn.onclick=generateManual;
    photo.insertAdjacentElement('afterend',btn);
  }

  async function applyStory(story,date,sig){
    if(!story) throw new Error('ストーリーデータがありません');
    const status=ensureStatus();
    if(status) status.textContent='Instagram写真を読み込み中...';

    const blobUrl=await loadPhotoBlob(date,sig);
    const img=document.getElementById('storyPreviewImage');
    const empty=document.getElementById('storyPreviewEmpty');
    const output=document.getElementById('storyOutput');
    if(!img||!output) throw new Error('ストーリー画面を開けませんでした');

    img.src=blobUrl;
    img.style.display='block';
    if(empty) empty.style.display='none';
    output.value=story.text||'';
    if(typeof refreshStoryPreviewText==='function') refreshStoryPreviewText();
    if(typeof setLocalStoryDesign==='function') setLocalStoryDesign();

    if(status) status.innerHTML=`Instagram投稿から自動選択済み<br>${story.permalink?`<a href="${story.permalink}" target="_blank" rel="noopener noreferrer">元投稿を見る ↗</a>`:''}`;
  }

  async function openSignedStory(){
    const p=params();
    const date=p.get('autoStory');
    const sig=p.get('sig');
    if(!date||!sig) return;

    try{
      if(typeof openStoryAvailability!=='function') return;
      openStoryAvailability();
      ensureAutoButton();
      const body=await jsonFetch(`${API}/api/daily-story?preview=1&date=${encodeURIComponent(date)}&sig=${encodeURIComponent(sig)}`);
      await applyStory(body.story,date,sig);
    }catch(e){
      const status=ensureStatus();
      if(status) status.textContent=`自動ストーリー読込エラー：${e.message}`;
      else alert(e.message);
    }
  }

  async function generateManual(){
    const key=localStorage.getItem(BACKUP_KEY_STORAGE)||'';
    if(!key){
      alert('クラウド同期キーを先に設定してください');
      return;
    }
    const status=ensureStatus();
    if(status) status.textContent='Instagramから写真を選択中...';
    try{
      const body=await jsonFetch(`${API}/api/daily-story`,{
        method:'POST',
        headers:{'Content-Type':'application/json','X-Backup-Key':key},
        body:JSON.stringify({action:'test'})
      });
      const u=new URL(body.link);
      const date=u.searchParams.get('autoStory');
      const sig=u.searchParams.get('sig');
      const preview=await jsonFetch(`${API}/api/daily-story?preview=1&date=${encodeURIComponent(date)}&sig=${encodeURIComponent(sig)}`);
      await applyStory(preview.story,date,sig);
      if(status) status.innerHTML=`Instagramから自動選択しました。<br>このまま「画像作成」を押せば共有できます。`;
    }catch(e){
      if(status) status.textContent=`自動選択エラー：${e.message}`;
      else alert(e.message);
    }
  }

  const originalOpen=window.openStoryAvailability;
  if(typeof originalOpen==='function'){
    window.openStoryAvailability=function(...args){
      const result=originalOpen.apply(this,args);
      setTimeout(()=>{ensureAutoButton();ensureStatus();},0);
      return result;
    };
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(openSignedStory,0));
  else setTimeout(openSignedStory,0);
})();
