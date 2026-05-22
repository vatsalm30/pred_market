import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * One-time setup: registers the webhook URL with Telegram.
 * Call GET /api/telegram/setup?secret={CRON_SECRET} after deploy.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !appUrl || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing env: TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_APP_URL, or TELEGRAM_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message"],
      }),
    }
  );

  const data = await res.json();
  return NextResponse.json({ webhook_url: webhookUrl, telegram_response: data });
}
