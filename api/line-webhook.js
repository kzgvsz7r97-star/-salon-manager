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

      // 「連携ID」と送られた時だけ返信
      if (text !== "連携ID") {
        continue;
      }

      const userId = event.source?.userId;

      if (!userId) {
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
                text: `LINE連携ID\n${userId}`,
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
