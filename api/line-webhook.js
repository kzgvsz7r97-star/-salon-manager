import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const rawBody = await getRawBody(req);

    const signature = req.headers["x-line-signature"];
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    if (!signature || !channelSecret) {
      return res.status(401).send("Invalid signature");
    }

    const expectedSignature = crypto
      .createHmac("SHA256", channelSecret)
      .update(rawBody)
      .digest("base64");

    if (signature !== expectedSignature) {
      return res.status(401).send("Invalid signature");
    }

    const body = JSON.parse(rawBody.toString("utf8"));

    for (const event of body.events || []) {
      if (
        event.type !== "message" ||
        event.message?.type !== "text" ||
        !event.replyToken
      ) {
        continue;
      }

      const text = event.message.text?.trim();
      const userId = event.source?.userId;

      let replyText = "";

      // 連携ID
      if (text === "連携ID") {
        if (!userId) continue;

        replyText = `LINE連携ID\n${userId}`;
      }

      // 商品注文（管理画面への保存はお客様専用ページから）
      else if (text === "商品注文" || text === "商品を注文したいです！" || text === "店販") {
        const orderUrl = process.env.PUBLIC_ORDER_URL || "https://kzgvsz7r97-star.github.io/-salon-manager/order.html";
        replyText = "ヘアケア商品のご注文はこちらから☺️\n\n" + orderUrl + "\n\nご来店の7日前までにお申し込みください。ReFaの商品はページ内のB happyからご購入いただけます◎";
      }

      // メニュー診断・相談
      else if (
        text === "メニューを相談したいです！" ||
        text === "相談"
      ) {
        replyText =
          "ご相談ありがとうございます☺️\n\n" +
          "髪型・カラー・メニュー選びなど、気になることをそのまま送ってください！\n\n" +
          "仕上がりイメージがある場合は、写真も一緒に送っていただけるとスムーズです◎";
      }

      // それ以外は自動返信しない
      else {
        continue;
      }

      const response = await fetch(
        "https://api.line.me/v2/bot/message/reply",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            replyToken: event.replyToken,
            messages: [
              {
                type: "text",
                text: replyText,
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

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).json({
      ok: false,
      error: "Webhook failed",
    });
  }
}

