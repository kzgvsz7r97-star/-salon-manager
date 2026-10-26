(() => {
  if(window.__salonAutoStoryV2) return;
  window.__salonAutoStoryV2=true;

  const API=
    'https://salon-manager-kzgvsz7r97-star.vercel.app';

  const BACKUP_KEY_STORAGE=
    'salonManagerCloudBackupKey';

  function params(){
    return new URLSearchParams(
      location.search
    );
  }

  function backupKey(){
    return localStorage.getItem(
      BACKUP_KEY_STORAGE
    ) || '';
  }

  async function jsonFetch(
    url,
    options={}
  ){
    const r=
      await fetch(
        url,
        options
      );

    const raw=
      await r.text();

    let body={};

    try{
      body=
        raw
          ? JSON.parse(raw)
          : {};
    }
    catch{
      body={};
    }

    if(!r.ok){
      throw new Error(
        body?.error ||
        raw ||
        `HTTP ${r.status}`
      );
    }

    return body;
  }

 async function loadPhotoBlob(
  date,
  sig,
  id
){

    const r=
      await fetch(
     `${API}/api/story-library?photo=1&date=${encodeURIComponent(date)}&id=${encodeURIComponent(id)}&sig=${encodeURIComponent(sig)}`
      );

    if(!r.ok){
      throw new Error(
        '写真を読み込めませんでした'
      );
    }

    return URL.createObjectURL(
      await r.blob()
    );
  }

  function ensureStatus(){
    let box=
      document.getElementById(
        'autoStoryStatus'
      );

    if(box)return box;

    const photo=
      document.getElementById(
        'storyPhoto'
      );

    if(!photo)return null;

    box=
      document.createElement(
        'div'
      );

    box.id=
      'autoStoryStatus';

    box.className=
      'small';

    box.style.cssText=
      `
        margin:8px 0 10px;
        padding:10px;
        border-radius:12px;
        background:#f6f6f6;
        line-height:1.5;
      `;

    photo.insertAdjacentElement(
      'afterend',
      box
    );

    return box;
  }

  function ensureLibraryControls(){

    if(
      document.getElementById(
        'storyLibraryControls'
      )
    ){
      return;
    }

    const photo=
      document.getElementById(
        'storyPhoto'
      );

    if(!photo)return;

    const host=
      document.createElement(
        'div'
      );

    host.id=
      'storyLibraryControls';

    host.style.cssText=
      `
        display:grid;
        gap:8px;
        margin:8px 0 12px;
      `;

    host.innerHTML=
      `
        <input
          id="storyLibraryInput"
          type="file"
          accept="image/*"
          multiple
          style="display:none"
        >

        <button
          id="storyLibraryUploadBtn"
          type="button"
          class="ghost"
          style="width:100%"
        >
          Instagram投稿済み写真を登録
        </button>

        <button
          id="autoStoryPickBtn"
          type="button"
          class="ghost"
          style="width:100%"
        >
          登録写真から自動選択
        </button>

        <div
          id="storyLibraryCount"
          class="small"
          style="
            text-align:center;
            opacity:.7;
          "
        >
          登録写真を確認中...
        </div>
      `;

    photo.insertAdjacentElement(
      'afterend',
      host
    );

    const input=
      document.getElementById(
        'storyLibraryInput'
      );

    document
      .getElementById(
        'storyLibraryUploadBtn'
      )
      .onclick=
        ()=>
          input?.click();

    input.onchange=
      async ()=>{
        const files=
          Array.from(
            input.files || []
          );

        if(!files.length)return;

        await uploadLibraryPhotos(
          files
        );

        input.value='';
      };

    document
      .getElementById(
        'autoStoryPickBtn'
      )
      .onclick=
        generateManual;

    refreshLibraryCount();
  }

  function compressImage(
    file
  ){
    return new Promise(
      (resolve,reject)=>{

        const reader=
          new FileReader();

        reader.onerror=
          ()=>reject(
            new Error(
              '写真を読み込めませんでした'
            )
          );

        reader.onload=
          ()=>{

            const img=
              new Image();

            img.onerror=
              ()=>reject(
                new Error(
                  'この写真形式は読み込めません'
                )
              );

            img.onload=
              ()=>{

                const max=
                  1600;

                const scale=
                  Math.min(
                    1,
                    max /
                    Math.max(
                      img.width,
                      img.height
                    )
                  );

                const canvas=
                  document.createElement(
                    'canvas'
                  );

                canvas.width=
                  Math.round(
                    img.width *
                    scale
                  );

                canvas.height=
                  Math.round(
                    img.height *
                    scale
                  );

                const ctx=
                  canvas.getContext(
                    '2d'
                  );

                ctx.drawImage(
                  img,
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );

                resolve(
                  canvas.toDataURL(
                    'image/jpeg',
                    .86
                  )
                );
              };

            img.src=
              reader.result;
          };

        reader.readAsDataURL(
          file
        );
      }
    );
  }

  async function uploadLibraryPhotos(
    files
  ){
    const key=
      backupKey();

    if(!key){
      alert(
        'クラウド同期キーを先に設定してください'
      );
      return;
    }

    const status=
      ensureStatus();

    let success=0;

    for(
      let i=0;
      i<files.length;
      i++
    ){
      const file=
        files[i];

      try{

        if(status){
          status.textContent=
            `写真を登録中 ${i+1}/${files.length}`;
        }

        const imageData=
          await compressImage(
            file
          );

       const body=JSON.stringify({
  action:'upload',
  name:file.name,
  imageData
});

for(let attempt=1;attempt<=3;attempt++){
  try{
    await jsonFetch(
      `${API}/api/story-library`,
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Backup-Key':key
        },
        body
      }
    );
    break;
  }catch(e){
    if(attempt===3)throw e;

    if(status){
      status.textContent=
        `写真を再試行中 ${i+1}/${files.length}（${attempt}/2）`;
    }

    await new Promise(
      resolve=>setTimeout(resolve,attempt*1000)
    );
  }
}

        success++;

      }
         catch(e){
        console.error('story photo upload',e);

        alert(
          '写真登録エラー：\n' +
          String(e?.message || e).slice(0,300)
        );

       continue;
      }
    }

    if(status){
      status.textContent=
        `${success}枚登録しました`;
    }

    await refreshLibraryCount();
  }

  async function refreshLibraryCount(){

    const count=
      document.getElementById(
        'storyLibraryCount'
      );

    if(!count)return;

    const key=
      backupKey();

    if(!key){
      count.textContent=
        'クラウド同期キー未設定';
      return;
    }

    try{

      const body=
        await jsonFetch(
          `${API}/api/story-library`,
          {
            headers:{
              'X-Backup-Key':
                key
            }
          }
        );

      const active=
        (body.photos||[])
          .filter(
            x=>x.active!==false
          )
          .length;

      count.textContent=
        `自動選択対象 ${active}枚`;

    }
    catch(e){

      count.textContent=
        `登録写真の確認に失敗`;
    }
  }

  async function applyStory(
    story,
    date,
    sig
  ){

    if(!story){
      throw new Error(
        'ストーリーデータがありません'
      );
    }

    const status=
      ensureStatus();

    if(status){
      status.textContent=
        '写真を読み込み中...';
    }

    const blobUrl=
  await loadPhotoBlob(
    date,
    sig,
    story.mediaId
  );

    const img=
      document.getElementById(
        'storyPreviewImage'
      );

    const empty=
      document.getElementById(
        'storyPreviewEmpty'
      );

    const output=
      document.getElementById(
        'storyOutput'
      );

    if(
      !img ||
      !output
    ){
      throw new Error(
        'ストーリー画面を開けませんでした'
      );
    }

    img.src=
      blobUrl;

    img.style.display=
      'block';

    if(empty){
      empty.style.display=
        'none';
    }

    output.value=
      story.text || '';

    if(
      typeof refreshStoryPreviewText===
      'function'
    ){
      refreshStoryPreviewText();
    }

    if(
      typeof setLocalStoryDesign===
      'function'
    ){
      setLocalStoryDesign();
    }

    if(status){
      status.textContent=
        '登録写真から自動選択済み';
    }
  }

  async function openSignedStory(){

    const p=
      params();

    const date=
      p.get(
        'autoStory'
      );

    const sig=
      p.get(
        'sig'
      );

    if(
      !date ||
      !sig
    ){
      return;
    }

    try{

      if(
        typeof openStoryAvailability!==
        'function'
      ){
        return;
      }

      openStoryAvailability();

      ensureLibraryControls();

      const body=
        await jsonFetch(
          `${API}/api/daily-story?preview=1&date=${encodeURIComponent(date)}&sig=${encodeURIComponent(sig)}`
        );

      await applyStory(
        body.story,
        date,
        sig
      );

    }
    catch(e){

      const status=
        ensureStatus();

      if(status){
        status.textContent=
          `自動ストーリー読込エラー：${e.message}`;
      }
      else{
        alert(
          e.message
        );
      }
    }
  }

  async function generateManual(){

    const key=
      backupKey();

    if(!key){
      alert(
        'クラウド同期キーを先に設定してください'
      );
      return;
    }

    const status=
      ensureStatus();

    if(status){
      status.textContent=
        '登録写真から選択中...';
    }

    try{

      const body=
        await jsonFetch(
          `${API}/api/daily-story`,
          {
            method:'POST',

            headers:{
              'Content-Type':
                'application/json',

              'X-Backup-Key':
                key
            },

            body:
              JSON.stringify({
                action:'test'
              })
          }
        );

      const u=
        new URL(
          body.link
        );

      const date=
        u.searchParams.get(
          'autoStory'
        );

      const sig=
        u.searchParams.get(
          'sig'
        );

      const preview=
        await jsonFetch(
          `${API}/api/daily-story?preview=1&date=${encodeURIComponent(date)}&sig=${encodeURIComponent(sig)}`
        );

      await applyStory(
        preview.story,
        date,
        sig
      );

      if(status){
        status.textContent=
          '自動選択しました。このまま「画像作成」でOKです。';
      }

    }
    catch(e){

      if(status){
        status.textContent=
          `自動選択エラー：${e.message}`;
      }
      else{
        alert(
          e.message
        );
      }
    }
  }

  const originalOpen=
    window.openStoryAvailability;

  if(
    typeof originalOpen===
    'function'
  ){

    window.openStoryAvailability=
      function(...args){

        const result=
          originalOpen.apply(
            this,
            args
          );

        setTimeout(
          ()=>{
            ensureLibraryControls();
            ensureStatus();
          },
          0
        );

        return result;
      };
  }

  if(
    document.readyState===
    'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      ()=>
        setTimeout(
          openSignedStory,
          0
        )
    );
  }
  else{
    setTimeout(
      openSignedStory,
      0
    );
  }
})();
