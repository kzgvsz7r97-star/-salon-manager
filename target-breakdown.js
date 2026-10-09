(() => {
  if (window.__targetBreakdownV1) return;
  window.__targetBreakdownV1 = true;

  const LOOKBACK_DAYS = 90;

  const stamp = b =>
    `${b?.date || ''} ${b?.time || ''}`;

  function sameCustomer(a, b) {
    if (!a || !b) return false;

    if (a.customerId && b.customerId) {
      return String(a.customerId) === String(b.customerId);
    }

    return (
      normalizeName(a.customer || '') ===
      normalizeName(b.customer || '')
    );
  }

  function visitedBefore(first) {
    return (db.bookings || []).some(b =>
      !b.isModel &&
      sameCustomer(first, b) &&
      stamp(b) < stamp(first) &&
      isVisitedBooking(b)
    );
  }

  function trueNewVisit(b) {
    return !!(
      b &&
      !b.isModel &&
      b.newGuest &&
      isVisitedBooking(b) &&
      !visitedBefore(b)
    );
  }

  function averagePrice(rows, fallback) {
    const prices = rows
      .map(x => Number(x.price || 0))
      .filter(x => Number.isFinite(x) && x > 0);

    if (!prices.length) {
      return Math.max(1, Number(fallback || 0));
    }

    return Math.round(
      prices.reduce((a, x) => a + x, 0) /
      prices.length
    );
  }

  function recentHistory() {
    const start = dateOnly(todayISO);
    start.setDate(start.getDate() - LOOKBACK_DAYS);
    const startISO = localISO(start);

    return (db.bookings || []).filter(b =>
      !b.isModel &&
      b.date >= startISO &&
      b.date < todayISO &&
      isVisitedBooking(b)
    );
  }

  function returnPersonKey(value, booking = false) {
    if (!value) return '';

    if (!booking && value.id) {
      return `id:${String(value.id)}`;
    }

    if (booking && value.customerId) {
      return `id:${String(value.customerId)}`;
    }

    const name = normalizeName(
      booking
        ? value.customer || ''
        : value.name || ''
    );

    if (!name) return '';

    const customer = (db.customers || []).find(
      c => normalizeName(c.name || '') === name
    );

    if (customer?.id) {
      return `id:${String(customer.id)}`;
    }

    return `name:${name}`;
  }

  function currentReturnCapacity() {
    const keys = new Set();

    const reminders =
      typeof reminderCandidates === 'function'
        ? reminderCandidates()
        : [];

    reminders.forEach(c => {
      const key = returnPersonKey(c, false);
      if (key) keys.add(key);
    });

    (db.bookings || []).forEach(b => {
      if (
        b.isModel ||
        b.returnRecoveryDone ||
        !['cancelled', 'noshow'].includes(bookingStatus(b))
      ) {
        return;
      }

      const days = daysBetween(b.date, todayISO);

      if (days < 0 || days > 30) return;

      const priorVisit = (db.bookings || []).some(x =>
        !x.isModel &&
        sameCustomer(b, x) &&
        stamp(x) < stamp(b) &&
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

      const key = returnPersonKey(b, true);

      if (key) keys.add(key);
    });

    return keys.size;
  }

  function currentTargetBreakdown() {
    const month = monthKey(todayISO);
    const stats = monthStats(month);
    const plan = goalPlanStats(month, stats);

    const goal = Number(getGoal(month) || 0);
    const gap = Math.max(
      0,
      Number(plan.gap || 0)
    );

    const fallbackUnit = Math.max(
      1,
      Number(plan.unit || stats.avg || 10000)
    );

    const history = recentHistory();

    const histNew =
      history.filter(trueNewVisit);

    const histRepeat =
      history.filter(
        b => !trueNewVisit(b)
      );

    const currentVisits =
      (db.bookings || []).filter(b =>
        !b.isModel &&
        monthKey(b.date) === month &&
        isVisitedBooking(b)
      );

    const currentNew =
      currentVisits.filter(trueNewVisit);

    const currentRepeat =
      currentVisits.filter(
        b => !trueNewVisit(b)
      );

    const newAvg = averagePrice(
      histNew.length >= 2
        ? histNew
        : currentNew,
      fallbackUnit
    );

    const repeatAvg = averagePrice(
      histRepeat.length >= 2
        ? histRepeat
        : currentRepeat,
      fallbackUnit
    );

    let newShare = 0.4;

    if (history.length >= 5) {
      newShare =
        histNew.length / history.length;
    } else if (currentVisits.length >= 3) {
      newShare =
        currentNew.length /
        currentVisits.length;
    }

    newShare = Math.max(
      0,
      Math.min(
        1,
        Number(newShare || 0)
      )
    );

    const repeatShare =
      1 - newShare;

    const blendedUnit = Math.max(
      1,
      Math.round(
        newAvg * newShare +
        repeatAvg * repeatShare
      )
    );

    const returnCapacity =
      currentReturnCapacity();

    if (!gap) {
      return {
        month,
        goal,
        forecast:
          Number(stats.forecast || 0),
        gap: 0,
        newNeed: 0,
        repeatNeed: 0,
        totalNeed: 0,
        perDay: 0,
        remainingDays:
          Number(plan.days || 0),
        newAvg,
        repeatAvg,
        newShare,
        returnCapacity,
        expectedRevenue: 0
      };
    }

    let totalNeed =
      Math.ceil(gap / blendedUnit);

    let newNeed =
      Math.round(
        totalNeed * newShare
      );

    let repeatNeed =
      Math.max(
        0,
        totalNeed - newNeed
      );

    if (repeatNeed > returnCapacity) {
      const overflow =
        repeatNeed - returnCapacity;

      repeatNeed =
        returnCapacity;

      newNeed += overflow;
    }

    let expectedRevenue =
      newNeed * newAvg +
      repeatNeed * repeatAvg;

    totalNeed =
      newNeed + repeatNeed;

    while (
      expectedRevenue < gap &&
      totalNeed < 999
    ) {
      const currentRepeatShare =
        totalNeed > 0
          ? repeatNeed / totalNeed
          : 0;

      const canAddRepeat =
        repeatNeed < returnCapacity;

      if (
        canAddRepeat &&
        currentRepeatShare < repeatShare
      ) {
        repeatNeed += 1;
        expectedRevenue += repeatAvg;
      } else {
        newNeed += 1;
        expectedRevenue += newAvg;
      }

      totalNeed =
        newNeed + repeatNeed;
    }

    const remainingDays =
      Number(plan.days || 0);

    const perDay =
      remainingDays
        ? Math.ceil(
            totalNeed /
            remainingDays *
            10
          ) / 10
        : null;

    return {
      month,
      goal,
      forecast:
        Number(stats.forecast || 0),
      gap,
      newNeed,
      repeatNeed,
      totalNeed,
      perDay,
      remainingDays,
      newAvg,
      repeatAvg,
      newShare,
      returnCapacity,
      expectedRevenue
    };
  }  window.getGoalTargetBreakdown =
    currentTargetBreakdown;

  function ensureStyle() {
    if (document.getElementById('targetBreakdownStyle')) return;

    const style = document.createElement('style');
    style.id = 'targetBreakdownStyle';

    style.textContent = `
      .goal-split-line{
        margin:7px 0 2px;
        padding:8px 9px;
        border-radius:10px;
        background:#f7f7f7;
        font-size:11px;
        line-height:1.45;
      }

      .goal-split-line b{
        font-size:12px;
      }

      .goal-split-note{
        font-size:9px;
        color:#888;
        margin-top:2px;
      }
    `;

    document.head.appendChild(style);
  }

  function updatePriorityReasons(plan) {
    const card = document.getElementById('goalAiCard');
    if (!card) return;

    const rows = card.querySelectorAll('.goal-ai-row');

    rows.forEach(row => {
      const title =
        row.querySelector('.goal-ai-title')?.textContent || '';

      const reason =
        row.querySelector('.goal-ai-reason');

      if (!reason || plan.gap <= 0) return;

      if (title.includes('再来フォロー')) {
        reason.textContent =
          `再来であと${plan.repeatNeed}人が目安・使える対象から優先`;
      }

      if (title.includes('新規集客')) {
        reason.textContent =
          `新規であと${plan.newNeed}人が目安・目標まで${yen(plan.gap)}`;
      }

      if (title.includes('空き枠')) {
        reason.textContent =
          `新規あと${plan.newNeed}人が目安・近い空き枠から埋める`;
      }
    });
  }

  function renderTargetBreakdown() {
    ensureStyle();

    const card = document.getElementById('goalAiCard');
    if (!card) return;

    const plan = currentTargetBreakdown();

    let host =
      document.getElementById('goalSplitLine');

    if (!host) {
      host = document.createElement('div');
      host.id = 'goalSplitLine';
      host.className = 'goal-split-line';

      const head =
        card.querySelector('.goal-ai-head');

      if (head) {
        head.insertAdjacentElement('afterend', host);
      } else {
        card.prepend(host);
      }
    }

    if (plan.gap <= 0) {
      host.innerHTML = `
        <b>今月目標達成 ✓</b>
        <div class="goal-split-note">
          次月予約と再来維持を優先
        </div>
      `;
    } else {
      const pace =
        plan.perDay == null
          ? '—'
          : `${plan.perDay}人`;

      host.innerHTML = `
        <b>残り目安</b>　
        新規 <b>+${plan.newNeed}人</b>
         ｜ 再来 <b>+${plan.repeatNeed}人</b>
         ｜ 1営業日 <b>${pace}</b>
        <div class="goal-split-note">
          直近90日の実来店比率・平均単価から自動計算
        </div>
      `;
    }

    const summary =
      card.querySelector('.goal-ai-summary');

    if (summary && plan.gap > 0) {
      summary.textContent =
        `今月見込み ${yen(plan.forecast)} / 目標 ${yen(plan.goal)} ・ 残り ${yen(plan.gap)} ・ 必要 ${plan.totalNeed}人`;
    }

    updatePriorityReasons(plan);
  }

  const oldRenderHome = renderHome;

  renderHome = function () {
    oldRenderHome();
    renderTargetBreakdown();
  };

  renderTargetBreakdown();
})();
