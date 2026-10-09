(() => {
  if (window.__homeDashboardV1) return;
  window.__homeDashboardV1 = true;

  let monthlyDetailsOpen = false;

  function sameCustomer(a, b) {
    if (!a || !b) return false;

    if (a.customerId && b.customerId) {
      return String(a.customerId) === String(b.customerId);
    }

    return normalizeName(a.customer || '') ===
      normalizeName(b.customer || '');
  }

 function returnRecoveryRows() {
    const rows = new Map();

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
        (x.date + (x.time || '')) <
          (b.date + (b.time || '')) &&
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

      if (
        !old ||
        (b.date + (b.time || '')) >
          (old.date + (old.time || ''))
      ) {
        rows.set(key, b);
      }
    });

    return [...rows.values()];
  }

  function quickStats() {
    const m =
      typeof homeMonth !== 'undefined'
        ? monthString(homeMonth)
        : monthKey(todayISO);

    const todayRows = (db.bookings || [])
      .filter(
        b =>
          b.date === todayISO &&
          isActiveBooking(b)
      );

    const todayNormal =
      todayRows.filter(b => !b.isModel);

    const todayModels =
      todayRows.filter(b => b.isModel);

    const todayRevenue =
      todayNormal.reduce(
        (sum, b) =>
          sum +
          Number(b.price || 0),
        0
      );

    const month =
      typeof monthStats === 'function'
        ? monthStats(m)
        : {
            forecast: 0
          };

    const plan =
      typeof goalPlanStats === 'function'
        ? goalPlanStats(m)
        : null;

    const goal =
      typeof getGoal === 'function'
        ? Number(getGoal(m) || 0)
        : 0;

    const gap =
      plan
        ? Number(plan.gap || 0)
        : Math.max(
            0,
            goal -
              Number(
                month.forecast || 0
              )
          );

    const need =
      plan
        ? plan.count
        : null;

    const followups =
      typeof followupDueItems === 'function'
        ? followupDueItems().length
        : 0;

    const reminderRows =
  typeof reminderCandidates === 'function'
    ? reminderCandidates()
    : [];

const recoveryRows =
  returnRecoveryRows();

const returnKeys = new Set();

reminderRows.forEach(c => {
  const key = c?.id
    ? `id:${String(c.id)}`
    : `name:${normalizeName(c?.name || '')}`;

  if (key !== 'name:') returnKeys.add(key);
});

recoveryRows.forEach(b => {
  const key = b?.customerId
    ? `id:${String(b.customerId)}`
    : `name:${normalizeName(b?.customer || '')}`;

  if (key !== 'name:') returnKeys.add(key);
});

const reminders = reminderRows.length;
const recovery = recoveryRows.length;

    return {
      m,
      todayNormal:
        todayNormal.length,
      todayModels:
        todayModels.length,
      todayRevenue,
      forecast:
        Number(
          month.forecast || 0
        ),
      goal,
      gap,
      need,
      followups,
      reminders,
      recovery,
      returnDue:
        reminders + recovery
    };
  }

  function ensureStyle() {
    if (
      document.getElementById(
        'homeDashboardStyle'
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        'style'
      );

    style.id =
      'homeDashboardStyle';

    style.textContent = `
      .home-ops{
        margin:12px 0;
      }

      .home-ops-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:8px;
      }

      .home-ops-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
      }

      .home-ops-card{
        border:1px solid #e7e3dc;
        border-radius:14px;
        padding:11px;
        background:#fff;
        min-width:0;
      }

      .home-ops-card .l{
        font-size:11px;
        color:#777;
        font-weight:700;
      }

      .home-ops-card .v{
        font-size:20px;
        font-weight:900;
        margin-top:4px;
        line-height:1.15;
      }

      .home-ops-card .s{
        font-size:10px;
        color:#888;
        margin-top:4px;
        line-height:1.4;
      }

      .home-ops-card.attention{
        border-width:2px;
      }

      .home-ops-progress{
        height:7px;
        border-radius:999px;
        background:#eee;
        overflow:hidden;
        margin-top:10px;
      }

      .home-ops-progress i{
        display:block;
        height:100%;
        background:#111;
        border-radius:999px;
      }

      .home-ops-actions{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:7px;
        margin-top:10px;
      }

      .home-ops-actions button{
        min-width:0;
        padding-left:6px;
        padding-right:6px;
        font-size:11px;
      }

      .home-fold-hidden{
        display:none !important;
      }

      .home-fold-title{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
      }

      .home-fold-title button{
        font-size:11px;
        padding:5px 9px;
      }

      @media(max-width:380px){
        .home-ops-actions{
          grid-template-columns:1fr;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  function ensureDashboard() {
    if (
      document.getElementById(
        'homeOpsDashboard'
      )
    ) {
      return;
    }

    const home =
      document.getElementById(
        'home'
      );

    const monthbar =
      home?.querySelector(
        '.monthbar'
      );

    if (
      !home ||
      !monthbar
    ) {
      return;
    }

    const box =
      document.createElement(
        'div'
      );

    box.id =
      'homeOpsDashboard';

    box.className =
      'home-ops card';

    monthbar.insertAdjacentElement(
      'afterend',
      box
    );

    const monthlyGrid =
      home.querySelector(
        '.grid'
      );

    if (monthlyGrid) {
      monthlyGrid.id =
        'homeMonthlyDetails';
    }

    const goalPlanner =
      document.getElementById(
        'goalPlanner'
      );

    if (goalPlanner) {
      goalPlanner.dataset
        .monthlyDetail =
        '1';
    }
  }

  function applyMonthlyDetailState() {
    const grid =
      document.getElementById(
        'homeMonthlyDetails'
      );

    const planner =
      document.getElementById(
        'goalPlanner'
      );

    [grid, planner]
      .filter(Boolean)
      .forEach(el => {
        el.classList.toggle(
          'home-fold-hidden',
          !monthlyDetailsOpen
        );
      });
  }

  function setupFold(
    target,
    open = false
  ) {
    if (
      !target ||
      target.dataset
        .homeFoldReady ===
        '1'
    ) {
      return;
    }

    const title =
      target.previousElementSibling;

    if (
      !title ||
      title.tagName !== 'H2'
    ) {
      return;
    }

    target.dataset
      .homeFoldReady =
      '1';

    target.dataset
      .homeFoldOpen =
      open
        ? '1'
        : '0';

    title.classList.add(
      'home-fold-title'
    );

    const button =
      document.createElement(
        'button'
      );

    button.className =
      'ghost';

    button.dataset.foldTarget =
      target.id;

    button.onclick =
      event => {
        event.stopPropagation();

        window.toggleHomeFold(
          target.id
        );
      };

    title.appendChild(
      button
    );

    updateFold(
      target.id,
      open
    );
  }

  function updateFold(
    id,
    open
  ) {
    const target =
      document.getElementById(
        id
      );

    if (!target) return;

    target.dataset
      .homeFoldOpen =
      open
        ? '1'
        : '0';

    target.classList.toggle(
      'home-fold-hidden',
      !open
    );

    const button =
      document.querySelector(
        `[data-fold-target="${id}"]`
      );

    if (button) {
      button.textContent =
        open
          ? '閉じる'
          : '開く';
    }
  }

  function ensureFolds() {
    const dataBox =
      document.querySelector(
        '#home .backup-box'
      );

    if (
      dataBox &&
      !dataBox.id
    ) {
      dataBox.id =
        'homeDataManagement';
    }

    setupFold(
      document.getElementById(
        'homeCalendar'
      ),
      false
    );

    setupFold(
      document.getElementById(
        'homeDayBookings'
      ),
      false
    );

    setupFold(
      document.getElementById(
        'homeDataManagement'
      ),
      false
    );

    setupFold(
      document.getElementById(
        'futureMonths'
      ),
      false
    );
  }

  window.toggleHomeFold =
    function (id) {
      const target =
        document.getElementById(
          id
        );

      if (!target) return;

      const open =
        target.dataset
          .homeFoldOpen !==
        '1';

      updateFold(
        id,
        open
      );
    };

  window.toggleMonthlyDetails =
    function () {
      monthlyDetailsOpen =
        !monthlyDetailsOpen;

      applyMonthlyDetailState();

      renderHomeDashboard();
    };

  window.openTodayHomeBookings =
    function () {
      const now =
        new Date();

      homeMonth =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1
        );

      homeSelectedDate =
        todayISO;

      renderHome();

      updateFold(
        'homeDayBookings',
        true
      );

      const target =
        document.getElementById(
          'homeDayBookings'
        );

      target?.previousElementSibling
        ?.scrollIntoView({
          behavior:'smooth',
          block:'start'
        });
    };

  window.openHomeFollowups =
    function () {
      const target =
        document.getElementById(
          'followupQueue'
        );

      target?.previousElementSibling
        ?.scrollIntoView({
          behavior:'smooth',
          block:'start'
        });
    };

  window.openHomeReturnManager =
    function () {
      const month =
        typeof homeMonth !==
        'undefined'
          ? monthString(
              homeMonth
            )
          : monthKey(
              todayISO
            );

      if (
        typeof openReturnManager ===
        'function'
      ) {
        openReturnManager(
          month
        );
      }
    };

  function renderHomeDashboard() {
    ensureStyle();
    ensureDashboard();
    ensureFolds();
    applyMonthlyDetailState();

    const host =
      document.getElementById(
        'homeOpsDashboard'
      );

    if (!host) return;

    const s =
      quickStats();

    const pct =
      s.goal
        ? Math.min(
            100,
            Math.round(
              s.forecast /
                s.goal *
                100
            )
          )
        : 0;

    const monthNumber =
      Number(
        s.m.slice(5)
      );

    host.innerHTML = `
      <div class="home-ops-head">
        <div>
          <b>今日やること</b>
          <div
            class="small"
            style="margin-top:2px"
          >
            ${monthNumber}月の状況
          </div>
        </div>

        <button
          class="ghost"
          onclick="
            toggleMonthlyDetails()
          "
        >
          ${
            monthlyDetailsOpen
              ? '月詳細を閉じる'
              : '月詳細'
          }
        </button>
      </div>

      <div class="home-ops-grid">
        <div
          class="home-ops-card"
          onclick="
            openTodayHomeBookings()
          "
        >
          <div class="l">
            今日の予約
          </div>

          <div class="v">
            ${s.todayNormal}人
          </div>

          <div class="s">
            ${
              s.todayModels
                ? `モデル ${s.todayModels}人`
                : '通常客'
            }
          </div>
        </div>

        <div class="home-ops-card">
          <div class="l">
            今日の見込み
          </div>

          <div class="v">
            ${yen(
              s.todayRevenue
            )}
          </div>

          <div class="s">
            通常客のみ
          </div>
        </div>

        <div class="home-ops-card">
          <div class="l">
            目標まで
          </div>

          <div class="v">
            ${
              s.gap
                ? yen(s.gap)
                : '達成'
            }
          </div>

          <div class="s">
            見込み込み
          </div>
        </div>

        <div class="home-ops-card">
          <div class="l">
            必要な追加予約
          </div>

          <div class="v">
            ${
              s.gap === 0
                ? '0人'
                : s.need === null
                  ? '—'
                  : `${s.need}人`
            }
          </div>

          <div class="s">
            現在の計算設定
          </div>
        </div>

        <div
          class="
            home-ops-card
            ${
              s.followups
                ? 'attention'
                : ''
            }
          "
          onclick="
            openHomeFollowups()
          "
        >
          <div class="l">
            フォロー
          </div>

          <div class="v">
            ${s.followups}件
          </div>

          <div class="s">
            当日・1週前・2日前
          </div>
        </div>

        <div
          class="
            home-ops-card
            ${
              s.returnDue
                ? 'attention'
                : ''
            }
          "
          onclick="
            openHomeReturnManager()
          "
        >
          <div class="l">
            再来要対応
          </div>

          <div class="v">
            ${s.returnDue}件
          </div>

          <div class="s">
            45日 ${s.reminders}
            ・
            キャンセル後 ${s.recovery}
          </div>
        </div>
      </div>

      <div class="home-ops-progress">
        <i
          style="
            width:${pct}%
          "
        ></i>
      </div>

      <div
        class="small"
        style="margin-top:5px"
      >
        今月見込み
        ${yen(s.forecast)}
        /
        目標
        ${yen(s.goal)}
        ・
        ${pct}%
      </div>

      <div class="home-ops-actions">
        <button
          class="ghost"
          onclick="
            openTodayHomeBookings()
          "
        >
          今日の予約
        </button>

        <button
          class="ghost"
          onclick="
            openHomeFollowups()
          "
        >
          フォロー
        </button>

        <button
          class="ghost"
          onclick="
            openHomeReturnManager()
          "
        >
          再来管理
        </button>
      </div>
    `;
  }

  const oldRenderHome =
    renderHome;

  renderHome =
    function () {
      oldRenderHome();
      renderHomeDashboard();
    };

  renderHomeDashboard();
})();
