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
      ? `id:${String(c.id)}`
      : `name:${normalizeName(c?.name || '')}`;

    if (key !== 'name:') {
      keys.add(key);
    }
  });

  (recoveries || []).forEach(b => {
    const key = b?.customerId
      ? `id:${String(b.customerId)}`
      : `name:${normalizeName(b?.customer || '')}`;

    if (key !== 'name:') {
      keys.add(key);
    }
  });

  return keys.size;
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

    if (
      plan.mondayOff !== false &&
      d.getDay() === 1
    ) {
      continue;
    }

    if (
      (plan.closedDates || []).includes(iso)
    ) {
      continue;
    }

    const ranges = availabilityForDate(
      iso,
      11 * 60,
      21 * 60,
      DURATION_MIN
    );

    if (!ranges.length) continue;

    const parts = ranges.map(([s, e]) => {
      capacity +=
        Math.floor(
          (e - s) / DURATION_MIN
        ) + 1;

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

  return {
    rows,
    capacity
  };
}

function goalContext() {
  const month = monthKey(todayISO);
  const stats = monthStats(month);
  const plan = goalPlanStats(month, stats);
  const goal = Number(getGoal(month) || 0);

  const followups =
    typeof followupDueItems === 'function'
      ? followupDueItems()
      : [];

  const reminders =
    typeof reminderCandidates === 'function'
      ? reminderCandidates()
      : [];

  const recoveries =
    returnRecoveryRows();

  const availability =
    upcomingAvailability(7);

  const newVisits =
    (db.bookings || []).filter(b =>
      !b.isModel &&
      monthKey(b.date) === month &&
      b.newGuest &&
      isVisitedBooking(b)
    ).length;

  const nextMissing =
    new Set(
      (db.bookings || [])
        .filter(b =>
          !b.isModel &&
          monthKey(b.date) === month &&
          isVisitedBooking(b) &&
          !nextBookingTakenForBooking(b)
        )
        .map(b =>
          normalizeName(b.customer || '')
        )
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
    returnDue:
      uniqueReturnDueCount(
        reminders,
        recoveries
      ),
    availability,
    newVisits,
    nextMissing
  };
}
  function priorityRows(ctx) {
  const rows = [];
  const needed =
    ctx.needed == null
      ? 0
      : Number(ctx.needed);

  if (ctx.gap <= 0) {
    if (ctx.followups.length) {
      rows.push({
        type: 'protect',
        title: `予約維持 ${ctx.followups.length}件`,
        reason: '目標達成済み。見込み売上を落とさない',
        button: 'フォローを見る'
      });
    }

    rows.push({
      type: 'nextbooking',
      title: '次回予約を増やす',
      reason: `今月来店・次回予約未取得 ${ctx.nextMissing || 0}人`,
      button: 'AI文面'
    });

    if (ctx.returnDue) {
      rows.push({
        type: 'return',
        title: `再来フォロー ${ctx.returnDue}件`,
        reason: '次回来店につながる既存客を優先',
        button: '対象を見る'
      });
    }

    return rows.slice(0, 3);
  }

  if (ctx.availability.rows.length) {
    rows.push({
      type: 'story',
      title: '空き枠をストーリーへ',
      reason: `あと${needed || '—'}人必要・7日以内に${ctx.availability.rows.length}日空き`,
      button: 'AI文面'
    });
  }

  rows.push({
    type: 'nextbooking',
    title: '次回予約を増やす',
    reason: `今月来店・次回予約未取得 ${ctx.nextMissing || 0}人`,
    button: 'AI文面'
  });

  if (ctx.followups.length) {
    rows.push({
      type: 'protect',
      title: `予約維持 ${ctx.followups.length}件`,
      reason: `見込み${yen(ctx.forecast)}を落とさない`,
      button: 'フォローを見る'
    });
  } else if (ctx.returnDue) {
    rows.push({
      type: 'return',
      title: `再来フォロー ${ctx.returnDue}件`,
      reason: `既存客からあと${needed || '—'}人の一部を埋める`,
      button: '対象を見る'
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

  const dashboard =
    document.getElementById('homeOpsDashboard');

  if (!dashboard) return;

  dashboard.insertAdjacentHTML(
    'afterend',
    '<div id="goalAiCard" class="card goal-ai-card"></div>'
  );
}

function renderGoalAi() {
  ensureStyle();
  ensureCard();

  const host =
    document.getElementById('goalAiCard');

  if (!host) return;

  const ctx = goalContext();
  const rows = priorityRows(ctx);

  const needLabel =
    ctx.needed == null
      ? '単価設定待ち'
      : `${ctx.needed}人`;

  host.innerHTML = `
    <div class="goal-ai-head">
      <div>
        <b>目標から逆算｜今日の優先3つ</b>
        <div class="goal-ai-kicker">
          優先順位は実データで自動決定
        </div>
      </div>

      <div class="small">
        ${ctx.gap > 0
          ? `あと ${yen(ctx.gap)}`
          : '目標達成'}
      </div>
    </div>

    ${rows.map((row, i) => `
      <div class="goal-ai-row">
        <div class="goal-ai-num">
          ${i + 1}
        </div>

        <div>
          <div class="goal-ai-title">
            ${esc(row.title)}
          </div>

          <div class="goal-ai-reason">
            ${esc(row.reason)}
          </div>
        </div>

        <button
          class="ghost"
          onclick="runGoalPriority('${row.type}')"
        >
          ${esc(row.button)}
        </button>
      </div>
    `).join('')}

    <div class="goal-ai-summary">
      今月見込み ${yen(ctx.forecast)}
      /
      目標 ${yen(ctx.goal)}
      ・ 必要 ${needLabel}
      ・ 残り営業日 ${ctx.remainingDays}日
    </div>
  `;
}

function availabilityPayload(ctx) {
  return ctx.availability.rows
    .slice(0, 5)
    .map(x => ({
      date: x.date,
      label: x.label,
      slots: x.slots
    }));
}

function aiFallback(kind, ctx) {
  window.__goalAiFallbackSeq =
    (Number(window.__goalAiFallbackSeq || 0) + 1) % 6;

  const v = window.__goalAiFallbackSeq;

  if (kind === 'nextbooking') {
    const month =
      Number(String(ctx.month || '').slice(5, 7));

    const seasons = {
      1:'乾燥で毛先がまとまりづらくなりやすい時期です◎',
      2:'乾燥やパサつきが出やすい時期です◎',
      3:'春先は広がりや扱いづらさが出やすい時期です◎',
      4:'少しずつ湿気が増えてくる時期です◎',
      5:'梅雨前で広がりが気になりやすい時期です◎',
      6:'湿気でうねりや広がりが出やすい時期です◎',
      7:'紫外線や色落ちが気になりやすい時期です◎',
      8:'紫外線や冷房で乾燥しやすい時期です◎',
      9:'夏のダメージや色落ちが出やすい頃です◎',
      10:'少し乾燥しやすくなってくる時期です◎',
      11:'乾燥や静電気が気になりやすい時期です◎',
      12:'年末前に髪を整える方が増える時期です◎'
    };

    const season = seasons[month] || '';

    const variants = [
      `その後、髪の状態いかがですか？

${season}
毛先や顔まわりで気になるところあれば、また整えられます◎

次回まだ決まってなければ、タイミング合う時にいつでもご相談ください☺️`,

      `前回から髪の扱いやすさどうですか？

${season}
気になってきたところがあれば、そろそろメンテナンスしてもいい頃です◎

また都合合う時に気軽に連絡してください！`,

      `最近、髪で気になるところ出てきてないですか？☺️

${season}
顔まわりや毛先だけでも整えると扱いやすくなります◎

次回まだでしたら、いつでも相談してください！`,

      `${season}

前回のスタイル、その後どうですか？
扱いづらくなってきたところがあれば一度見させてください◎

タイミング良い時にまたお待ちしてます！`,

      `そろそろ髪の状態どうかなと思って連絡しました！

${season}
気になるところが出てきてたら、次回また相談しながら決めましょう◎

予定合う時にいつでもどうぞ☺️`,

      `前回から少し経ちましたが、髪の調子いかがですか？

${season}
無理に周期合わせなくて大丈夫なので、気になってきたタイミングでまたご相談ください◎`
    ];

    return variants[v % variants.length];
  }

  if (kind === 'story') {
    const slots =
      ctx.availability.rows
        .slice(0, 4)
        .map(x => `${x.label}  ${x.slots.join(' / ')}`)
        .join('\n');

    const variants = [
      `今週まだご案内できます◎

${slots || '空き枠は予約ページをご確認ください'}

レイヤー・顔まわり・透明感カラーご相談ください✂️
ご予約はプロフィールから！`,

      `髪変えたい方、空きあります🫶

${slots || '空き枠は予約ページをご確認ください'}

顔まわりやレイヤーも相談しながら決められます◎
DM・予約リンクからどうぞ！`,

      `今週の空き枠です✂️

${slots || '空き枠は予約ページをご確認ください'}

ワンカールで扱いやすいレイヤーおすすめです◎
ご予約お待ちしてます！`
    ];

    return variants[v % variants.length];
  }

  const variants = [
    `今月まだご案内できます◎
レイヤーや顔まわりを変えたい方、気軽にご相談ください✂️
ご予約はプロフィールのリンクからお願いします。`,

    `なんとなく髪型変えたい方へ◎
顔まわり・レイヤー・透明感カラーまで相談しながら決められます！
ご予約・相談お待ちしてます。`,

    `ワンカールでも扱いやすいレイヤーおすすめです✂️
雰囲気を変えたい方は気軽にご相談ください◎
ご予約はプロフィールから！`
  ];

  return variants[v % variants.length];
}

async function requestAi(kind, ctx, previousText = '') {
  const key = getCloudBackupKey();

  if (!key) {
    throw new Error('同期キーが未設定です');
  }

  const variationKey =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  const variationMode =
    Math.floor(Math.random() * 6);

  const response =
    await fetch(
      GOAL_AI_API,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Backup-Key': key
        },
        body: JSON.stringify({
          kind,
          variationKey,
          variationMode,
          previousText:
            String(previousText || '')
              .slice(0, 1200),
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
          availability:
            availabilityPayload(ctx)
        })
      }
    );

  const body =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.error ||
      'AI文面を作れませんでした'
    );
  }

  return String(body.text || '').trim();
}
window.runGoalPriority =
  async function (type) {
    if (type === 'protect') {
      if (
        typeof openHomeFollowups ===
        'function'
      ) {
        openHomeFollowups();
      }

      return;
    }

    if (type === 'return') {
      if (
        typeof openHomeReturnManager ===
        'function'
      ) {
        openHomeReturnManager();
      } else if (
        typeof openReturnManager ===
        'function'
      ) {
        openReturnManager(
          monthKey(todayISO)
        );
      }

      return;
    }

    const ctx =
      goalContext();

    const title =
      type === 'story'
        ? '空き枠ストーリー'
        : type === 'nextbooking'
          ? '次回予約LINE'
          : '新規集客文面';

    const note =
      type === 'nextbooking'
        ? `今月来店・次回予約未取得 ${ctx.nextMissing}人を基準に作成します。`
        : `目標まで ${yen(ctx.gap)} / 必要 ${
            ctx.needed == null
              ? '—'
              : ctx.needed + '人'
          } を基準に作成します。`;

    modal(`
      <h3>${title}</h3>

      <div
        class="note"
        style="margin-bottom:10px"
      >
        ${note}
      </div>

      <textarea
        id="goalAiOutput"
        style="min-height:180px"
      >AI作成中…</textarea>

      <div
        id="goalAiStatus"
        class="small"
        style="margin-top:7px"
      >
        顧客名などの個人情報はAIへ送りません。
      </div>

      <div class="actions">
        <button
          class="ghost"
          onclick="closeModal()"
        >
          閉じる
        </button>

        <button
          class="ghost"
          onclick="regenerateGoalAi('${type}')"
        >
          作り直す
        </button>

        <button
          class="blue"
          onclick="copyGoalAiText()"
        >
          コピー
        </button>
      </div>
    `);

    await fillGoalAiText(
      type,
      ctx
    );
  };
 async function fillGoalAiText(type, ctx) {
  const output =
    document.getElementById('goalAiOutput');

  const status =
    document.getElementById('goalAiStatus');

  if (!output) return;

  const previousText =
    output.value &&
    output.value !== 'AI作成中…'
      ? output.value.trim()
      : '';

  output.value = 'AI作成中…';

  try {
    const text =
      await requestAi(
        type,
        ctx,
        previousText
      );

    const same =
      previousText &&
      text.replace(/\s+/g, '') ===
      previousText.replace(/\s+/g, '');

    output.value =
      !text || same
        ? aiFallback(type, ctx)
        : text;

    if (status) {
      status.textContent =
        same
          ? '前回と同じだったため別パターンに切り替えました。'
          : 'AIで別パターンを生成しました。';
    }
  } catch (e) {
    output.value =
      aiFallback(type, ctx);

    if (status) {
      status.textContent =
        `${e.message}。別パターンのテンプレを表示しています。`;
    }
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
