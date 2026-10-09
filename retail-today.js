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


// 2026-10-10: return reminder + retail duplicate hotfix
(() => {
  if (window.__salonFineFix20261010) return;
  window.__salonFineFix20261010 = true;

  reminderCandidates = function () {
    const now = todayISO;

    return (db.customers || [])
      .map(c => {
        const own = customerBookingsByName(c.name);

        const past = own
          .filter(
            b =>
              b.date <= now &&
              isVisitedBooking(b)
          )
          .sort(
            (a, b) =>
              b.date.localeCompare(a.date)
          );

        const lastFromBookings =
          past[0]?.date || '';

        const last =
          [
            c.lastVisit || '',
            lastFromBookings
          ]
            .sort()
            .pop();

        if (!last) return null;

        const days =
          daysBetween(last, now);

        if (days < 45) return null;
        if (hasFutureBooking(c.name)) return null;

        if (
          c.returnReminderHandledVisit &&
          c.returnReminderHandledVisit >= last
        ) {
          return null;
        }

        const legacySnooze =
          c.reminderSnoozeUntil || '';

        if (
          legacySnooze &&
          legacySnooze > now
        ) {
          return null;
        }

        return {
          ...c,
          lastComputed: last,
          days
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.days - a.days
      );
  };

  snoozeReminder = function (id) {
    const c =
      (db.customers || [])
        .find(
          x =>
            String(x.id) ===
            String(id)
        );

    if (!c) return;

    const own =
      customerBookingsByName(c.name);

    const past =
      own
        .filter(
          b =>
            b.date <= todayISO &&
            isVisitedBooking(b)
        )
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date)
        );

    const lastFromBookings =
      past[0]?.date || '';

    const last =
      [
        c.lastVisit || '',
        lastFromBookings
      ]
        .sort()
        .pop();

    if (!last) return;

    c.returnReminderHandledVisit =
      last;

    c.returnReminderHandledAt =
      new Date().toISOString();

    c.returnContactCount =
      Number(
        c.returnContactCount || 0
      ) + 1;

    c.reminderSnoozeUntil = '';

    save();
  };

  function productNameKey(name) {
    return String(name || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s　・･]/g, '');
  }

  function productGroupKey(p) {
    const key =
      productNameKey(p?.name);

    if (
      key.startsWith(
        'リケラエマルジョン'
      )
    ) {
      return 'seed:rikera-emulsion';
    }

    if (
      key.startsWith(
        'オルキデヘアミルク'
      )
    ) {
      return 'seed:orchidee-hair-milk';
    }

    if (
      key.startsWith(
        'hitaオイル'
      )
    ) {
      return 'seed:hita-oil';
    }

    return `name:${key}`;
  }

  function productScore(p = {}) {
    let n = 0;

    if (Number(p.price || 0) > 0) n += 8;
    if (Number(p.cost || 0) > 0) n += 4;
    if (p.imageData) n += 10;
    if (p.description) n += 6;
    if (p.recommended) n += 3;
    if (p.usage) n += 3;
    if (p.officialUrl) n += 3;
    if (p.supplierUrl || p.externalUrl) n += 3;
    if (p.public) n += 2;

    if (
      /\d+\s*(ml|g)\b/i.test(
        String(p.name || '')
      )
    ) {
      n += 2;
    }

    return n;
  }

  function bestText(values) {
    return values
      .map(v => String(v || ''))
      .sort(
        (a, b) =>
          b.length - a.length
      )[0] || '';
  }

  function dedupeProductList(
    products,
    retailRows
  ) {
    const groups =
      new Map();

    (products || [])
      .filter(Boolean)
      .forEach((p, index) => {
        const key =
          productGroupKey(p) ||
          `unnamed:${p.id || index}`;

        if (!groups.has(key)) {
          groups.set(key, []);
        }

        groups.get(key).push(p);
      });

    const idMap =
      new Map();

    const out = [];

    groups.forEach(group => {
      const sorted =
        [...group].sort(
          (a, b) =>
            productScore(b) -
            productScore(a)
        );

      const best =
        structuredClone(
          sorted[0]
        );

      const ids =
        group
          .map(p => p.id)
          .filter(Boolean)
          .map(String);

      const numericSort =
        group
          .map(p => Number(p.sortOrder))
          .filter(Number.isFinite);

      best.id =
        best.id || uid();

      best.price =
        Number(best.price || 0) > 0
          ? Number(best.price)
          : Math.max(
              0,
              ...group.map(
                p =>
                  Number(p.price || 0)
              )
            );

      best.cost =
        Number(best.cost || 0) > 0
          ? Number(best.cost)
          : Math.max(
              0,
              ...group.map(
                p =>
                  Number(p.cost || 0)
              )
            );

      best.imageData =
        best.imageData ||
        group
          .map(p => p.imageData || '')
          .find(Boolean) ||
        '';

      best.description =
        bestText(
          group.map(
            p => p.description
          )
        );

      best.recommended =
        bestText(
          group.map(
            p => p.recommended
          )
        );

      best.usage =
        bestText(
          group.map(
            p => p.usage
          )
        );

      best.officialUrl =
        best.officialUrl ||
        group
          .map(p => p.officialUrl || '')
          .find(Boolean) ||
        '';

      best.supplierUrl =
        best.supplierUrl ||
        best.externalUrl ||
        group
          .map(
            p =>
              p.supplierUrl ||
              p.externalUrl ||
              ''
          )
          .find(Boolean) ||
        '';

      best.public =
        group.some(
          p => !!p.public
        );

      best.sortOrder =
        numericSort.length
          ? Math.min(...numericSort)
          : out.length;

      ids.forEach(
        oldId =>
          idMap.set(
            oldId,
            String(best.id)
          )
      );

      out.push(best);
    });

    out.sort(
      (a, b) =>
        Number(a.sortOrder || 0) -
        Number(b.sortOrder || 0)
    );

    out.forEach(
      (p, i) =>
        p.sortOrder = i
    );

    if (Array.isArray(retailRows)) {
      retailRows.forEach(row => {
        if (!row?.productId) return;

        const next =
          idMap.get(
            String(row.productId)
          );

        if (next) {
          row.productId = next;
        }
      });
    }

    return {
      products: out,
      idMap
    };
  }

  function cleanCurrentProducts() {
    const before =
      JSON.stringify(
        db.products || []
      );

    const result =
      dedupeProductList(
        db.products || [],
        db.retail || []
      );

    db.products =
      result.products;

    const changed =
      before !==
      JSON.stringify(
        db.products || []
      );

    if (changed) {
      localStorage.setItem(
        KEY,
        JSON.stringify(db)
      );

      cloudDirty = true;

      if (
        typeof scheduleCloudBackup ===
        'function'
      ) {
        scheduleCloudBackup();
      }
    }

    return changed;
  }

  const baseMergeDbSafe =
    mergeDbSafe;

  mergeDbSafe = function (
    localData,
    remoteData,
    baseData
  ) {
    const merged =
      baseMergeDbSafe(
        localData,
        remoteData,
        baseData
      );

    const result =
      dedupeProductList(
        merged.products || [],
        merged.retail || []
      );

    merged.products =
      result.products;

    return merged;
  };

  const baseMigrateExtras =
    migrateExtras;

  migrateExtras = function () {
    baseMigrateExtras();

    const result =
      dedupeProductList(
        db.products || [],
        db.retail || []
      );

    db.products =
      result.products;
  };

  const changed =
    cleanCurrentProducts();

  if (
    typeof renderAll ===
    'function'
  ) {
    renderAll();
  }

  if (
    changed &&
    typeof renderRetail ===
    'function'
  ) {
    renderRetail();
  }
})();
