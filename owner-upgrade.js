(() => {
  const MONTHLY_LINE_API =
    'https://salon-manager-kzgvsz7r97-star.vercel.app/api/monthly-line';

  db.auditLog ||= [];
  db.monthlyLineSettings ||= { enabled: true };

  function customerByName(name) {
    const n = normalizeName(name);
    if (!n) return null;

    return (db.customers || []).find(
      c => normalizeName(c.name) === n
    ) || null;
  }

  function customerByRef(id, name) {
    if (id) {
      const c = (db.customers || []).find(
        x => String(x.id) === String(id)
      );

      if (c) return c;
    }

    return customerByName(name);
  }

  function migrateCustomerLinks() {
    let changed = false;

    (db.customers || []).forEach(c => {
      if (!c.id) {
        c.id = uid();
        changed = true;
      }
    });

    [db.bookings, db.sales, db.retail]
      .filter(Array.isArray)
      .forEach(list => {
        list.forEach(row => {
          if (!row.customer) return;

          const current =
            row.customerId
              ? (db.customers || []).find(
                  c =>
                    String(c.id) ===
                    String(row.customerId)
                )
              : null;

          if (current) return;

          const c = customerByName(row.customer);

          if (c) {
            row.customerId = c.id;
            changed = true;
          }
        });
      });

    if (changed) {
      localStorage.setItem(
        KEY,
        JSON.stringify(db)
      );
    }

    return changed;
  }

  function rowBelongsToCustomer(row, customer) {
    if (!row || !customer) return false;

    if (row.customerId) {
      return (
        String(row.customerId) ===
        String(customer.id)
      );
    }

    return (
      normalizeName(row.customer) ===
      normalizeName(customer.name)
    );
  }

  function logAudit(action, detail = '') {
    db.auditLog ||= [];

    db.auditLog.unshift({
      id: uid(),
      at: new Date().toISOString(),
      action: String(action || ''),
      detail: String(detail || '')
    });

    db.auditLog =
      db.auditLog.slice(0, 200);
  }

  migrateCustomerLinks();

  const originalSave = save;

  save = function () {
    migrateCustomerLinks();
    originalSave();
  };

  customerForBooking = function (b) {
    return customerByRef(
      b?.customerId,
      b?.customer
    );
  };

  customerBookingsByName = function (name) {
    const customer = customerByName(name);
    const n = normalizeName(name);

    return (db.bookings || []).filter(b => {
      if (customer && b.customerId) {
        return (
          String(b.customerId) ===
          String(customer.id)
        );
      }

      return (
        normalizeName(b.customer) === n
      );
    });
  };

  hasLaterBooking = function (name, afterDate) {
    const customer = customerByName(name);
    const n = normalizeName(name);

    return activeBookings().some(b => {
      const same =
        customer && b.customerId
          ? String(b.customerId) ===
            String(customer.id)
          : normalizeName(b.customer) === n;

      return same && b.date > afterDate;
    });
  };

  hasFutureBooking = function (name) {
    const customer = customerByName(name);
    const n = normalizeName(name);

    return activeBookings().some(b => {
      const same =
        customer && b.customerId
          ? String(b.customerId) ===
            String(customer.id)
          : normalizeName(b.customer) === n;

      return same && b.date >= todayISO;
    });
  };

  futureBookingAfter = function (
    name,
    afterDate
  ) {
    const customer = customerByName(name);
    const n = normalizeName(name);

    return (
      activeBookings()
        .filter(b => {
          const same =
            customer && b.customerId
              ? String(b.customerId) ===
                String(customer.id)
              : normalizeName(b.customer) === n;

          return same && b.date > afterDate;
        })
        .sort((a, b) =>
          (a.date + a.time).localeCompare(
            b.date + b.time
          )
        )[0] || null
    );
  };

  const originalSaveBooking = saveBooking;

  saveBooking = function (id) {
    const before =
      JSON.stringify(db.bookings || []);

    originalSaveBooking(id);

    if (
      JSON.stringify(db.bookings || []) !==
      before
    ) {
      logAudit(
        id ? '予約更新' : '予約追加',
        id || ''
      );
      save();
    }
  };

  const originalSaveCustomer = saveCustomer;

  saveCustomer = function (id) {
    const oldCustomer =
      id
        ? (db.customers || []).find(
            c =>
              String(c.id) === String(id)
          )
        : null;

    const oldName =
      oldCustomer?.name || '';

    const beforeCount =
      (db.customers || []).length;

    originalSaveCustomer(id);

    const current =
      id
        ? (db.customers || []).find(
            c =>
              String(c.id) === String(id)
          )
        : null;

    if (
      current &&
      oldName &&
      normalizeName(oldName) !==
        normalizeName(current.name)
    ) {
      [db.bookings, db.sales, db.retail]
        .filter(Array.isArray)
        .forEach(list => {
          list.forEach(row => {
            const same =
              String(row.customerId || '') ===
                String(id) ||
              (
                !row.customerId &&
                normalizeName(row.customer) ===
                  normalizeName(oldName)
              );

            if (same) {
              row.customer =
                current.name;
              row.customerId =
                current.id;
            }
          });
        });
    }

    const changed =
      (db.customers || []).length !==
        beforeCount ||
      (
        current &&
        oldCustomer &&
        JSON.stringify(current) !==
          JSON.stringify(oldCustomer)
      );

    if (changed) {
      logAudit(
        id ? '顧客更新' : '顧客追加',
        current?.name ||
          oldName ||
          ''
      );
      save();
    }
  };

  const originalMergeCustomers =
    mergeCustomers;

  mergeCustomers = function (
    keepId,
    removeId
  ) {
    const keepBefore =
      (db.customers || []).find(
        c =>
          String(c.id) ===
          String(keepId)
      );

    const removeBefore =
      (db.customers || []).find(
        c =>
          String(c.id) ===
          String(removeId)
      );

    originalMergeCustomers(
      keepId,
      removeId
    );

    const keep =
      (db.customers || []).find(
        c =>
          String(c.id) ===
          String(keepId)
      );

    const removedStillExists =
      (db.customers || []).some(
        c =>
          String(c.id) ===
          String(removeId)
      );

    if (
      !keep ||
      removedStillExists ||
      !removeBefore
    ) {
      return;
    }

    [db.bookings, db.sales, db.retail]
      .filter(Array.isArray)
      .forEach(list => {
        list.forEach(row => {
          const same =
            String(row.customerId || '') ===
              String(removeId) ||
            (
              !row.customerId &&
              normalizeName(row.customer) ===
                normalizeName(
                  removeBefore.name
                )
            );

          if (same) {
            row.customerId = keep.id;
            row.customer = keep.name;
          }
        });
      });

    logAudit(
      '顧客統合',
      `${removeBefore.name} → ${keep.name}`
    );

    save();
  };

  const originalSaveSale = saveSale;

  saveSale = function () {
    const before =
      (db.sales || []).length;

    originalSaveSale();

    if ((db.sales || []).length > before) {
      const row =
        db.sales[db.sales.length - 1];

      logAudit(
        '追加売上',
        `${row.customer || ''} ${yen(
          row.amount
        )}`
      );

      save();
    }
  };

  const originalSaveRetail = saveRetail;

  saveRetail = function () {
    const before =
      (db.retail || []).length;

    originalSaveRetail();

    if (
      (db.retail || []).length > before
    ) {
      const row =
        db.retail[db.retail.length - 1];

      const product =
        (db.products || []).find(
          p =>
            String(p.id) ===
            String(row.productId)
        );

      row.cost =
        Number(product?.cost || 0) *
        Number(row.quantity || 1);

      logAudit(
        '店販',
        `${row.product || ''} ${yen(
          row.amount
        )}`
      );

      save();
    }
  };

  const originalSaveProduct =
    saveProduct;

  saveProduct = function (i) {
    const before =
      JSON.stringify(db.products || []);

    originalSaveProduct(i);

    if (
      JSON.stringify(db.products || []) !==
      before
    ) {
      const p =
        i >= 0
          ? db.products[i]
          : db.products[
              db.products.length - 1
            ];

      logAudit(
        i >= 0
          ? '商品更新'
          : '商品追加',
        p?.name || ''
      );

      save();
    }
  };

  const originalFinalizeDelete =
    finalizePendingDelete;

  finalizePendingDelete = function () {
    const pending =
      pendingUndoDelete
        ? {
            kind:
              pendingUndoDelete.kind,
            item:
              pendingUndoDelete.item
          }
        : null;

    originalFinalizeDelete();

    if (pending) {
      const label =
        pending.item?.name ||
        pending.item?.customer ||
        pending.item?.product ||
        pending.item?.id ||
        '';

      logAudit(
        '削除',
        `${pending.kind} / ${label}`
      );

      save();
    }
  };

  renderRetailSummary = function () {
    const rows = db.retail || [];

    const qty =
      rows.reduce(
        (a, r) =>
          a +
          Number(r.quantity || 1),
        0
      );

    const sales =
      rows.reduce(
        (a, r) =>
          a +
          Number(r.amount || 0),
        0
      );

    const cost =
      rows.reduce((a, r) => {
        if (
          r.cost !== undefined &&
          r.cost !== null
        ) {
          return (
            a +
            Number(r.cost || 0)
          );
        }

        const p =
          (db.products || []).find(
            x =>
              String(x.id) ===
              String(r.productId)
          );

        return (
          a +
          Number(p?.cost || 0) *
            Number(
              r.quantity || 1
            )
        );
      }, 0);

    const profit =
      sales - cost;

    const active =
      (db.products || []).filter(
        p => p.public
      ).length;

    $('retailSummary').innerHTML = `
      <b>店販まとめ（全期間）</b>
      <div class="small" style="margin-top:7px">
        掲載商品 ${active}件 ／
        販売 ${qty}点 ／
        売上 ${yen(sales)} ／
        利益 ${yen(profit)}
      </div>
    `;
  };

  function csvCell(value) {
    const s =
      String(value ?? '');

    return (
      '"' +
      s.replace(/"/g, '""') +
      '"'
    );
  }

  window.exportSalonCSV = function () {
    const rows = [
      [
        '種類',
        '日付',
        '顧客名',
        '顧客ID',
        '金額',
        '内容',
        '媒体',
        '担当',
        '補足'
      ]
    ];

    (db.customers || []).forEach(c => {
      rows.push([
        '顧客',
        c.lastVisit || '',
        c.name || '',
        c.id || '',
        '',
        [
          c.kana || '',
          c.instagram || '',
          c.note || ''
        ]
          .filter(Boolean)
          .join(' / '),
        '',
        '',
        c.lineUserId || ''
      ]);
    });

    (db.bookings || []).forEach(b => {
      rows.push([
        '予約',
        b.date || '',
        b.customer || '',
        b.customerId || '',
        Number(b.price || 0),
        `${b.time || ''} ${
          b.menu || ''
        }`,
        b.source || '',
        staffName(b.staffId),
        [
          statusLabel(b),
          b.newGuest
            ? '新規'
            : '再来',
          b.paymentComplete
            ? '決済済'
            : '',
          b.isModel
            ? 'モデル'
            : ''
        ]
          .filter(Boolean)
          .join(' / ')
      ]);
    });

    (db.sales || []).forEach(s => {
      rows.push([
        '追加売上',
        s.date || '',
        s.customer || '',
        s.customerId || '',
        Number(s.amount || 0),
        s.menu || '',
        '',
        '',
        ''
      ]);
    });

    (db.retail || []).forEach(r => {
      const p =
        (db.products || []).find(
          x =>
            String(x.id) ===
            String(r.productId)
        );

      const cost =
        r.cost !== undefined
          ? Number(r.cost || 0)
          : Number(p?.cost || 0) *
            Number(
              r.quantity || 1
            );

      rows.push([
        '店販',
        r.date || '',
        r.customer || '',
        r.customerId || '',
        Number(r.amount || 0),
        r.product || '',
        r.source || '',
        staffName(r.staffId),
        `数量 ${
          r.quantity || 1
        } / 利益 ${Number(
          r.amount || 0
        ) - cost}`
      ]);
    });

    const csv =
      '\ufeff' +
      rows
        .map(row =>
          row.map(csvCell).join(',')
        )
        .join('\n');

    const blob =
      new Blob(
        [csv],
        {
          type:
            'text/csv;charset=utf-8'
        }
      );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement('a');

    a.href = url;
    a.download =
      `salon-manager-${todayISO}.csv`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(
      () =>
        URL.revokeObjectURL(url),
      1500
    );

    logAudit(
      'CSV出力',
      todayISO
    );

    save();
  };

  window.openAuditLog = function () {
    const rows =
      (db.auditLog || [])
        .slice(0, 100);

    modal(`
      <h3>操作履歴</h3>

      <div class="small" style="margin-bottom:10px">
        最新100件を表示しています。
      </div>

      ${
        rows.length
          ? rows
              .map(x => {
                const d =
                  new Date(x.at);

                const date =
                  Number.isNaN(
                    d.getTime()
                  )
                    ? x.at
                    : d.toLocaleString(
                        'ja-JP'
                      );

                return `
                  <div class="item">
                    <div class="t">
                      ${esc(x.action)}
                    </div>
                    <div class="s">
                      ${esc(date)}
                      ${
                        x.detail
                          ? `<br>${esc(
                              x.detail
                            )}`
                          : ''
                      }
                    </div>
                  </div>
                `;
              })
              .join('')
          : '<div class="empty">まだ履歴はありません</div>'
      }

      <div class="actions">
        <button
          class="ghost"
          onclick="closeModal()"
        >
          閉じる
        </button>
      </div>
    `);
  };

  async function loadMonthlyLinePreview(month) {
  const key = getCloudBackupKey();
  const status = $('monthlyLineStatus');
  const preview = $('monthlyLinePreview');

  month =
    Number(month) ||
    Number($('monthlyLineMonth')?.value) ||
    1;

  if (!key) {
    if (status) {
      status.textContent =
        'クラウド同期キーが必要です';
    }
    return;
  }

  if (status) {
    status.textContent = '確認中…';
  }

  try {
    const r = await fetch(
      MONTHLY_LINE_API +
        `?preview=1&month=${month}`,
      {
        headers: {
          'X-Backup-Key': key
        }
      }
    );

    const body =
      await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(
        body.error ||
          '取得できませんでした'
      );
    }

    if (preview) {
      preview.value =
        body.message || '';
    }

    if ($('monthlyLineEnabled')) {
      $('monthlyLineEnabled').checked =
        body.enabled !== false;
    }

    const last = body.lastStatus;

    const templateText =
      body.custom
        ? '編集した文面を使用中'
        : '季節テンプレを使用中';

    if (status) {
      status.textContent =
        last?.sentAt
          ? `${templateText} ／ 前回：${new Date(
              last.sentAt
            ).toLocaleString('ja-JP')} ／ ${
              last.ok
                ? '送信受付済み'
                : '送信失敗'
            }`
          : `${templateText} ／ まだ自動配信履歴はありません`;
    }
  } catch (e) {
    if (status) {
      status.textContent =
        e.message;
    }
  }
}

window.changeMonthlyLineMonth =
  function () {
    loadMonthlyLinePreview(
      Number(
        $('monthlyLineMonth')
          ?.value
      )
    );
  };

window.openMonthlyLineSettings =
  async function () {
    const now = new Date();

    const nextMonth =
      ((now.getMonth() + 1) % 12) +
      1;

    const enabled =
      db.monthlyLineSettings
        ?.enabled !== false;

    const monthOptions =
      Array.from(
        { length: 12 },
        (_, i) => i + 1
      )
        .map(
          m => `
            <option
              value="${m}"
              ${
                m === nextMonth
                  ? 'selected'
                  : ''
              }
            >
              ${m}月
            </option>
          `
        )
        .join('');

    modal(`
      <h3>月初LINE</h3>

      <div
        class="note"
        style="margin-bottom:10px"
      >
        毎月1日10時ごろに、
        女性・15〜29歳・友だち追加365日未満へ配信します。
        <br>
        文面は月ごとに編集できます。
      </div>

      <label>
        <input
          id="monthlyLineEnabled"
          type="checkbox"
          style="width:auto"
          ${
            enabled
              ? 'checked'
              : ''
          }
        >
        月初LINEを自動配信する
      </label>

      <label>編集する月</label>

      <select
        id="monthlyLineMonth"
        onchange="changeMonthlyLineMonth()"
      >
        ${monthOptions}
      </select>

      <label>配信文面</label>

      <textarea
        id="monthlyLinePreview"
        style="min-height:260px"
      >読み込み中…</textarea>

      <div
        class="small"
        style="margin-top:5px"
      >
        この文章がそのまま配信されます。
      </div>

      <div
        id="monthlyLineStatus"
        class="small"
        style="margin-top:8px"
      >
        確認中…
      </div>

      <button
        class="soft"
        style="width:100%;margin-top:10px"
        onclick="testMonthlyLine()"
      >
        自分だけにテスト送信
      </button>

      <button
        class="ghost"
        style="width:100%;margin-top:8px"
        onclick="resetMonthlyLineTemplate()"
      >
        季節テンプレに戻す
      </button>

      <div class="actions">
        <button
          class="ghost"
          onclick="closeModal()"
        >
          閉じる
        </button>

        <button
          onclick="saveMonthlyLineSettings()"
        >
          文面を保存
        </button>
      </div>
    `);

    await loadMonthlyLinePreview(
      nextMonth
    );
  };

window.saveMonthlyLineSettings =
  async function () {
    const key =
      getCloudBackupKey();

    if (!key) return;

    const month =
      Number(
        $('monthlyLineMonth')
          ?.value
      );

    const message =
      String(
        $('monthlyLinePreview')
          ?.value || ''
      ).trim();

    const enabled =
      !!$('monthlyLineEnabled')
        ?.checked;

    const status =
      $('monthlyLineStatus');

    if (!message) {
      return alert(
        '配信文面を入力してください'
      );
    }

    if (message.length > 5000) {
      return alert(
        '文面が長すぎます'
      );
    }

    if (status) {
      status.textContent =
        '保存中…';
    }

    db.monthlyLineSettings ||= {};
    db.monthlyLineSettings.messages ||= {};

    db.monthlyLineSettings.enabled =
      enabled;

    db.monthlyLineSettings.messages[
      String(month)
    ] = message;

    logAudit(
      '月初LINE文面',
      `${month}月の文面を保存`
    );

    save();

    try {
      await postCloudSnapshot(
        key,
        db
      );

      writeSyncBase(db);
      cloudDirty = false;

      if (status) {
        status.textContent =
          `${month}月の文面を保存しました`;
      }
    } catch (e) {
      if (status) {
        status.textContent =
          '端末には保存しましたが、クラウド保存に失敗しました';
      }
    }
  };

window.resetMonthlyLineTemplate =
  async function () {
    const key =
      getCloudBackupKey();

    if (!key) return;

    const month =
      Number(
        $('monthlyLineMonth')
          ?.value
      );

    if (
      !confirm(
        `${month}月の文面を季節テンプレに戻しますか？`
      )
    ) {
      return;
    }

    db.monthlyLineSettings ||= {};
    db.monthlyLineSettings.messages ||= {};

    delete db.monthlyLineSettings
      .messages[String(month)];

    logAudit(
      '月初LINE文面',
      `${month}月をテンプレに戻しました`
    );

    save();

    try {
      await postCloudSnapshot(
        key,
        db
      );

      writeSyncBase(db);
      cloudDirty = false;

      await loadMonthlyLinePreview(
        month
      );
    } catch (e) {
      const status =
        $('monthlyLineStatus');

      if (status) {
        status.textContent =
          'テンプレへの復元保存に失敗しました';
      }
    }
  };

window.testMonthlyLine =
  async function () {
    const key =
      getCloudBackupKey();

    if (!key) return;

    const month =
      Number(
        $('monthlyLineMonth')
          ?.value
      );

    const message =
      String(
        $('monthlyLinePreview')
          ?.value || ''
      ).trim();

    const status =
      $('monthlyLineStatus');

    if (!message) {
      return alert(
        '配信文面を入力してください'
      );
    }

    if (status) {
      status.textContent =
        'テスト送信中…';
    }

    try {
      const r =
        await fetch(
          MONTHLY_LINE_API,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              'X-Backup-Key':
                key
            },
            body:
              JSON.stringify({
                action: 'test',
                month,
                message
              })
          }
        );

      const body =
        await r
          .json()
          .catch(() => ({}));

      if (!r.ok) {
        throw new Error(
          body.error ||
            'テスト送信できませんでした'
        );
      }

      if (status) {
        status.textContent =
          '自分のLINEへテスト送信しました';
      }

      logAudit(
        '月初LINE',
        `${month}月をテスト送信`
      );

      save();
    } catch (e) {
      if (status) {
        status.textContent =
          e.message;
      }
    }
  };

  function addUpgradeButtons() {
    if (
      document.getElementById(
        'ownerUpgradeTools'
      )
    ) {
      return;
    }

    const staffButton =
      document.querySelector(
        'button[onclick="openStaffSettings()"]'
      );

    if (!staffButton) return;

    staffButton.insertAdjacentHTML(
      'afterend',
      `
        <div id="ownerUpgradeTools">
          <button
            class="soft"
            style="width:100%;margin-top:8px"
            onclick="openMonthlyLineSettings()"
          >
            月初LINE設定
          </button>

          <div class="backup-actions">
            <button
              class="soft"
              onclick="exportSalonCSV()"
            >
              CSV出力
            </button>

            <button
              class="soft"
              onclick="openAuditLog()"
            >
              操作履歴
            </button>
          </div>
        </div>
      `
    );
  }

  addUpgradeButtons();

  if (migrateCustomerLinks()) {
    save();
  }

  renderRetailSummary();
})();
