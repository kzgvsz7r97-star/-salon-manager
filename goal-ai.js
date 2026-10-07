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

  function upcomingAvailability(days = 7) {
    const m = monthKey(todayISO);
    const plan = db.goalPlans?.[m] || {};
    const rows = [];
    let capacity = 0;

    for (let i = 0; i < days; i++) {
      const d = dateOnly(todayISO);
      d.setDate(d.getDate() + i);
      const iso = localISO(d);

      if (plan.mondayOff !== false && d.getDay() === 1) continue;
      if ((plan.closedDates || []).includes(iso)) continue;

      const ranges = availabilityForDate(
        iso,
        11 * 60,
        21 * 60,
        DURATION_MIN
      );

      if (!ranges.length) continue;

      const parts = ranges.map(([s, e]) => {
        capacity += Math.floor((e - s) / DURATION_MIN) + 1;
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
      returnDue: reminders.length + recoveries.length,
      availability,
      newVisits
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

    rows.push({
      type: 'acquisition',
      title: '新規集客を強める',
      reason: `目標まで${yen(ctx.gap)}・あと${needed || '—'}人`,
      button: 'AI文面'
    });

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
    if (kind === 'story') {
      const slots = ctx.availability.rows
        .slice(0, 4)
        .map(x => `${x.label}  ${x.slots.join(' / ')}`)
        .join('\n');
      return `ご予約空きあります◎\n\n${slots || '空き枠は予約ページをご確認ください'}\n\nレイヤーカット・顔まわり・透明感カラーご相談ください✂️\nご予約はプロフィールのリンクからお願いします。`;
    }

    return `今月まだご案内できます◎\nレイヤーカット・顔まわり・透明感カラーで迷っている方は気軽にご相談ください✂️\nご予約はプロフィールのリンクからお願いします。`;
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
          goal: ctx.goal,
          forecast: ctx.forecast,
          gap: ctx.gap,
          unit: ctx.unit,
          needed: ctx.needed,
          remainingDays: ctx.remainingDays,
          perDay: ctx.perDay,
          newVisits: ctx.newVisits
        },
        availability: availabilityPayload(ctx)
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'AI文面を作れませんでした');
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
