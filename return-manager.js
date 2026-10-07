(() => {
  if (window.__returnManagerAccuracyV2) return;
  window.__returnManagerAccuracyV2 = true;

  let rmMonth = monthKey(todayISO);
  let rmFilter = 'all';

  const MATURITY_DAYS = 45;
  const KNOWN_SOURCES = [
    'SHAiRE',
    'Nailie',
    'minimo',
    'Instagram',
    'その他'
  ];

  const stamp = b =>
    `${b?.date || ''} ${b?.time || ''}`;

  const keyOf = b =>
    b?.customerId
      ? `id:${String(b.customerId)}`
      : `name:${normalizeName(
          b?.customer || ''
        )}`;

  function sameCustomer(a, b) {
    if (!a || !b) return false;

    if (
      a.customerId &&
      b.customerId
    ) {
      return (
        String(a.customerId) ===
        String(b.customerId)
      );
    }

    return (
      normalizeName(
        a.customer || ''
      ) ===
      normalizeName(
        b.customer || ''
      )
    );
  }

  function customerOf(b) {
    if (!b) return null;

    if (b.customerId) {
      const c =
        (db.customers || []).find(
          x =>
            String(x.id) ===
            String(b.customerId)
        );

      if (c) return c;
    }

    const n =
      normalizeName(
        b.customer || ''
      );

    return (
      (db.customers || []).find(
        x =>
          normalizeName(
            x.name || ''
          ) === n
      ) || null
    );
  }

  function visitedBefore(first) {
    return (
      db.bookings || []
    ).some(
      b =>
        !b.isModel &&
        sameCustomer(
          first,
          b
        ) &&
        stamp(b) <
          stamp(first) &&
        isVisitedBooking(b)
    );
  }

  function cohort(month) {
    const map =
      new Map();

    (db.bookings || [])
      .filter(
        b =>
          !b.isModel &&
          b.newGuest &&
          monthKey(b.date) ===
            month &&
          isVisitedBooking(b)
      )
      .sort(
        (a, b) =>
          stamp(a)
            .localeCompare(
              stamp(b)
            )
      )
      .forEach(b => {
        if (
          visitedBefore(b)
        ) {
          return;
        }

        const k =
          keyOf(b);

        if (!map.has(k)) {
          map.set(k, b);
        }
      });

    return [
      ...map.values()
    ];
  }

  function linkedNext(first) {
    if (
      first.nextBookingId
    ) {
      const linked =
        (
          db.bookings || []
        ).find(
          b =>
            String(b.id) ===
            String(
              first
                .nextBookingId
            )
        );

      if (linked) {
        return linked;
      }
    }

    if (
      first.nextBookingDate
    ) {
      const candidates =
        (
          db.bookings || []
        )
          .filter(
            b =>
              !b.isModel &&
              sameCustomer(
                first,
                b
              ) &&
              b.date ===
                first
                  .nextBookingDate &&
              stamp(b) >
                stamp(first)
          )
          .sort(
            (a, b) =>
              stamp(a)
                .localeCompare(
                  stamp(b)
                )
          );

      if (
        first
          .nextBookingTime
      ) {
        const exact =
          candidates.find(
            b =>
              b.time ===
              first
                .nextBookingTime
          );

        if (exact) {
          return exact;
        }
      }

      return (
        candidates[0] ||
        null
      );
    }

    return null;
  }

  function explicitNextTaken(
    first
  ) {
    return !!(
      first.nextBookingTaken ||
      first.nextBookingId ||
      first.nextBookingDate
    );
  }

  function journey(first) {
    const later =
      (
        db.bookings || []
      )
        .filter(
          b =>
            !b.isModel &&
            sameCustomer(
              first,
              b
            ) &&
            stamp(b) >
              stamp(first)
        )
        .sort(
          (a, b) =>
            stamp(a)
              .localeCompare(
                stamp(b)
              )
        );

    const second =
      later.find(
        isVisitedBooking
      ) || null;

    const future =
      later.find(
        b =>
          isActiveBooking(
            b
          ) &&
          b.date >=
            todayISO
      ) || null;

    const linked =
      linkedNext(first);

    const taken =
      explicitNextTaken(
        first
      );

    const laterCancelled =
      [...later]
        .reverse()
        .find(
          b =>
            [
              'cancelled',
              'noshow'
            ].includes(
              bookingStatus(
                b
              )
            )
        ) || null;

    const age =
      daysBetween(
        first.date,
        todayISO
      );

    const mature =
      age >=
      MATURITY_DAYS;

    let stage =
      'missing';

    if (second) {
      stage =
        'returned';
    } else if (
      linked &&
      isActiveBooking(
        linked
      ) &&
      linked.date >=
        todayISO
    ) {
      stage =
        'future';
    } else if (
      linked &&
      bookingStatus(
        linked
      ) ===
        'cancelled'
    ) {
      stage =
        'cancelled';
    } else if (
      linked &&
      bookingStatus(
        linked
      ) ===
        'noshow'
    ) {
      stage =
        'noshow';
    } else if (taken) {
      stage =
        'taken';
    } else if (future) {
      stage =
        'later_future';
    } else if (
      laterCancelled
    ) {
      stage =
        'later_cancelled';
    }

    let nextOutcome =
      'none';

    if (taken) {
      if (second) {
        nextOutcome =
          'returned';
      } else if (
        linked &&
        [
          'cancelled',
          'noshow'
        ].includes(
          bookingStatus(
            linked
          )
        )
      ) {
        nextOutcome =
          'failed';
      } else if (
        linked &&
        isActiveBooking(
          linked
        ) &&
        linked.date >=
          todayISO
      ) {
        nextOutcome =
          'pending';
      } else {
        nextOutcome =
          'unknown';
      }
    }

    return {
      first,
      customer:
        customerOf(first),
      later,
      second,
      future,
      linked,
      laterCancelled,
      nextTaken:
        taken,
      nextOutcome,
      age,
      mature,
      stage,
      source:
        first.source ||
        'その他'
    };
  }

  function rowsForMonth(
    month
  ) {
    return cohort(
      month
    ).map(journey);
  }

  function stats(month) {
    const rows =
      rowsForMonth(
        month
      );

    const next =
      rows.filter(
        x =>
          x.nextTaken
      ).length;

    const returned =
      rows.filter(
        x =>
          !!x.second
      ).length;

    const mature =
      rows.filter(
        x =>
          x.mature
      );

    const matureReturned =
      mature.filter(
        x =>
          !!x.second
      ).length;

    const waiting =
      rows.filter(
        x =>
          !x.mature
      ).length;

    const outcomeKnown =
      rows.filter(
        x =>
          [
            'returned',
            'failed'
          ].includes(
            x.nextOutcome
          )
      );

    const outcomeReturned =
      outcomeKnown.filter(
        x =>
          x.nextOutcome ===
          'returned'
      ).length;

    const outcomePending =
      rows.filter(
        x =>
          x.nextOutcome ===
          'pending'
      ).length;

    const outcomeUnknown =
      rows.filter(
        x =>
          x.nextOutcome ===
          'unknown'
      ).length;

    return {
      rows,
      total:
        rows.length,
      next,
      returned,
      matureCount:
        mature.length,
      matureReturned,
      waiting,
      outcomeKnown:
        outcomeKnown.length,
      outcomeReturned,
      outcomePending,
      outcomeUnknown,

      nextRate:
        rows.length
          ? Math.round(
              next /
                rows.length *
                100
            )
          : 0,

      returnRate:
        mature.length
          ? Math.round(
              matureReturned /
                mature.length *
                100
            )
          : 0,

      keptRate:
        outcomeKnown.length
          ? Math.round(
              outcomeReturned /
                outcomeKnown.length *
                100
            )
          : 0
    };
  }

  function recoveryCandidates() {
    const map =
      new Map();

    (db.bookings || [])
      .forEach(b => {
        if (
          b.isModel ||
          b.returnRecoveryDone
        ) {
          return;
        }

        if (
          ![
            'cancelled',
            'noshow'
          ].includes(
            bookingStatus(b)
          )
        ) {
          return;
        }

        const priorVisit =
          (
            db.bookings ||
            []
          ).some(
            x =>
              !x.isModel &&
              sameCustomer(
                b,
                x
              ) &&
              stamp(x) <
                stamp(b) &&
              isVisitedBooking(
                x
              )
          );

        if (
          !priorVisit
        ) {
          return;
        }

        const d =
          daysBetween(
            b.date,
            todayISO
          );

        if (
          d < 0 ||
          d > 30
        ) {
          return;
        }

        const hasFuture =
          (
            db.bookings ||
            []
          ).some(
            x =>
              !x.isModel &&
              sameCustomer(
                b,
                x
              ) &&
              String(x.id) !==
                String(b.id) &&
              isActiveBooking(
                x
              ) &&
              x.date >=
                todayISO
          );

        if (
          hasFuture
        ) {
          return;
        }

        const k =
          keyOf(b);

        const old =
          map.get(k);

        if (
          !old ||
          stamp(b) >
            stamp(old)
        ) {
          map.set(
            k,
            b
          );
        }
      });

    return [
      ...map.values()
    ].sort(
      (a, b) =>
        stamp(b)
          .localeCompare(
            stamp(a)
          )
    );
  }

  function actions() {
    return {
      followups:
        typeof followupDueItems ===
        'function'
          ? followupDueItems()
          : [],

      recoveries:
        recoveryCandidates(),

      reminders:
        typeof reminderCandidates ===
        'function'
          ? reminderCandidates()
          : []
    };
  }

  function stageLabel(
    stage
  ) {
    return ({
      returned:
        '2回目実来店',

      future:
        '次回予約あり',

      cancelled:
        '次回キャンセル',

      noshow:
        '次回無断',

      taken:
        '次回取得済み・結果未確定',

      later_future:
        '後日予約あり',

      later_cancelled:
        '後日予約キャンセル',

      missing:
        '次回予約なし'
    })[stage] ||
      stage;
  }

  function stageBadge(
    stage
  ) {
    return ({
      returned:
        'status-visited',

      future:
        'status-booked',

      cancelled:
        'status-cancelled',

      noshow:
        'status-noshow',

      taken:
        'status-booked',

      later_future:
        'status-booked',

      later_cancelled:
        'status-cancelled',

      missing:
        'status-cancelled'
    })[stage] ||
      'status-booked';
  }

  function ensureHome() {
    if (
      document.getElementById(
        'returnManagerHomeWrap'
      )
    ) {
      return;
    }

    const r =
      document.getElementById(
        'returnReminders'
      );

    if (!r) return;

    r.insertAdjacentHTML(
      'afterend',
      `
        <div id="returnManagerHomeWrap">
          <h2>再来管理</h2>
          <div
            id="returnManagerHome"
            class="card"
          ></div>
        </div>
      `
    );
  }

  function renderHomeBox() {
    ensureHome();

    const host =
      document.getElementById(
        'returnManagerHome'
      );

    if (!host) return;

    const month =
      typeof homeMonth !==
      'undefined'
        ? monthString(
            homeMonth
          )
        : monthKey(
            todayISO
          );

    const s =
      stats(month);

    const a =
      actions();

    const total =
      a.followups.length +
      a.recoveries.length +
      a.reminders.length;

    host.innerHTML = `
      <div class="row auto">
        <div style="flex:1">
          <b>今対応が必要</b>
          <div
            style="
              font-size:26px;
              font-weight:900;
              margin-top:3px
            "
          >
            ${total}件
          </div>
        </div>

        <button
          onclick="
            openReturnManager(
              '${month}'
            )
          "
        >
          再来管理を開く
        </button>
      </div>

      <div
        class="small"
        style="margin-top:8px"
      >
        新規→次回
        ${s.nextRate}%
        ・
        2回目実来店
        ${s.returnRate}%
        （45日以上で判定）
        ・
        次回予約後→実来店
        ${s.keptRate}%
      </div>

      <div
        class="small"
        style="margin-top:4px"
      >
        再来判定待ち
        ${s.waiting}人
        ・
        次回結果待ち
        ${s.outcomePending}人
        ・
        結果未確定
        ${s.outcomeUnknown}人
      </div>

      <div
        class="small"
        style="margin-top:4px"
      >
        アフター/事前
        ${a.followups.length}
        ・
        キャンセル後
        ${a.recoveries.length}
        ・
        45日
        ${a.reminders.length}
      </div>
    `;
  }

  function sourceTable(
    rows
  ) {
    const sources =
      [
        ...new Set([
          ...KNOWN_SOURCES,
          ...rows.map(
            x =>
              x.source ||
              'その他'
          )
        ])
      ]
        .map(
          source => {
            const xs =
              rows.filter(
                x =>
                  (
                    x.source ||
                    'その他'
                  ) ===
                  source
              );

            if (
              !xs.length
            ) {
              return null;
            }

            const next =
              xs.filter(
                x =>
                  x.nextTaken
              ).length;

            const mature =
              xs.filter(
                x =>
                  x.mature
              );

            const returned =
              mature.filter(
                x =>
                  x.second
              ).length;

            return {
              source,
              total:
                xs.length,
              next,
              nextRate:
                Math.round(
                  next /
                    xs.length *
                    100
                ),
              mature:
                mature.length,
              returned,
              returnRate:
                mature.length
                  ? Math.round(
                      returned /
                        mature.length *
                        100
                    )
                  : 0
            };
          }
        )
        .filter(Boolean);

    if (!sources.length) {
      return empty(
        '媒体データがありません'
      );
    }

    return `
      <div style="overflow:auto">
        <table class="trend-table">
          <thead>
            <tr>
              <th>媒体</th>
              <th>新規</th>
              <th>次回</th>
              <th>判定対象</th>
              <th>2回目</th>
              <th>再来率</th>
            </tr>
          </thead>

          <tbody>
            ${sources.map(
              x => `
                <tr>
                  <td>${esc(x.source)}</td>
                  <td>${x.total}</td>
                  <td>
                    ${x.next}
                    (${x.nextRate}%)
                  </td>
                  <td>${x.mature}</td>
                  <td>${x.returned}</td>
                  <td>${x.returnRate}%</td>
                </tr>
              `
            ).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function actionHTML() {
    const a =
      actions();

    const out = [];

    a.followups.forEach(
      x =>
        out.push(`
          <div class="item">
            <div class="t">
              ${esc(
                x.booking
                  .customer ||
                '未登録'
              )}

              <span
                class="
                  status-badge
                  status-booked
                "
              >
                ${esc(x.label)}
              </span>
            </div>

            <div class="s">
              ${esc(
                x.booking.date
              )}
              ${esc(
                x.booking.time ||
                ''
              )}
            </div>

            <div class="actions">
              <button
                onclick="
                  openFollowupMessage(
                    '${x.id}',
                    '${x.type}'
                  )
                "
              >
                文面を作る
              </button>

              <button
                class="ghost"
                onclick="
                  editBooking(
                    '${x.booking.id}'
                  )
                "
              >
                予約を見る
              </button>
            </div>
          </div>
        `)
    );

    a.recoveries.forEach(
      b =>
        out.push(`
          <div class="item">
            <div class="t">
              ${esc(
                b.customer ||
                '未登録'
              )}

              <span
                class="
                  status-badge
                  ${
                    bookingStatus(
                      b
                    ) ===
                    'noshow'
                      ? 'status-noshow'
                      : 'status-cancelled'
                  }
                "
              >
                ${
                  bookingStatus(
                    b
                  ) ===
                  'noshow'
                    ? '無断後'
                    : 'キャンセル後'
                }
              </span>
            </div>

            <div class="s">
              ${esc(b.date)}
              ${esc(
                b.time || ''
              )}
              ・
              過去に来店あり
              ・
              未来予約なし
            </div>

            <div class="actions">
              <button
                class="ghost"
                onclick="
                  editBooking(
                    '${b.id}'
                  )
                "
              >
                予約を見る
              </button>

              <button
                onclick="
                  markReturnRecoveryDone(
                    '${b.id}'
                  )
                "
              >
                対応済みにする
              </button>
            </div>
          </div>
        `)
    );

    a.reminders.forEach(
      c =>
        out.push(`
          <div class="item">
            <div class="t">
              ${esc(
                c.name ||
                '未登録'
              )}

              <span
                class="
                  status-badge
                  status-booked
                "
              >
                45日
              </span>
            </div>

            <div class="s">
              最終来店
              ${esc(
                c.lastComputed ||
                ''
              )}
              ・
              ${Number(
                c.days || 0
              )}日経過
            </div>

            <div class="actions">
              <button
                class="ghost"
                onclick="
                  openCustomerChart(
                    '${c.id}'
                  )
                "
              >
                顧客を見る
              </button>

              <button
                onclick="
                  snoozeReminder(
                    '${c.id}'
                  );
                  openReturnManager()
                "
              >
                連絡済み
              </button>
            </div>
          </div>
        `)
    );

    return out.length
      ? out.join('')
      : empty(
          '今対応する再来フォローはありません'
        );
  }

  function filtered(rows) {
    if (
      rmFilter ===
      'all'
    ) {
      return rows;
    }

    if (
      rmFilter ===
      'risk'
    ) {
      return rows.filter(
        x =>
          [
            'cancelled',
            'noshow',
            'later_cancelled',
            'missing'
          ].includes(
            x.stage
          )
      );
    }

    if (
      rmFilter ===
      'waiting'
    ) {
      return rows.filter(
        x =>
          !x.mature
      );
    }

    return rows.filter(
      x =>
        x.stage ===
        rmFilter
    );
  }

  function detail(row) {
    if (row.second) {
      return (
        `2回目 ` +
        `${row.second.date} ` +
        `${row.second.time || ''}`
      );
    }

    if (
      row.linked &&
      isActiveBooking(
        row.linked
      ) &&
      row.linked.date >=
        todayISO
    ) {
      return (
        `次回 ` +
        `${row.linked.date} ` +
        `${row.linked.time || ''}`
      );
    }

    if (
      row.linked &&
      [
        'cancelled',
        'noshow'
      ].includes(
        bookingStatus(
          row.linked
        )
      )
    ) {
      return (
        `${
          bookingStatus(
            row.linked
          ) ===
          'noshow'
            ? '次回無断'
            : '次回キャンセル'
        } ` +
        row.linked.date
      );
    }

    if (row.future) {
      return (
        `後日予約 ` +
        `${row.future.date} ` +
        `${row.future.time || ''}`
      );
    }

    if (
      row.laterCancelled
    ) {
      return (
        `後日${
          bookingStatus(
            row.laterCancelled
          ) ===
          'noshow'
            ? '無断'
            : 'キャンセル'
        } ` +
        row
          .laterCancelled
          .date
      );
    }

    return (
      '次回の実予約データなし'
    );
  }

  function renderSheet() {
    const host =
      document.getElementById(
        'returnManagerSheet'
      );

    if (!host) return;

    const s =
      stats(rmMonth);

    const rows =
      filtered(s.rows);

    const [y, m] =
      rmMonth
        .split('-')
        .map(Number);

    host.innerHTML = `
      <div class="monthbar">
        <button
          onclick="
            changeReturnManagerMonth(
              -1
            )
          "
        >
          ‹
        </button>

        <div class="monthtitle">
          ${y}年${m}月
        </div>

        <button
          onclick="
            changeReturnManagerMonth(
              1
            )
          "
        >
          ›
        </button>
      </div>

      <div
        class="summary-grid"
        style="margin-top:10px"
      >
        <div class="summary-card">
          <div class="l">
            新規実来店
          </div>
          <div class="v">
            ${s.total}人
          </div>
        </div>

        <div class="summary-card">
          <div class="l">
            次回予約取得
          </div>
          <div class="v">
            ${s.nextRate}%
          </div>
          <div class="small">
            ${s.next}/${s.total}
          </div>
        </div>

        <div class="summary-card">
          <div class="l">
            2回目実来店
          </div>
          <div class="v">
            ${s.returnRate}%
          </div>
          <div class="small">
            ${s.matureReturned}/${s.matureCount}
            ・45日以上
          </div>
        </div>

        <div class="summary-card">
          <div class="l">
            次回予約後→実来店
          </div>
          <div class="v">
            ${s.keptRate}%
          </div>
          <div class="small">
            ${s.outcomeReturned}/${s.outcomeKnown}
            ・結果確定分
          </div>
        </div>
      </div>

      <div
        class="note"
        style="margin-top:10px"
      >
        正確性優先：
        次回予約率は
        「次回予約が取れた」
        の記録だけで集計。
        2回目実来店率は
        初回から45日以上
        経過した人だけを
        母数にしています。
      </div>

      <div
        class="small"
        style="margin:8px 2px"
      >
        再来判定待ち
        ${s.waiting}人
        ・
        次回結果待ち
        ${s.outcomePending}人
        ・
        次回結果未確定
        ${s.outcomeUnknown}人
      </div>

      <h3
        style="
          margin:
          18px 0 8px
        "
      >
        今連絡する人
      </h3>

      ${actionHTML()}

      <h3
        style="
          margin:
          18px 0 8px
        "
      >
        新規→2回目の状況
      </h3>

      <select
        onchange="
          setReturnManagerFilter(
            this.value
          )
        "
      >
        <option
          value="all"
          ${
            rmFilter ===
            'all'
              ? 'selected'
              : ''
          }
        >
          全員
        </option>

        <option
          value="returned"
          ${
            rmFilter ===
            'returned'
              ? 'selected'
              : ''
          }
        >
          2回目実来店
        </option>

        <option
          value="future"
          ${
            rmFilter ===
            'future'
              ? 'selected'
              : ''
          }
        >
          次回予約あり
        </option>

        <option
          value="waiting"
          ${
            rmFilter ===
            'waiting'
              ? 'selected'
              : ''
          }
        >
          45日未満・判定待ち
        </option>

        <option
          value="risk"
          ${
            rmFilter ===
            'risk'
              ? 'selected'
              : ''
          }
        >
          要フォロー
        </option>
      </select>

      <div
        class="small"
        style="margin:7px 2px"
      >
        ${rows.length}人表示
      </div>

      ${
        rows.length
          ? rows.map(
              x => {
                const c =
                  x.customer?.id
                    ? `
                        <button
                          class="ghost"
                          onclick="
                            openCustomerChart(
                              '${x.customer.id}'
                            )
                          "
                        >
                          顧客を見る
                        </button>
                      `
                    : '';

                return `
                  <div class="item">
                    <div class="t">
                      ${esc(
                        x.first
                          .customer ||
                        '未登録'
                      )}

                      <span
                        class="
                          status-badge
                          ${stageBadge(
                            x.stage
                          )}
                        "
                      >
                        ${stageLabel(
                          x.stage
                        )}
                      </span>
                    </div>

                    <div class="s">
                      初回
                      ${esc(
                        x.first.date
                      )}
                      ・
                      ${esc(
                        x.source
                      )}
                      ・
                      初回から
                      ${Math.max(
                        0,
                        x.age
                      )}日
                      <br>

                      ${esc(
                        detail(x)
                      )}

                      <br>

                      次回予約取得記録：
                      ${
                        x.nextTaken
                          ? 'あり'
                          : 'なし'
                      }

                      ${
                        x.mature
                          ? ' ・ 再来判定対象'
                          : ' ・ 45日未満'
                      }
                    </div>

                    <div class="actions">
                      ${c}

                      <button
                        class="ghost"
                        onclick="
                          editBooking(
                            '${x.first.id}'
                          )
                        "
                      >
                        初回予約
                      </button>

                      ${
                        x.linked
                          ? `
                              <button
                                class="ghost"
                                onclick="
                                  editBooking(
                                    '${x.linked.id}'
                                  )
                                "
                              >
                                次回予約
                              </button>
                            `
                          : ''
                      }
                    </div>
                  </div>
                `;
              }
            ).join('')
          : empty(
              'この条件の新規客はいません'
            )
      }

      <h3
        style="
          margin:
          18px 0 8px
        "
      >
        媒体別の再来
      </h3>

      ${sourceTable(s.rows)}

      <button
        class="ghost"
        style="
          width:100%;
          margin-top:14px
        "
        onclick="
          closeModal()
        "
      >
        閉じる
      </button>
    `;
  }

  window.openReturnManager =
    function (
      month = ''
    ) {
      if (month) {
        rmMonth =
          month;
      }

      modal(`
        <div class="chart-head">
          <div>
            <h3 style="margin:0">
              再来管理
            </h3>

            <div
              class="small"
              style="margin-top:4px"
            >
              次回予約と
              2回目実来店を
              分けて集計します
            </div>
          </div>

          <button
            class="ghost"
            onclick="
              closeModal()
            "
          >
            閉じる
          </button>
        </div>

        <div
          id="returnManagerSheet"
        ></div>
      `);

      renderSheet();
    };

  window.changeReturnManagerMonth =
    function (n) {
      const [y, m] =
        rmMonth
          .split('-')
          .map(Number);

      rmMonth =
        monthString(
          addMonths(
            new Date(
              y,
              m - 1,
              1
            ),
            n
          )
        );

      renderSheet();
    };

  window.setReturnManagerFilter =
    function (v) {
      rmFilter =
        v || 'all';

      renderSheet();
    };

  window.markReturnRecoveryDone =
    function (id) {
      const b =
        (
          db.bookings ||
          []
        ).find(
          x =>
            String(x.id) ===
            String(id)
        );

      if (!b) return;

      b.returnRecoveryDone =
        true;

      b.returnRecoveryDoneAt =
        new Date()
          .toISOString();

      save();

      window.openReturnManager(
        rmMonth
      );
    };

  const oldRenderHome =
    renderHome;

  renderHome =
    function () {
      oldRenderHome();
      renderHomeBox();
    };

  ensureHome();
  renderHomeBox();
})();
