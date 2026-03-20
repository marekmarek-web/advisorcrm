import { NextResponse } from "next/server";
import { getCalendarAuth } from "../../calendar/auth";
import { getValidGmailAccessToken } from "@/lib/integrations/google-gmail-integration-service";
import { sendGmailMessage } from "@/lib/integrations/google-gmail";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await getCalendarAuth(request, { requireWrite: false });
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  const body = (await request.json()) as {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    replyToMessageId?: string;
    threadId?: string;
  };

  if (!body.to || !body.subject || !body.body) {
    return NextResponse.json({ error: "Chybí povinná pole (to, subject, body)" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidGmailAccessToken(userId, tenantId);
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === "not_connected") return NextResponse.json({ error: "Gmail není připojen" }, { status: 400 });
    return NextResponse.json({ error: "Chyba přístupu ke Gmailu" }, { status: 500 });
  }

  try {
    const sent = await sendGmailMessage(accessToken, body);
    return NextResponse.json({ id: sent.id, threadId: sent.threadId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
