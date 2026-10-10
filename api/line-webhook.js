import crypto from "crypto";
import { rest } from "../lib/order-store.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const BUSINESS_START = 11 * 60;
const BUSINESS_END = 21 * 60;
const DURATION = 120;
const DAYS = 7;

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function timeToMin(value) {
  if (!value) return null;

  const [h, m] = String(value)
    .split(":")
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
    ":" +
    pad(min % 60)
  );
}

function japanNow() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }
    )
      .formatToParts(new Date())
      .reduce((obj, part) => {
        if (part.type !== "literal") {
          obj[part.type] = part.value;
        }

        return obj;
      }, {});

  return {
    date:
      `${parts.year}-${parts.month}-${parts.day}`,
    minutes:
      Number(parts.hour) * 60 +
      Number(parts.minute),
  };
}

function addDays(iso, days) {
  const d =
    new Date(
      iso + "T12:00:00Z"
    );

  d.setUTCDate(
    d.getUTCDate() + days
  );

  return d
    .toISOString()
    .slice(0, 10);
}

function weekday(iso) {
  return new Date(
    iso + "T12:00:00Z"
  ).getUTCDay();
}

function dateLabel(iso) {
  const d =
    new Date(
      iso + "T12:00:00Z"
    );

  const week =
    [
      "日",
      "月",
      "火",
      "水",
      "木",
      "金",
      "土",
    ];

  return (
    `${d.getUTCMonth() + 1}/` +
    `${d.getUTCDate()}` +
    `(${week[d.getUTCDay()]})`
  );
}

function activeBooking(b) {
  const status =
    b?.status || "booked";

  return (
    status !== "cancelled" &&
    status !== "noshow"
  );
}

function mergeBusy(rows) {
  const sorted =
    [...rows].sort(
      (a, b) => a[0] - b[0]
    );

  const out = [];

  for (const row of sorted) {
    const prev =
      out[out.length - 1];

    if (
      prev &&
      row[0] <= prev[1]
    ) {
      prev[1] =
        Math.max(
          prev[1],
          row[1]
        );
    } else {
      out.push([...row]);
    }
  }

  return out;
}

function roundUp30(min) {
  return (
    Math.ceil(min / 30) * 30
  );
}

function slotsForDate({
  date,
  bookings,
  today,
  currentMinutes,
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
    mergeBusy(
      bookings
        .filter(
          b =>
            b.date === date &&
            activeBooking(b)
        )
        .map(b => {
          const from =
            timeToMin(b.time);

          let to =
            timeToMin(b.end);

          if (from === null) {
            return null;
          }

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
            ),
          ];
        })
        .filter(Boolean)
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
        busyStart,
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
      BUSINESS_END,
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

        end:
          minToTime(
            to - DURATION
          ),
      })
    );
}

async function makeAvailabilityText() {
  const rows =
    await rest(
      "salon-backups" +
      "?select=id,created_at,data" +
      "&order=created_at.desc" +
      "&limit=1"
    );

  const state =
    rows?.[0]?.data || {};

  const allBookings =
    Array.isArray(
      state.bookings
    )
      ? state.bookings
      : [];

  const profiles =
    Array.isArray(
      state.staffProfiles
    )
      ? state.staffProfiles
      : [];

  const ownerId =
    profiles.find(
      x =>
        x.role === "owner" &&
        x.active !== false
    )?.id ||
    profiles[0]?.id ||
    "";

  const bookings =
    ownerId
      ? allBookings.filter(
          b =>
            !b.staffId ||
            String(b.staffId) ===
              String(ownerId)
        )
      : allBookings;

  const now =
    japanNow();

  const days = [];

  for (
    let i = 0;
    i < DAYS;
    i++
  ) {
    const date =
      addDays(
        now.date,
        i
      );

    // 月曜日は定休日
    if (
      weekday(date) === 1
    ) {
      continue;
    }

    const slots =
      slotsForDate({
        date,
        bookings,
        today:
          now.date,
        currentMinutes:
          now.minutes,
      });

    if (!slots.length) {
      continue;
    }

    days.push({
      date,
      slots,
    });
  }

  if (!days.length) {
    return (
      "直近1週間はご予約枠が埋まっています🙇‍♂️\n\n" +
      "キャンセル等で空きが出る場合もあるので、ご希望日があればお気軽にご相談ください。"
    );
  }

  const lines =
    days.map(day => {
      const times =
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
          .join(" / ");

      return (
        `${dateLabel(day.date)}  ${times}`
      );
    });

  return [
    "現在のご予約空き状況です✂️",
    "",
    ...lines,
    "",
    "※カットカラー約2時間を基準に表示しています。",
    "ご希望のお時間がありましたら、このままLINEでお送りください🙆‍♂️",
  ].join("\n");
}

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "POST"
  ) {
    return res
      .status(405)
      .send(
        "Method Not Allowed"
      );
  }

  try {
    const rawBody =
      await getRawBody(req);

    const signature =
      req.headers[
        "x-line-signature"
      ];

    const channelSecret =
      process.env
        .LINE_CHANNEL_SECRET;

    if (
      !signature ||
      !channelSecret
    ) {
      return res
        .status(401)
        .send(
          "Invalid signature"
        );
    }

    const expectedSignature =
      crypto
        .createHmac(
          "SHA256",
          channelSecret
        )
        .update(rawBody)
        .digest("base64");

    if (
      signature !==
      expectedSignature
    ) {
      return res
        .status(401)
        .send(
          "Invalid signature"
        );
    }

    const body =
      JSON.parse(
        rawBody.toString(
          "utf8"
        )
      );

    for (
      const event of
      body.events || []
    ) {
      if (
        event.type !==
          "message" ||
        event.message?.type !==
          "text" ||
        !event.replyToken
      ) {
        continue;
      }

      const text =
        event.message.text
          ?.trim();

      const userId =
        event.source?.userId;

      let replyText = "";

      // 連携ID
      if (
        text === "連携ID"
      ) {
        if (!userId) {
          continue;
        }

        replyText =
          `LINE連携ID\n${userId}`;
      }

      // 空き状況
      else if (
        text === "空き状況" ||
        text ===
          "空き状況を確認" ||
        text ===
          "空き状況を確認する"
      ) {
        replyText =
          await makeAvailabilityText();
      }

      // 商品注文
      else if (
        text === "商品注文" ||
        text ===
          "商品を注文したいです！" ||
        text === "店販"
      ) {
        const orderUrl =
          process.env
            .PUBLIC_ORDER_URL ||
          "https://salon-manager-kzgvsz7r97-star.vercel.app/order.html";

        replyText =
          "ヘアケア商品のご注文はこちらから☺️\n\n" +
          orderUrl +
          "\n\nご来店の7日前までにお申し込みください。";
      }

      // メニュー診断・相談
      else if (
        text ===
          "メニューを相談したいです！" ||
        text === "相談"
      ) {
        replyText =
          "ご相談ありがとうございます☺️\n\n" +
          "髪型・カラー・メニュー選びなど、気になることをそのまま送ってください！\n\n" +
          "仕上がりイメージがある場合は、写真も一緒に送っていただけるとスムーズです◎";
      }

      else {
        continue;
      }

      const response =
        await fetch(
          "https://api.line.me/v2/bot/message/reply",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            },

            body:
              JSON.stringify({
                replyToken:
                  event.replyToken,

                messages: [
                  {
                    type: "text",
                    text:
                      replyText,
                  },
                ],
              }),
          }
        );

      if (!response.ok) {
        console.error(
          "LINE reply error:",
          response.status,
          await response.text()
        );
      }
    }

    return res
      .status(200)
      .json({
        ok: true,
      });

  } catch (error) {
    console.error(
      "Webhook error:",
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        error:
          "Webhook failed",
      });
  }
}
