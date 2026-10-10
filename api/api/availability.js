import {
  cors,
  rest
} from '../lib/order-store.js';

const BUSINESS_START = 11 * 60; // 11:00
const BUSINESS_END = 21 * 60;   // 21:00
const DURATION = 120;            // 2時間
const DAYS = 7;                  // 今日を含め7日間

function pad(n) {
  return String(n).padStart(2, '0');
}

function timeToMin(value) {
  if (!value) return null;

  const [h, m] =
    String(value)
      .split(':')
      .map(Number);

  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m)
  ) {
    return null;
  }

  return h * 60 + m;
}

function minToTime(min) {
  return (
    pad(Math.floor(min / 60)) +
    ':' +
    pad(min % 60)
  );
}

function japanParts(date = new Date()) {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }
    )
      .formatToParts(date)
      .reduce(
        (o, p) => {
          if (p.type !== 'literal') {
            o[p.type] = p.value;
          }
          return o;
        },
        {}
      );

  return {
    date:
      `${parts.year}-${parts.month}-${parts.day}`,

    hour:
      Number(parts.hour),

    minute:
      Number(parts.minute)
  };
}

function dateAdd(iso, days) {
  const d =
    new Date(
      iso + 'T12:00:00Z'
    );

  d.setUTCDate(
    d.getUTCDate() + days
  );

  return d
    .toISOString()
    .slice(0, 10);
}

function weekday(iso) {
  const d =
    new Date(
      iso + 'T12:00:00Z'
    );

  return d.getUTCDay();
}

function dateLabel(iso) {
  const d =
    new Date(
      iso + 'T12:00:00Z'
    );

  const weekdays =
    ['日', '月', '火', '水', '木', '金', '土'];

  return (
    `${d.getUTCMonth() + 1}/` +
    `${d.getUTCDate()}` +
    `(${weekdays[d.getUTCDay()]})`
  );
}

function bookingStatus(b) {
  return b?.status || 'booked';
}

function isActiveBooking(b) {
  const status =
    bookingStatus(b);

  return (
    status !== 'cancelled' &&
    status !== 'noshow'
  );
}

function mergeIntervals(rows) {
  const sorted =
    [...rows]
      .sort(
        (a, b) =>
          a[0] - b[0]
      );

  const merged = [];

  for (const row of sorted) {
    const last =
      merged[
        merged.length - 1
      ];

    if (
      last &&
      row[0] <= last[1]
    ) {
      last[1] =
        Math.max(
          last[1],
          row[1]
        );
    } else {
      merged.push(
        [...row]
      );
    }
  }

  return merged;
}

function roundUp30(min) {
  return (
    Math.ceil(min / 30) * 30
  );
}

function availabilityForDate({
  date,
  bookings,
  today,
  currentMinutes
}) {

  let start =
    BUSINESS_START;

  if (date === today) {
    start =
      Math.max(
        BUSINESS_START,
        roundUp30(
          currentMinutes
        )
      );
  }

  if (
    start + DURATION >
    BUSINESS_END
  ) {
    return [];
  }

  const busy =
    mergeIntervals(
      bookings
        .filter(
          b =>
            b.date === date &&
            isActiveBooking(b)
        )
        .map(b => {

          const from =
            timeToMin(b.time);

          let to =
            timeToMin(b.end);

          if (
            from === null
          ) {
            return null;
          }

          // 終了時間が無い予約は
          // 安全のため2時間枠として扱う
          if (
            to === null ||
            to <= from
          ) {
            to =
              from + DURATION;
          }

          return [
            Math.max(
              BUSINESS_START,
              from
            ),

            Math.min(
              BUSINESS_END,
              to
            )
          ];
        })
        .filter(Boolean)
        .filter(
          x =>
            x[1] > x[0]
        )
    );

  const gaps = [];

  let cursor =
    start;

  for (const [from, to] of busy) {

    if (
      to <= start ||
      from >= BUSINESS_END
    ) {
      continue;
    }

    const busyStart =
      Math.max(
        start,
        from
      );

    const busyEnd =
      Math.min(
        BUSINESS_END,
        to
      );

    if (
      busyStart > cursor
    ) {
      gaps.push([
        cursor,
        busyStart
      ]);
    }

    cursor =
      Math.max(
        cursor,
        busyEnd
      );
  }

  if (
    cursor < BUSINESS_END
  ) {
    gaps.push([
      cursor,
      BUSINESS_END
    ]);
  }

  return gaps
    .filter(
      ([from, to]) =>
        to - from >=
        DURATION
    )
    .map(
      ([from, to]) => ({

        start:
          minToTime(from),

        // 2時間施術を開始できる
        // 最終時刻まで表示
        end:
          minToTime(
            to - DURATION
          )
      })
    );
}

async function latestState() {

  const rows =
    await rest(
      'salon-backups' +
      '?select=id,created_at,data' +
      '&order=created_at.desc' +
      '&limit=1'
    );

  return (
    rows?.[0]?.data ||
    {}
  );
}

function ownerId(state) {

  const profiles =
    Array.isArray(
      state.staffProfiles
    )
      ? state.staffProfiles
      : [];

  return (
    profiles.find(
      x =>
        x.role === 'owner' &&
        x.active !== false
    )?.id ||
    profiles[0]?.id ||
    ''
  );
}

export default async function handler(
  req,
  res
) {

  cors(req, res);

  if (
    req.method ===
    'OPTIONS'
  ) {
    return res
      .status(204)
      .end();
  }

  if (
    req.method !==
    'GET'
  ) {
    return res
      .status(405)
      .json({
        ok: false,
        error:
          'Method not allowed'
      });
  }

  try {

    const state =
      await latestState();

    const allBookings =
      Array.isArray(
        state.bookings
      )
        ? state.bookings
        : [];

    const owner =
      ownerId(state);

    // スタッフ機能を使っている場合は
    // 自分（owner）の予約のみ対象
    const bookings =
      owner
        ? allBookings.filter(
            b =>
              !b.staffId ||
              String(b.staffId) ===
              String(owner)
          )
        : allBookings;

    const now =
      japanParts();

    const today =
      now.date;

    const currentMinutes =
      now.hour * 60 +
      now.minute;

    const days = [];

    for (
      let i = 0;
      i < DAYS;
      i++
    ) {

      const date =
        dateAdd(
          today,
          i
        );

      // 月曜定休
      if (
        weekday(date) === 1
      ) {
        continue;
      }

      const slots =
        availabilityForDate({
          date,
          bookings,
          today,
          currentMinutes
        });

      if (
        !slots.length
      ) {
        continue;
      }

      days.push({
        date,
        label:
          dateLabel(date),
        slots
      });
    }

    let text = '';

    if (days.length) {

      const lines =
        days.map(day => {

          const slots =
            day.slots
              .map(slot => {

                if (
                  slot.start ===
                  slot.end
                ) {
                  return slot.start;
                }

                return (
                  `${slot.start}〜${slot.end}`
                );
              })
              .join(' / ');

          return (
            `${day.label}  ${slots}`
          );
        });

      text =
        [
          '現在のご予約空き状況です✂️',
          '',
          ...lines,
          '',
          'ご希望のお時間がありましたら、このままLINEでお送りください🙆‍♂️'
        ]
          .join('\n');

    } else {

      text =
        [
          '直近1週間はご予約枠が埋まっています🙇‍♂️',
          'キャンセル等で空きが出る場合もあるので、ご希望日があればお気軽にご相談ください。'
        ]
          .join('\n');
    }

    return res
      .status(200)
      .json({
        ok: true,

        generatedAt:
          new Date()
            .toISOString(),

        durationMinutes:
          DURATION,

        businessHours: {
          start: '11:00',
          end: '21:00'
        },

        days,

        text
      });

  } catch (e) {

    console.error(
      'Availability error',
      e
    );

    return res
      .status(500)
      .json({
        ok: false,
        error:
          '空き状況を取得できませんでした'
      });
  }
}
