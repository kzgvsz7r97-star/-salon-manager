(() => {
  if (window.__retailTodayV1) return;
  window.__retailTodayV1 = true;

  function orderDeadlineISO(order) {
    const d = dateOnly(order?.visit_date);
    if (!d) return '';
    d.setDate(d.getDate() - 7);
    return localISO(d);
  }

  function retailTodayStats() {
    const orders = Array.isArray(remoteOrders) ? remoteOrders : [];

    const newCount = orders.filter(
      o => o.status === 'new'
    ).length;

    const dueCount = orders.filter(o => {
      if (o.status !== 'new') return false;
      const deadline = orderDeadlineISO(o);
      return !!deadline && deadline <= todayISO;
    }).length;

    const pickupToday = orders.filter(
      o =>
        ['ordered', 'ready'].includes(o.status) &&
        o.visit_date === todayISO
    ).length;

    return {
      newCount,
      dueCount,
      pickupToday,
      totalAttention:
        newCount + dueCount + pickupToday
    };
  }

  function ensureStyle() {
    if (document.getElementById('retailTodayStyle')) return;

    const style = document.createElement('style');
    style.id = 'retailTodayStyle';

    style.textContent = `
      .retail-today-row{
        margin-top:8px;
        padding:9px 10px;
        border:1px solid #e7e3dc;
        border-radius:11px;
        background:#fff;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        cursor:pointer;
      }

      .retail-today-main{
        min-width:0;
        font-size:11px;
        line-height:1.45;
      }

      .retail-today-main b{
        font-size:12px;
      }

      .retail-today-arrow{
        flex:none;
        font-size:14px;
        color:#777;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureHost() {
    const dashboard =
      document.getElementById('homeOpsDashboard');

    if (!dashboard) return null;

    let host =
      document.getElementById('retailTodayRow');

    if (!host) {
      host = document.createElement('div');
      host.id = 'retailTodayRow';
      host.className = 'retail-today-row';
      host.onclick = openRetailToday;
      dashboard.appendChild(host);
    }

    return host;
  }

  function renderRetailToday() {
    ensureStyle();

    const host = ensureHost();
    if (!host) return;

    const s = retailTodayStats();

    if (!s.totalAttention) {
      host.style.display = 'none';
      return;
    }

    host.style.display = 'flex';

    host.innerHTML = `
      <div class="retail-today-main">
        <b>店販対応</b>　
        未対応 ${s.newCount}
        ｜ 発注期限 ${s.dueCount}
        ｜ 今日受取 ${s.pickupToday}
      </div>
      <div class="retail-today-arrow">›</div>
    `;
  }

  window.openRetailToday = function () {
    const btn =
      document.querySelector(
        '.nav button[data-tab="retail"]'
      );

    if (!btn) return;

    go('retail', btn);

    const filter =
      document.getElementById('orderFilterStatus');

    if (filter) {
      filter.value = 'active';
    }

    renderOrders();

    setTimeout(() => {
      document.getElementById('orderSummary')
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
    }, 50);
  };

  const oldRenderHome = renderHome;
  renderHome = function () {
    oldRenderHome();
    renderRetailToday();
  };

  const oldRenderOrders = renderOrders;
  renderOrders = function () {
    const result = oldRenderOrders();
    renderRetailToday();
    return result;
  };

  renderRetailToday();
})();
