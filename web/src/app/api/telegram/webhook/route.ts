import { NextRequest, NextResponse } from "next/server";
import {
  addSubscriber,
  removeSubscriber,
  getSubscriberIds,
  sendMessage,
} from "@/lib/bot";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate the secret token Telegram attaches to every webhook call
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const msg = update.message;
  if (!msg?.text) return NextResponse.json({ ok: true });

  const chatId = msg.chat.id;
  const username = msg.from?.username;
  const text = msg.text.trim();

  if (text === "/start" || text.startsWith("/start ")) {
    await addSubscriber(chatId, username);
    await sendMessage(
      chatId,
      `👋 <b>Welcome to OddsArb Alerts!</b>\n\n` +
        `You'll receive a message whenever a new arbitrage opportunity appears across Polymarket and Kalshi.\n\n` +
        `Commands:\n` +
        `/stop — unsubscribe\n` +
        `/status — bot status\n\n` +
        `Alerts fire every 10 minutes. Good luck! 🎯`
    );
  } else if (text === "/stop") {
    await removeSubscriber(chatId);
    await sendMessage(
      chatId,
      `👋 You've been unsubscribed. Send /start any time to re-subscribe.`
    );
  } else if (text === "/status") {
    const ids = await getSubscriberIds();
    await sendMessage(
      chatId,
      `📊 <b>OddsArb Bot Status</b>\n\n` +
        `Subscribers: <b>${ids.length}</b>\n` +
        `Alert interval: every 10 minutes\n` +
        `Threshold: ≥ 2% net profit`
    );
  } else {
    await sendMessage(
      chatId,
      `Commands: /start · /stop · /status`
    );
  }

  return NextResponse.json({ ok: true });
}

// Minimal Telegram Update types — avoids pulling in the full telegraf types
interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { username?: string };
  };
}
