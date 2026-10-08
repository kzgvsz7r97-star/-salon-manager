(() => {
  if (window.__followupOutcomesV2) return;
  window.__followupOutcomesV2 = true;

  const TYPES = {
    aftercare:'当日アフター',
    week:'1週間前',
    two:'2日前',
    return45:'45日再来',
    recovery:'キャンセル後'
  };

  function sameCustomer(b,id,name){
    if(!b)return false;
    if(id&&b.customerId)return String(b.customerId)===String(id);
    return normalizeName(b.customer||'')===normalizeName(name||'');
  }

  function identityFromBooking(b){
    const c=typeof customerForBooking==='function'?customerForBooking(b):null;
    return {
      customerId:b?.customerId||c?.id||'',
      customerName:b?.customer||c?.name||''
    };
  }

  function futureIds(id,name){
    return (db.bookings||[])
      .filter(b=>!b.isModel&&sameCustomer(b,id,name)&&b.date>todayISO&&isActiveBooking(b))
      .map(b=>String(b.id));
  }

  function pushEvent(target,type,bookingId=''){
    if(!target)return;
    target.followupOutcomeEvents=Array.isArray(target.followupOutcomeEvents)?target.followupOutcomeEvents:[];
    const identity=target.customer!==undefined
      ? identityFromBooking(target)
      : {customerId:target.id||'',customerName:target.name||''};
    const existingFutureIds=futureIds(identity.customerId,identity.customerName);
    target.followupOutcomeEvents.push({
      id:uid(),
      type,
      bookingId:String(bookingId||''),
      customerId:String(identity.customerId||''),
      customerName:String(identity.customerName||''),
      sentAt:new Date().toISOString(),
      sentDate:todayISO,
      existingFutureIds,
      hadFuture:existingFutureIds.length>0
    });
    save();
  }

  function allEvents(){
    const out=[];
    (db.bookings||[]).forEach(b=>{
      (b.followupOutcomeEvents||[]).forEach(e=>out.push({
        ...e,
        customerId:e.customerId||b.customerId||'',
        customerName:e.customerName||b.customer||''
      }));
    });
    (db.customers||[]).forEach(c=>{
      (c.followupOutcomeEvents||[]).forEach(e=>out.push({
        ...e,
        customerId:e.customerId||c.id||'',
        customerName:e.customerName||c.name||''
      }));
    });
    return out.filter(e=>{
      const d=e.sentDate||String(e.sentAt||'').slice(0,10);
      return d&&daysBetween(d,todayISO)>=0&&daysBetween(d,todayISO)<=90;
    });
  }

  function result(e){
    const rows=(db.bookings||[])
      .filter(b=>{
        if(b.isModel||!sameCustomer(b,e.customerId,e.customerName)||b.date<e.sentDate)return false;
        if(['aftercare','recovery'].includes(e.type)&&String(b.id)===String(e.bookingId||''))return false;
        return true;
      })
      .sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
    const existing=new Set((e.existingFutureIds||[]).map(String));
    const newBooking=rows.find(b=>!existing.has(String(b.id))&&(isActiveBooking(b)||isVisitedBooking(b)))||null;
    const visited=rows.find(isVisitedBooking)||null;
    return {newBooking,visited};
  }

  function stats(events){
    const rows=events.map(e=>({e,...result(e)}));
    const noBooking=rows.filter(x=>!x.e.hadFuture);
    const booked=noBooking.filter(x=>x.newBooking).length;
    const visited=rows.filter(x=>x.visited).length;
    return {
      total:rows.length,
      noBooking:noBooking.length,
      booked,
      bookedRate:noBooking.length?Math.round(booked/noBooking.length*100):0,
      visited,
      visitedRate:rows.length?Math.round(visited/rows.length*100):0
    };
  }

  function renderBox(){
    const anchor=document.getElementById('returnManagerHomeWrap');
    if(!anchor)return;
    let host=document.getElementById('followupOutcomeHome');
    if(!host){
      host=document.createElement('div');
      host.id='followupOutcomeHome';
      host.className='card';
      host.style.marginTop='9px';
      host.style.cursor='pointer';
      host.onclick=openFollowupOutcomeReport;
      anchor.appendChild(host);
    }
    const s=stats(allEvents());
    host.innerHTML=`
      <div class="small">再来連絡の成果｜直近90日</div>
      <div style="font-size:15px;font-weight:850;margin-top:4px">
        予約なし連絡 ${s.noBooking} → 予約 ${s.booked}（${s.bookedRate}%）
      </div>
      <div class="small" style="margin-top:4px">
        全連絡 ${s.total} → 実来店 ${s.visited}（${s.visitedRate}%）・タップで内訳
      </div>`;
  }

  window.openFollowupOutcomeReport=function(){
    const events=allEvents();
    const total=stats(events);
    const rows=Object.keys(TYPES).map(type=>({type,...stats(events.filter(e=>e.type===type))}));
    modal(`
      <h3>再来連絡の成果</h3>
      <div class="summary-grid">
        <div class="summary-card"><div class="l">予約なし連絡</div><div class="v">${total.noBooking}</div></div>
        <div class="summary-card"><div class="l">予約化</div><div class="v">${total.bookedRate}%</div><div class="small">${total.booked}/${total.noBooking}</div></div>
        <div class="summary-card"><div class="l">全連絡→実来店</div><div class="v">${total.visitedRate}%</div><div class="small">${total.visited}/${total.total}</div></div>
      </div>
      <h3 style="margin:18px 0 8px">連絡別</h3>
      ${rows.map(x=>`<div class="item"><div class="t">${esc(TYPES[x.type])}</div><div class="s">予約なし連絡 ${x.noBooking} ・ 予約 ${x.booked}（${x.bookedRate}%）<br>全連絡 ${x.total} ・ 実来店 ${x.visited}（${x.visitedRate}%）</div></div>`).join('')}
      <div class="note" style="margin-top:10px">連絡時点ですでに予約があった人は予約化率の母数から除外。1週間前・2日前などの事前連絡は実来店率で効果を見ます。</div>
      <button class="ghost" style="width:100%;margin-top:12px" onclick="closeModal()">閉じる</button>`);
  };

  const oldMark=window.markFollowupDone;
  if(typeof oldMark==='function')window.markFollowupDone=function(id,type){
    const b=(db.bookings||[]).find(x=>String(x.id)===String(id));
    const before=type==='aftercare'?!!b?.followAftercare:type==='week'?!!b?.followWeek:!!b?.follow2Days;
    const r=oldMark(id,type);
    if(b&&!before)pushEvent(b,type,id);
    renderBox();
    return r;
  };

  const oldSend=window.sendFollowupLine;
  if(typeof oldSend==='function')window.sendFollowupLine=async function(id,type){
    const b=(db.bookings||[]).find(x=>String(x.id)===String(id));
    const before=type==='aftercare'?!!b?.followAftercare:type==='week'?!!b?.followWeek:!!b?.follow2Days;
    const r=await oldSend(id,type);
    const after=type==='aftercare'?!!b?.followAftercare:type==='week'?!!b?.followWeek:!!b?.follow2Days;
    if(b&&!before&&after)pushEvent(b,type,id);
    renderBox();
    return r;
  };

  const oldSnooze=window.snoozeReminder;
  if(typeof oldSnooze==='function')window.snoozeReminder=function(id){
    const c=(db.customers||[]).find(x=>String(x.id)===String(id));
    const r=oldSnooze(id);
    if(c)pushEvent(c,'return45');
    renderBox();
    return r;
  };

  const oldRecovery=window.markReturnRecoveryDone;
  if(typeof oldRecovery==='function')window.markReturnRecoveryDone=function(id){
    const b=(db.bookings||[]).find(x=>String(x.id)===String(id));
    const before=!!b?.returnRecoveryDone;
    const r=oldRecovery(id);
    if(b&&!before&&b.returnRecoveryDone)pushEvent(b,'recovery',id);
    renderBox();
    return r;
  };

  const oldRenderHome=renderHome;
  renderHome=function(){oldRenderHome();renderBox();};
  renderBox();
})();
