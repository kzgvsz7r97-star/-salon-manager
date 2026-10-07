(() => {
  if (window.__metricsConsistencyV1) return;
  window.__metricsConsistencyV1 = true;

  const MATURITY_DAYS = 45;

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

  function customerKey(b) {
    if (b?.customerId) {
      return `id:${String(b.customerId)}`;
    }

    return `name:${normalizeName(b?.customer || '')}`;
  }

  function visitedBefore(first) {
    return (db.bookings || []).some(b =>
      !b.isModel &&
      sameCustomer(first, b) &&
      stamp(b) < stamp(first) &&
      isVisitedBooking(b)
    );
  }

  function isTrueNewVisit(b) {
    return !!(
      b &&
      !b.isModel &&
      b.newGuest &&
      isVisitedBooking(b) &&
      !visitedBefore(b)
    );
  }

  function explicitNextTaken(b) {
    return !!(
      b?.nextBookingTaken ||
      b?.nextBookingId ||
      b?.nextBookingDate
    );
  }

  function linkedNext(first) {
    if (!first) return null;

    if (first.nextBookingId) {
      const linked = (db.bookings || []).find(
        b =>
          String(b.id) ===
          String(first.nextBookingId)
      );

      if (linked) return linked;
    }

    if (first.nextBookingDate) {
      const candidates = (db.bookings || [])
        .filter(
          b =>
            !b.isModel &&
            sameCustomer(first, b) &&
            b.date === first.nextBookingDate &&
            stamp(b) > stamp(first)
        )
        .sort((a, b) =>
          stamp(a).localeCompare(stamp(b))
        );

      if (first.nextBookingTime) {
        const exact = candidates.find(
          b => b.time === first.nextBookingTime
        );

        if (exact) return exact;
      }

      return candidates[0] || null;
    }

    return null;
  }

  function laterVisits(first) {
    return (db.bookings || [])
      .filter(
        b =>
          !b.isModel &&
          sameCustomer(first, b) &&
          stamp(b) > stamp(first)
      )
      .sort((a, b) =>
        stamp(a).localeCompare(stamp(b))
      );
  }

  function journey(first) {
    const later = laterVisits(first);
    const second =
      later.find(isVisitedBooking) || null;
    const linked = linkedNext(first);
    const nextTaken = explicitNextTaken(first);

    let nextOutcome = 'none';

    if (nextTaken) {
      if (second) {
        nextOutcome = 'returned';
      } else if (
        linked &&
        ['cancelled', 'noshow'].includes(
          bookingStatus(linked)
        )
      ) {
        nextOutcome = 'failed';
      } else if (
        linked &&
        isActiveBooking(linked) &&
        linked.date >= todayISO
      ) {
        nextOutcome = 'pending';
      } else {
        nextOutcome = 'unknown';
      }
    }

    return {
      first,
      second,
      linked,
      nextTaken,
      nextOutcome,
      mature:
        daysBetween(first.date, todayISO) >=
        MATURITY_DAYS
    };
  }

  function newCohortForMonth(month) {
    const rows = (db.bookings || [])
      .filter(
        b =>
          !b.isModel &&
          b.newGuest &&
          monthKey(b.date) === month &&
          isVisitedBooking(b)
      )
      .sort((a, b) =>
        stamp(a).localeCompare(stamp(b))
      );

    const map = new Map();

    rows.forEach(b => {
      if (visitedBefore(b)) return;

      const key = customerKey(b);

      if (!map.has(key)) {
        map.set(key, b);
      }
    });

    return [...map.values()];
  }

  // 全画面の「次回予約取得」は、明示保存された次回予約データだけで判定。
  nextBookingTakenForBooking = function (b) {
    return explicitNextTaken(b);
  };

  analysisStats = function (m) {
    const all = (db.bookings || []).filter(
      x =>
        monthKey(x.date) === m &&
        !x.isModel
    );

    const visits = all.filter(isVisitedBooking);

    const newVisits = visits.filter(
      isTrueNewVisit
    );

    const repeatVisits = visits.filter(
      b => !isTrueNewVisit(b)
    );

    const nextTaken =
      visits.filter(explicitNextTaken).length;

    const nextRate =
      visits.length
        ? Math.round(
            nextTaken /
              visits.length *
              100
          )
        : 0;

    const newNextTaken =
      newVisits.filter(explicitNextTaken).length;

    const repeatNextTaken =
      repeatVisits.filter(explicitNextTaken).length;

    const newNextRate =
      newVisits.length
        ? Math.round(
            newNextTaken /
              newVisits.length *
              100
          )
        : 0;

    const repeatNextRate =
      repeatVisits.length
        ? Math.round(
            repeatNextTaken /
              repeatVisits.length *
              100
          )
        : 0;

    const paidRevenue = all
      .filter(
        x =>
          x.paymentComplete &&
          isActiveBooking(x)
      )
      .reduce(
        (a, x) =>
          a + Number(x.price || 0),
        0
      );

    const avg =
      visits.length
        ? Math.round(
            paidRevenue /
              visits.length
          )
        : 0;

    const cancels =
      all.filter(
        x =>
          bookingStatus(x) ===
          'cancelled'
      ).length;

    const noshows =
      all.filter(
        x =>
          bookingStatus(x) ===
          'noshow'
      ).length;

    const freeVisits =
      visits.filter(
        x =>
          x.bookingType ===
          'free'
      ).length;

    const designatedVisits =
      visits.filter(
        x =>
          x.bookingType ===
          'designated'
      ).length;

    const cohort =
      newCohortForMonth(m);

    const journeys =
      cohort.map(journey);

    const matureJourneys =
      journeys.filter(
        x => x.mature
      );

    const matureReturned =
      matureJourneys.filter(
        x => !!x.second
      ).length;

    const secondRate =
      matureJourneys.length
        ? Math.round(
            matureReturned /
              matureJourneys.length *
              100
          )
        : 0;

    const outcomeKnown =
      journeys.filter(
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
      journeys.filter(
        x =>
          x.nextOutcome ===
          'pending'
      ).length;

    const outcomeUnknown =
      journeys.filter(
        x =>
          x.nextOutcome ===
          'unknown'
      ).length;

    const keptRate =
      outcomeKnown.length
        ? Math.round(
            outcomeReturned /
              outcomeKnown.length *
              100
          )
        : 0;

    return {
      visits,
      newVisits,
      repeatVisits,
      nextTaken,
      nextRate,
      newNextTaken,
      repeatNextTaken,
      newNextRate,
      repeatNextRate,
      paidRevenue,
      avg,
      cancels,
      noshows,
      freeVisits,
      designatedVisits,

      // 旧画面との互換
      uniqueNew:
        matureJourneys.map(
          x => x.first
        ),
      secondReturned:
        matureReturned,
      secondRate,

      // 正確性表示用
      cohort,
      journeys,
      matureCount:
        matureJourneys.length,
      maturityWaiting:
        journeys.length -
        matureJourneys.length,
      nextOutcomeKnown:
        outcomeKnown.length,
      nextOutcomeReturned:
        outcomeReturned,
      nextOutcomePending:
        outcomePending,
      nextOutcomeUnknown:
        outcomeUnknown,
      keptRate,

      all
    };
  };

  renderMonthlyAnalysis = function () {
    const host = $('monthlyAnalysis');
    const srcHost = $('analysisSources');

    if (!host || !srcHost) return;

    const m =
      monthString(analysisMonth);

    const s =
      analysisStats(m);

    const months =
      recentAnalysisMonths(
        m,
        4
      );

    host.innerHTML = `
      <div class="analysis-grid">
        <div class="analysis-card">
          <div class="l">実来店</div>
          <div class="v">${s.visits.length}人</div>
        </div>

        <div class="analysis-card">
          <div class="l">新規 / 再来</div>
          <div class="v">${s.newVisits.length} / ${s.repeatVisits.length}</div>
        </div>

        <div class="analysis-card">
          <div class="l">新規 次回予約率</div>
          <div class="v">${s.newNextRate}%</div>
          <div class="small">${s.newNextTaken}/${s.newVisits.length}・明示予約のみ</div>
        </div>

        <div class="analysis-card">
          <div class="l">再来 次回予約率</div>
          <div class="v">${s.repeatNextRate}%</div>
          <div class="small">${s.repeatNextTaken}/${s.repeatVisits.length}・明示予約のみ</div>
        </div>

        <div class="analysis-card">
          <div class="l">2回目実来店率</div>
          <div class="v">${s.secondRate}%</div>
          <div class="small">初回45日以上 ${s.secondReturned}/${s.matureCount}・判定待ち ${s.maturityWaiting}</div>
        </div>

        <div class="analysis-card">
          <div class="l">次回予約→実来店</div>
          <div class="v">${s.keptRate}%</div>
          <div class="small">結果確定 ${s.nextOutcomeReturned}/${s.nextOutcomeKnown}・待ち ${s.nextOutcomePending}・未確定 ${s.nextOutcomeUnknown}</div>
        </div>

        <div class="analysis-card">
          <div class="l">平均単価</div>
          <div class="v">${yen(s.avg)}</div>
        </div>

        <div class="analysis-card">
          <div class="l">フリー / 指名</div>
          <div class="v">${s.freeVisits} / ${s.designatedVisits}</div>
        </div>

        <div class="analysis-card">
          <div class="l">キャンセル / 無断</div>
          <div class="v">${s.cancels} / ${s.noshows}</div>
        </div>
      </div>

      <h3 style="margin:16px 4px 8px">
        3か月前〜今月の推移
      </h3>

      <div style="overflow:auto">
        <table class="trend-table">
          <thead>
            <tr>
              <th>月</th>
              <th>新規</th>
              <th>2回目実来店</th>
              <th>新規次回</th>
              <th>再来次回</th>
              <th>次回→実来店</th>
            </tr>
          </thead>

          <tbody>
            ${months.map(mm => {
              const a =
                analysisStats(mm);

              return `
                <tr>
                  <td>${Number(mm.slice(5))}月</td>
                  <td>${a.newVisits.length}</td>
                  <td>${a.secondRate}%</td>
                  <td>${a.newNextRate}%</td>
                  <td>${a.repeatNextRate}%</td>
                  <td>${a.keptRate}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="small" style="margin:7px 4px 0">
        2回目実来店率＝その月の本当の新規のうち、初回来店から45日以上経過した人だけで計算。次回予約率＝明示保存された次回予約のみ。次回予約→実来店率＝来店・キャンセル・無断キャンセルなど結果が確定した分だけで計算します。
      </div>
    `;

    const sources = [
      'SHAiRE',
      'Nailie',
      'minimo',
      'Instagram',
      'その他'
    ];

    srcHost.innerHTML =
      sources.map(source => {
        const xs =
          s.visits.filter(
            x =>
              x.source === source
          );

        const rev =
          s.all
            .filter(
              x =>
                x.source === source &&
                x.paymentComplete &&
                isActiveBooking(x)
            )
            .reduce(
              (a, x) =>
                a +
                Number(
                  x.price || 0
                ),
              0
            );

        return `
          <div class="analysis-source">
            <b>${source}</b>
            <div class="small" style="margin-top:4px">
              実来店 ${xs.length}人 ・ 確定売上 ${yen(rev)}
            </div>
          </div>
        `;
      }).join('');

    renderStaffAnalysis(m);
  };
})();
