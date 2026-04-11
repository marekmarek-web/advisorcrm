import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getIntegrationApiAuth } from "../../integrations/auth";
import { assertPlanCapabilityForIntegration } from "@/lib/billing/plan-access-guards";
import { nextResponseFromPlanOrQuotaError } from "@/lib/billing/plan-access-http";
import { getValidGmailAccessToken } from "@/lib/integrations/google-gmail-integration-service";
import { sendGmailMessage, type GmailAttachment } from "@/lib/integrations/google-gmail";

export const dynamic = "force-dynamic";

type SendPayload = {
  to: string;
  subject?: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyToMessageId?: string;
  threadId?: string;
  attachments?: GmailAttachment[];
};

async function parsePayload(request: Request): Promise<SendPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return (await request.json()) as SendPayload;
  }
  const form = await request.formData();
  const files = form.getAll("attachments").filter((f): f is File => f instanceof File);
  const attachments: GmailAttachment[] = await Promise.all(
    files.map(async (file) => {
      const arr = await file.arrayBuffer();
      return {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64: Buffer.from(arr).toString("base64"),
      };
    })
  );
  return {
    to: String(form.get("to") ?? ""),
    subject: String(form.get("subject") ?? ""),
    body: String(form.get("body") ?? ""),
    cc: String(form.get("cc") ?? "") || undefined,
    bcc: String(form.get("bcc") ?? "") || undefined,
    replyToMessageId: String(form.get("replyToMessageId") ?? "") || undefined,
    threadId: String(form.get("threadId") ?? "") || undefined,
    attachments,
  };
}

export async function POST(request: Request) {
  const authResult = await getIntegrationApiAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  try {
    await assertPlanCapabilityForIntegration({ tenantId, userId, capability: "google_gmail" });
  } catch (e) {
    const r = nextResponseFromPlanOrQuotaError(e);
    if (r) return r;
    throw e;
  }

  const limiter = checkRateLimit(request, "gmail-send", `${tenantId}:${userId}`, { windowMs: 60_000, maxRequests: 20 });
  if (!limiter.ok) {
    return NextResponse.json({ error: "Too many requests. Please retry later." }, { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } });
  }

  const body = await parsePayload(request);

  if (!body.to || !body.body) {
    return NextResponse.json({ error: "Chybí povinná pole (to, body)" }, { status: 400 });
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
    const sent = await sendGmailMessage(accessToken, {
      ...body,
      subject: body.subject ?? "",
    });
    return NextResponse.json({ id: sent.id, threadId: sent.threadId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
