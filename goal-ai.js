(() => {
  if (window.__goalAiV1) return;
  window.__goalAiV1 = true;

  const GOAL_AI_API = 'https://salon-manager-kzgvsz7r97-star.vercel.app/api/goal-ai';
  const DURATION_MIN = 120;

  function sameCustomer(a, b) {
    if (!a || !b) return false;
    if (a.customerId && b.customerId) {
      return String(a.customerId) === String(b.customerId);
    }
    return normalizeName(a.customer || '') === normalizeName(b.customer || '');
  }

  function returnRecoveryRows() {
    const rows = new Map();

    (db.bookings || []).forEach(b => {
      if (b.isModel || b.returnRecoveryDone) return;
      if (!['cancelled', 'noshow'].includes(bookingStatus(b))) return;

      const elapsed = daysBetween(b.date, todayISO);
      if (elapsed < 0 || elapsed > 30) return;

      const priorVisit = (db.bookings || []).some(x =>
        !x.isModel &&
        sameCustomer(b, x) &&
        `${x.date} ${x.time || ''}` < `${b.date} ${b.time || ''}` &&
        isVisitedBooking(x)
      );
      if (!priorVisit) return;

      const future = (db.bookings || []).some(x =>
        !x.isModel &&
        sameCustomer(b, x) &&
        String(x.id) !== String(b.id) &&
        isActiveBooking(x) &&
        x.date >= todayISO
      );
      if (future) return;

      const key = b.customerId
        ? `id:${b.customerId}`
        : `name:${normalizeName(b.customer || '')}`;

      const old = rows.get(key);
      if (!old || `${b.date} ${b.time || ''}` > `${old.date} ${old.time || ''}`) {
        rows.set(key, b);
      }
    });

    return [...rows.values()];
  }
function uniqueReturnDueCount(reminders, recoveries) {
  const keys = new Set();

  (reminders || []).forEach(c => {
    const key = c?.id
   const rawKind = String(req.body?.kind || '');
const kind = ['story', 'nextbooking'].includes(rawKind)
  ? rawKind
  : 'acquisition';

const metrics = req.body?.metrics || {};
const availability = Array.isArray(req.body?.availability)
  ? req.body.availability.slice(0, 7)
  : [];

const facts = {
  month: String(metrics.month || ''),
  goal: safeNumber(metrics.goal),
  forecast: safeNumber(metrics.forecast),
  gap: safeNumber(metrics.gap),
  unit: safeNumber(metrics.unit),
  needed: metrics.needed == null ? null : safeNumber(metrics.needed),
  remainingDays: safeNumber(metrics.remainingDays),
  perDay: metrics.perDay == null ? null : safeNumber(metrics.perDay),
  newVisits: safeNumber(metrics.newVisits),
  nextMissing: safeNumber(metrics.nextMissing),
  availability
};

const task =
  kind === 'story'
    ? `Instagramストーリー用の予約訴求文を1案だけ作る。空き枠は入力された日時をそのまま使い、存在しない枠を作らない。4〜7行程度。最初の1行は短いフック。最後は予約リンクかDMへのCTA。`
    : kind === 'nextbooking'
      ? `今月来店済みで次回予約がまだ決まっていないお客様へ送るLINEまたはDM文面を1案だけ作る。
入力されたmonthに合った季節感や髪の悩みを自然に1文だけ入れる。
売り込み感は出しすぎず、来店後の髪の状態を気遣ってから次回来店を促す。
4〜7行程度。名前や予約日時は勝手に作らない。
「予約してください」と強く迫らず、「タイミング合う時に」「気になってきた頃に」など自然な誘導にする。`
      : `今日使う新規集客文を1案だけ作る。目標までの不足人数と残り営業日を踏まえ、レイヤーカット・顔まわり・透明感カラーの予約につながる短い訴求にする。Instagramストーリーまたは予約媒体にそのまま転用できる5〜8行程度。最後は予約・相談CTA。`;

const prompt = `
あなたは原宿の美容師向け集客アシスタントです。
優先順位そのものはアプリ側で目標差から計算済みです。あなたは文章だけを作ってください。

ターゲット：18〜25歳女性。
得意：似合わせレイヤー、顔まわり、小顔見えの設計、透明感カラー。
トーン：短い、自然、少し可愛い。煽りすぎない。説明しすぎない。赤裸々な売上額はお客様向け文章に書かない。
禁止：予約が埋まっているように見せる虚偽、入力にない空き枠の捏造、No.1など根拠のない表現。

今日の目標データ：
${JSON.stringify(facts)}

依頼：
${task}

完成文だけを返してください。前置き・解説・見出しは不要です。
`.trim();
ターゲット：18〜25歳女性。
得意：似合わせレイヤー、顔まわり、小顔見えの設計、透明感カラー。
トーン：短い、自然、少し可愛い。煽りすぎない。説明しすぎない。赤裸々な売上額はお客様向け文章に書かない。
禁止：予約が埋まっているように見せる虚偽、入力にない空き枠の捏造、No.1など根拠のない表現。

今日の目標データ：
${JSON.stringify(facts)}

依頼：
${task}

完成文だけを返してください。前置き・解説・見出しは不要です。
`.trim();
        return s === e
          ? minToClock(s)
          : `${minToClock(s)}〜${minToClock(e)}`;
      });

      rows.push({
        date: iso,
        label: dayLabelJa(iso),
        slots: parts
      });
    }

    return { rows, capacity };
  }

  function goalContext() {
    const month = monthKey(todayISO);
    const stats = monthStats(month);
    const plan = goalPlanStats(month, stats);
    const goal = Number(getGoal(month) || 0);
    const followups = typeof followupDueItems === 'function'
      ? followupDueItems()
      : [];
    const reminders = typeof reminderCandidates === 'function'
      ? reminderCandidates()
      : [];
    const recoveries = returnRecoveryRows();
    const availability = upcomingAvailability(7);

    const newVisits = (db.bookings || []).filter(b =>
      !b.isModel &&
      monthKey(b.date) === month &&
      b.newGuest &&
      isVisitedBooking(b)
    ).length;
const nextMissing = new Set(
  (db.bookings || [])
    .filter(b =>
      !b.isModel &&
      monthKey(b.date) === month &&
      isVisitedBooking(b) &&
      !nextBookingTakenForBooking(b)
    )
    .map(b => normalizeName(b.customer || ''))
    .filter(Boolean)
).size;
    return {
      month,
      goal,
      forecast: Number(stats.forecast || 0),
      sales: Number(stats.sales || 0),
      gap: Number(plan.gap || 0),
      unit: Number(plan.unit || 0),
      needed: plan.count,
      remainingDays: Number(plan.days || 0),
      perDay: plan.perDay,
      followups,
      reminders,
      recoveries,
      returnDue: uniqueReturnDueCount(reminders, recoveries),
      availability,
  newVisits,
nextMissing,
    };
  }

  function priorityRows(ctx) {
    const rows = [];
    const needed = ctx.needed == null ? 0 : Number(ctx.needed);

    if (ctx.gap <= 0) {
      if (ctx.followups.length) {
        rows.push({
          type: 'protect',
          title: `予約維持 ${ctx.followups.length}件`,
          reason: '目標達成済み。見込み売上を落とさない',
          button: 'フォローを見る'
        });
      }
      if (ctx.returnDue) {
        rows.push({
          type: 'return',
          title: `再来フォロー ${ctx.returnDue}件`,
          reason: '今月達成後は次回来店を積む',
          button: '対象を見る'
        });
      }
      rows.push({
        type: 'acquisition',
        title: '来月の予約を先に作る',
        reason: '今月目標は達成。次月の見込みを増やす',
        button: 'AI文面'
      });
      return rows.slice(0, 3);
    }

    if (ctx.followups.length) {
      rows.push({
        type: 'protect',
        title: `予約維持 ${ctx.followups.length}件`,
        reason: `見込み${yen(ctx.forecast)}を落とさない`,
        button: 'フォローを見る'
      });
    }

    if (ctx.returnDue) {
      rows.push({
        type: 'return',
        title: `再来フォロー ${ctx.returnDue}件`,
        reason: `あと${needed || '—'}人の一部を既存客で埋める`,
        button: '対象を見る'
      });
    }

    if (ctx.availability.rows.length) {
      rows.push({
        type: 'story',
        title: `空き枠をストーリーへ`,
        reason: `あと${needed || '—'}人必要・7日以内に${ctx.availability.rows.length}日空き`,
        button: 'AI文面'
      });
    }

    if (ctx.nextMissing) {
  rows.push({
    type: 'nextbooking',
    title: '次回予約を増やす',
    reason: `今月来店・次回予約未取得 ${ctx.nextMissing}人`,
    button: 'AI文面'
  });
}
    return rows.slice(0, 3);
  }

  function ensureStyle() {
    if (document.getElementById('goalAiStyle')) return;
    const style = document.createElement('style');
    style.id = 'goalAiStyle';
    style.textContent = `
      .goal-ai-card{margin:8px 0 12px;padding:12px}
      .goal-ai-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px}
      .goal-ai-kicker{font-size:10px;color:#777;margin-top:2px}
      .goal-ai-row{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:7px;align-items:center;padding:9px 0;border-top:1px solid #eee}
      .goal-ai-row:first-of-type{border-top:0}
      .goal-ai-num{width:22px;height:22px;border-radius:999px;background:#111;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:850}
      .goal-ai-title{font-size:13px;font-weight:850;line-height:1.25}
      .goal-ai-reason{font-size:10px;color:#777;line-height:1.35;margin-top:2px}
      .goal-ai-row button{font-size:10px;padding:6px 8px;white-space:nowrap}
      .goal-ai-summary{font-size:10px;color:#777;margin-top:6px;line-height:1.4}
    `;
    document.head.appendChild(style);
  }

  function ensureCard() {
    if (document.getElementById('goalAiCard')) return;
    const dashboard = document.getElementById('homeOpsDashboard');
    if (!dashboard) return;
    dashboard.insertAdjacentHTML(
      'afterend',
      '<div id="goalAiCard" class="card goal-ai-card"></div>'
    );
  }

  function renderGoalAi() {
    ensureStyle();
    ensureCard();
    const host = document.getElementById('goalAiCard');
    if (!host) return;

    const ctx = goalContext();
    const rows = priorityRows(ctx);
    const needLabel = ctx.needed == null ? '単価設定待ち' : `${ctx.needed}人`;

    host.innerHTML = `
      <div class="goal-ai-head">
        <div>
          <b>目標から逆算｜今日の優先3つ</b>
          <div class="goal-ai-kicker">優先順位はAIではなく実データで決定</div>
        </div>
        <div class="small">${ctx.gap > 0 ? `あと ${yen(ctx.gap)}` : '目標達成'}</div>
      </div>
      ${rows.map((row, i) => `
        <div class="goal-ai-row">
          <div class="goal-ai-num">${i + 1}</div>
          <div>
            <div class="goal-ai-title">${esc(row.title)}</div>
            <div class="goal-ai-reason">${esc(row.reason)}</div>
          </div>
          <button class="ghost" onclick="runGoalPriority('${row.type}')">${esc(row.button)}</button>
        </div>
      `).join('')}
      <div class="goal-ai-summary">
        今月見込み ${yen(ctx.forecast)} / 目標 ${yen(ctx.goal)} ・ 必要 ${needLabel} ・ 残り営業日 ${ctx.remainingDays}日
      </div>
    `;
  }

  function availabilityPayload(ctx) {
    return ctx.availability.rows.slice(0, 5).map(x => ({
      date: x.date,
      label: x.label,
      slots: x.slots
    }));
  }

  function aiFallback(kind, ctx) {
  if (kind === 'nextbooking') {
    const month = Number(String(ctx.month || '').slice(5, 7));

    const season = {
      1:'乾燥が出やすい時期なので、毛先のまとまりも一緒に整えられます◎',
      2:'乾燥やパサつきが出やすい時期なので、扱いやすく整えられます◎',
      3:'春先の広がりや扱いづらさが出る前に整えておくのがおすすめです◎',
      4:'湿気が増える前に顔まわりやレイヤーを整えておくと扱いやすいです◎',
      5:'梅雨前に広がりやすい部分を整えておくのがおすすめです◎',
      6:'湿気で広がりやすい時期なので、まとまりやすく整えられます◎',
      7:'紫外線や色落ちも出やすいので、カットとカラーのメンテナンスがおすすめです◎',
      8:'紫外線や冷房で乾燥しやすいので、毛先のメンテナンスもおすすめです◎',
      9:'夏のダメージや色落ちが出やすい頃なので、一度整えるのがおすすめです◎',
      10:'少し乾燥しやすくなってきたので、毛先や顔まわりのメンテナンスがおすすめです◎',
      11:'乾燥や静電気が出る前に、まとまりやすく整えておくのがおすすめです◎',
      12:'年末前に一度髪を整えておくのがおすすめです◎'
    }[month] || '';

    return `その後、髪の状態いかがですか？

${season}

次回まだ決まってなければ、タイミング合う時にいつでもご相談ください☺️`;
  }

  if (kind === 'story') {
    const slots = ctx.availability.rows
      .slice(0, 4)
      .map(x => `${x.label}  ${x.slots.join(' / ')}`)
      .join('\n');

    return `ご予約空きあります◎

${slots || '空き枠は予約ページをご確認ください'}

レイヤーカット・顔まわり・透明感カラーご相談ください✂️
ご予約はプロフィールのリンクからお願いします。`;
  }

  return `今月まだご案内できます◎
レイヤーカット・顔まわり・透明感カラーで迷っている方は気軽にご相談ください✂️
ご予約はプロフィールのリンクからお願いします。`;
}
 async function requestAi(kind, ctx) {
  const key = getCloudBackupKey();
  if (!key) throw new Error('同期キーが未設定です');

  const response = await fetch(GOAL_AI_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Backup-Key': key
    },
    body: JSON.stringify({
      kind,
      metrics: {
        month: ctx.month,
        goal: ctx.goal,
        forecast: ctx.forecast,
        gap: ctx.gap,
        unit: ctx.unit,
        needed: ctx.needed,
        remainingDays: ctx.remainingDays,
        perDay: ctx.perDay,
        newVisits: ctx.newVisits,
        nextMissing: ctx.nextMissing
      },
      availability: availabilityPayload(ctx)
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || 'AI文面を作れませんでした');
  }

  return String(body.text || '').trim();
}
  window.runGoalPriority = async function (type) {
    if (type === 'protect') {
      if (typeof openHomeFollowups === 'function') openHomeFollowups();
      return;
    }

    if (type === 'return') {
      if (typeof openHomeReturnManager === 'function') openHomeReturnManager();
      else if (typeof openReturnManager === 'function') openReturnManager(monthKey(todayISO));
      return;
    }

    const ctx = goalContext();
    const title = type === 'story' ? '空き枠ストーリー' : '新規集客文面';

    modal(`
      <h3>${title}</h3>
      <div class="note" style="margin-bottom:10px">
        目標まで ${yen(ctx.gap)} / 必要 ${ctx.needed == null ? '—' : ctx.needed + '人'} を基準に作成します。
      </div>
      <textarea id="goalAiOutput" style="min-height:180px">AI作成中…</textarea>
      <div id="goalAiStatus" class="small" style="margin-top:7px">顧客名などの個人情報はAIへ送りません。</div>
      <div class="actions">
        <button class="ghost" onclick="closeModal()">閉じる</button>
        <button class="ghost" onclick="regenerateGoalAi('${type}')">作り直す</button>
        <button class="blue" onclick="copyGoalAiText()">コピー</button>
      </div>
    `);

    await fillGoalAiText(type, ctx);
  };

  async function fillGoalAiText(type, ctx) {
    const output = document.getElementById('goalAiOutput');
    const status = document.getElementById('goalAiStatus');
    if (!output) return;

    output.value = 'AI作成中…';
    try {
      const text = await requestAi(type, ctx);
      output.value = text || aiFallback(type, ctx);
      if (status) status.textContent = '目標差と空き枠からAIで作成しました。';
    } catch (e) {
      output.value = aiFallback(type, ctx);
      if (status) status.textContent = `${e.message}。いまは目標ベースのテンプレを表示しています。`;
    }
  }

  window.regenerateGoalAi = async function (type) {
    await fillGoalAiText(type, goalContext());
  };

  window.copyGoalAiText = async function () {
    const el = document.getElementById('goalAiOutput');
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.value);
      alert('文面をコピーしました');
    } catch (_) {
      el.focus();
      el.select();
      document.execCommand('copy');
      alert('文面をコピーしました');
    }
  };

  const oldRenderHome = renderHome;
  renderHome = function () {
    oldRenderHome();
    renderGoalAi();
  };

  renderGoalAi();
})();
