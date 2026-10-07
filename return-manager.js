(() => {
  if (window.__returnManagerLoaded) return;
  window.__returnManagerLoaded = true;

  let rmMonth = monthKey(todayISO);
  let rmFilter = 'all';

  const stamp = b => `${b?.date || ''} ${b?.time || ''}`;
  const keyOf = b => b?.customerId ? `id:${b.customerId}` : `name:${normalizeName(b?.customer || '')}`;
  const same = (a,b) => a?.customerId && b?.customerId
    ? String(a.customerId) === String(b.customerId)
    : normalizeName(a?.customer || '') === normalizeName(b?.customer || '');

  function customerOf(b){
    if(!b) return null;
    if(b.customerId){
      const c=(db.customers||[]).find(x=>String(x.id)===String(b.customerId));
      if(c) return c;
    }
    const n=normalizeName(b.customer||'');
    return (db.customers||[]).find(x=>normalizeName(x.name||'')===n)||null;
  }

  function cohort(month){
    const map=new Map();
    (db.bookings||[])
      .filter(b=>!b.isModel&&b.newGuest&&monthKey(b.date)===month&&isVisitedBooking(b))
      .sort((a,b)=>stamp(a).localeCompare(stamp(b)))
      .forEach(b=>{const k=keyOf(b);if(!map.has(k))map.set(k,b)});
    return [...map.values()];
  }

  function journey(first){
    const later=(db.bookings||[])
      .filter(b=>!b.isModel&&same(first,b)&&stamp(b)>stamp(first))
      .sort((a,b)=>stamp(a).localeCompare(stamp(b)));
    const second=later.find(isVisitedBooking)||null;
    const future=later.find(b=>isActiveBooking(b)&&b.date>=todayISO)||null;
    const cancelled=[...later].reverse().find(b=>['cancelled','noshow'].includes(bookingStatus(b)))||null;
    const nextTaken=!!first.nextBookingTaken||later.length>0;
    let stage='missing';
    if(second) stage='returned';
    else if(future) stage='future';
    else if(cancelled) stage=bookingStatus(cancelled)==='noshow'?'noshow':'cancelled';
    else if(nextTaken) stage='taken';
    return {first,customer:customerOf(first),later,second,future,cancelled,nextTaken,stage,source:first.source||'その他'};
  }

  function stats(month){
    const rows=cohort(month).map(journey);
    const next=rows.filter(x=>x.nextTaken).length;
    const returned=rows.filter(x=>x.second).length;
    const future=rows.filter(x=>!x.second&&x.future).length;
    const cancelled=rows.filter(x=>!x.second&&['cancelled','noshow'].includes(x.stage)).length;
    const missing=rows.filter(x=>x.stage==='missing').length;
    return {
      rows,total:rows.length,next,returned,future,cancelled,missing,
      nextRate:rows.length?Math.round(next/rows.length*100):0,
      returnRate:rows.length?Math.round(returned/rows.length*100):0,
      keptRate:next?Math.round(returned/next*100):0
    };
  }

  function recoveryCandidates(){
    const map=new Map();
    (db.bookings||[]).forEach(b=>{
      if(b.isModel||b.returnRecoveryDone||!['cancelled','noshow'].includes(bookingStatus(b)))return;
      const d=daysBetween(b.date,todayISO);
      if(d < -30 || d > 30) return;
      const future=(db.bookings||[]).some(x=>
        !x.isModel&&same(b,x)&&String(x.id)!==String(b.id)&&isActiveBooking(x)&&x.date>=todayISO
      );
      if(future)return;
      const k=keyOf(b),old=map.get(k);
      if(!old||stamp(b)>stamp(old))map.set(k,b);
    });
    return [...map.values()].sort((a,b)=>stamp(b).localeCompare(stamp(a)));
  }

  function actions(){
    return {
      followups:typeof followupDueItems==='function'?followupDueItems():[],
      recoveries:recoveryCandidates(),
      reminders:typeof reminderCandidates==='function'?reminderCandidates():[]
    };
  }

  function label(stage){
    return ({returned:'2回目実来店',future:'次回予約あり',cancelled:'次回キャンセル',noshow:'次回無断',taken:'次回取得済み',missing:'次回予約なし'})[stage]||stage;
  }
  function badge(stage){
    return ({returned:'status-visited',future:'status-booked',cancelled:'status-cancelled',noshow:'status-noshow',taken:'status-booked',missing:'status-cancelled'})[stage]||'status-booked';
  }

  function ensureHome(){
    if(document.getElementById('returnManagerHomeWrap'))return;
    const r=document.getElementById('returnReminders');
    if(!r)return;
    r.insertAdjacentHTML('afterend',`<div id="returnManagerHomeWrap"><h2>再来管理</h2><div id="returnManagerHome" class="card"></div></div>`);
  }

  function renderHomeBox(){
    ensureHome();
    const host=document.getElementById('returnManagerHome');
    if(!host)return;
    const month=typeof homeMonth!=='undefined'?monthString(homeMonth):monthKey(todayISO);
    const s=stats(month),a=actions(),total=a.followups.length+a.recoveries.length+a.reminders.length;
    host.innerHTML=`
      <div class="row auto">
        <div style="flex:1"><b>今対応が必要</b><div style="font-size:26px;font-weight:900;margin-top:3px">${total}件</div></div>
        <button onclick="openReturnManager('${month}')">再来管理を開く</button>
      </div>
      <div class="small" style="margin-top:8px">新規→次回 ${s.nextRate}% ・ 2回目実来店 ${s.returnRate}% ・ 予約後→実来店 ${s.keptRate}%</div>
      <div class="small" style="margin-top:4px">アフター/事前 ${a.followups.length} ・ キャンセル後 ${a.recoveries.length} ・ 45日 ${a.reminders.length}</div>`;
  }

  function sourceTable(rows){
    const sources=[...new Set(['SHAiRE','Nailie','minimo','Instagram','その他',...rows.map(x=>x.source||'その他')])]
      .map(source=>{
        const xs=rows.filter(x=>(x.source||'その他')===source);if(!xs.length)return null;
        const next=xs.filter(x=>x.nextTaken).length,returned=xs.filter(x=>x.second).length;
        return {source,total:xs.length,next,returned,rate:Math.round(returned/xs.length*100)};
      }).filter(Boolean);
    if(!sources.length)return empty('媒体データがありません');
    return `<div style="overflow:auto"><table class="trend-table"><thead><tr><th>媒体</th><th>新規</th><th>次回</th><th>2回目</th><th>2回目率</th></tr></thead><tbody>${sources.map(x=>`<tr><td>${esc(x.source)}</td><td>${x.total}</td><td>${x.next}</td><td>${x.returned}</td><td>${x.rate}%</td></tr>`).join('')}</tbody></table></div>`;
  }

  function actionHTML(){
    const a=actions(),out=[];
    a.followups.forEach(x=>out.push(`<div class="item"><div class="t">${esc(x.booking.customer||'未登録')} <span class="status-badge status-booked">${esc(x.label)}</span></div><div class="s">${esc(x.booking.date)} ${esc(x.booking.time||'')}</div><div class="actions"><button onclick="openFollowupMessage('${x.id}','${x.type}')">文面を作る</button><button class="ghost" onclick="editBooking('${x.booking.id}')">予約を見る</button></div></div>`));
    a.recoveries.forEach(b=>out.push(`<div class="item"><div class="t">${esc(b.customer||'未登録')} <span class="status-badge ${bookingStatus(b)==='noshow'?'status-noshow':'status-cancelled'}">${bookingStatus(b)==='noshow'?'無断後':'キャンセル後'}</span></div><div class="s">${esc(b.date)} ${esc(b.time||'')} ・ 未来予約なし</div><div class="actions"><button class="ghost" onclick="editBooking('${b.id}')">予約を見る</button><button onclick="markReturnRecoveryDone('${b.id}')">対応済みにする</button></div></div>`));
    a.reminders.forEach(c=>out.push(`<div class="item"><div class="t">${esc(c.name||'未登録')} <span class="status-badge status-booked">45日</span></div><div class="s">最終来店 ${esc(c.lastComputed||'')} ・ ${Number(c.days||0)}日経過</div><div class="actions"><button class="ghost" onclick="openCustomerChart('${c.id}')">顧客を見る</button><button onclick="snoozeReminder('${c.id}');openReturnManager()">連絡済み</button></div></div>`));
    return out.length?out.join(''):empty('今対応する再来フォローはありません');
  }

  function filtered(rows){
    if(rmFilter==='all')return rows;
    if(rmFilter==='risk')return rows.filter(x=>['cancelled','noshow','missing'].includes(x.stage));
    return rows.filter(x=>x.stage===rmFilter);
  }

  function renderSheet(){
    const host=document.getElementById('returnManagerSheet');if(!host)return;
    const s=stats(rmMonth),rows=filtered(s.rows),[y,m]=rmMonth.split('-').map(Number);
    host.innerHTML=`
      <div class="monthbar"><button onclick="changeReturnManagerMonth(-1)">‹</button><div class="monthtitle">${y}年${m}月</div><button onclick="changeReturnManagerMonth(1)">›</button></div>
      <div class="summary-grid" style="margin-top:10px">
        <div class="summary-card"><div class="l">新規実来店</div><div class="v">${s.total}人</div></div>
        <div class="summary-card"><div class="l">次回予約取得</div><div class="v">${s.nextRate}%</div><div class="small">${s.next}/${s.total}</div></div>
        <div class="summary-card"><div class="l">2回目実来店</div><div class="v">${s.returnRate}%</div><div class="small">${s.returned}/${s.total}</div></div>
        <div class="summary-card"><div class="l">予約後→実来店</div><div class="v">${s.keptRate}%</div><div class="small">${s.returned}/${s.next}</div></div>
      </div>
      <div class="small" style="margin:8px 2px">未来予約 ${s.future} ・ キャンセル/無断 ${s.cancelled} ・ 次回なし ${s.missing}</div>
      <h3 style="margin:18px 0 8px">今連絡する人</h3>${actionHTML()}
      <h3 style="margin:18px 0 8px">新規→2回目の状況</h3>
      <select onchange="setReturnManagerFilter(this.value)"><option value="all" ${rmFilter==='all'?'selected':''}>全員</option><option value="returned" ${rmFilter==='returned'?'selected':''}>2回目実来店</option><option value="future" ${rmFilter==='future'?'selected':''}>未来予約あり</option><option value="risk" ${rmFilter==='risk'?'selected':''}>要フォロー</option></select>
      <div class="small" style="margin:7px 2px">${rows.length}人表示</div>
      ${rows.length?rows.map(x=>{
        const detail=x.second?`2回目 ${x.second.date}`:x.future?`次回 ${x.future.date} ${x.future.time||''}`:x.cancelled?`${bookingStatus(x.cancelled)==='noshow'?'無断':'キャンセル'} ${x.cancelled.date}`:'次回の実予約データなし';
        const c=x.customer?.id?`<button class="ghost" onclick="openCustomerChart('${x.customer.id}')">顧客を見る</button>`:'';
        return `<div class="item"><div class="t">${esc(x.first.customer||'未登録')} <span class="status-badge ${badge(x.stage)}">${label(x.stage)}</span></div><div class="s">初回 ${esc(x.first.date)} ・ ${esc(x.source)}<br>${esc(detail)}</div><div class="actions">${c}<button class="ghost" onclick="editBooking('${x.first.id}')">初回予約</button></div></div>`;
      }).join(''):empty('この条件の新規客はいません')}
      <h3 style="margin:18px 0 8px">媒体別の再来</h3>${sourceTable(s.rows)}
      <button class="ghost" style="width:100%;margin-top:14px" onclick="closeModal()">閉じる</button>`;
  }

  window.openReturnManager=function(month=''){
    if(month)rmMonth=month;
    modal(`<div class="chart-head"><div><h3 style="margin:0">再来管理</h3><div class="small" style="margin-top:4px">次回予約を取った後、本当に2回目来店したかまで追います</div></div><button class="ghost" onclick="closeModal()">閉じる</button></div><div id="returnManagerSheet"></div>`);
    renderSheet();
  };
  window.changeReturnManagerMonth=function(n){const [y,m]=rmMonth.split('-').map(Number);rmMonth=monthString(addMonths(new Date(y,m-1,1),n));renderSheet()};
  window.setReturnManagerFilter=function(v){rmFilter=v||'all';renderSheet()};
  window.markReturnRecoveryDone=function(id){const b=(db.bookings||[]).find(x=>String(x.id)===String(id));if(!b)return;b.returnRecoveryDone=true;b.returnRecoveryDoneAt=new Date().toISOString();save();window.openReturnManager(rmMonth)};

  const oldRenderHome=renderHome;
  renderHome=function(){oldRenderHome();renderHomeBox()};
  ensureHome();
  renderHomeBox();
})();
