import { NextResponse } from "next/server";
import { db } from "db";
import { contacts } from "db";
import { lte, isNotNull, isNull, and } from "db";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: contacts.id,
      tenantId: contacts.tenantId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      nextServiceDue: contacts.nextServiceDue,
    })
    .from(contacts)
    .where(
      and(
        isNotNull(contacts.nextServiceDue),
        isNull(contacts.notificationUnsubscribedAt),
        lte(contacts.nextServiceDue, today)
      )
    );
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ sent: 0, error: "RESEND_API_KEY not set" });
  }
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  let sent = 0;
  for (const c of rows) {
    if (!c.email) continue;
    const { error } = await resend.emails.send({
      from,
      to: c.email,
      subject: "Připomínka servisního termínu – WePlan",
      html: `<p>Dobrý den, ${c.firstName} ${c.lastName},</p><p>připomínáme Vám, že máte naplánovaný servisní termín (${c.nextServiceDue}). Obraťte se na svého poradce.</p>`,
    });
    if (!error) sent++;
  }
  return NextResponse.json({ sent, total: rows.length });
}
