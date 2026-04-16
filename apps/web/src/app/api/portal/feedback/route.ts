import { NextResponse } from "next/server";
import { z } from "zod";
import { db, portalFeedback } from "db";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sendEmail } from "@/lib/email/send-email";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  category: z.enum(["bug", "idea"]),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  pageUrl: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const membership = await getMembership(user.id);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limiter = checkRateLimit(request, "portal-feedback", `${membership.tenantId}:${user.id}`, {
      windowMs: 60_000,
      maxRequests: 8,
    });
    if (!limiter.ok) {
      return NextResponse.json(
        { error: "Příliš mnoho zpráv. Zkuste to za chvíli." },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Neplatná data." }, { status: 400 });
    }

    await db.insert(portalFeedback).values({
      tenantId: membership.tenantId,
      userId: user.id,
      category: parsed.data.category,
      title: parsed.data.title,
      body: parsed.data.body,
      pageUrl: parsed.data.pageUrl?.trim() || null,
      userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    });

    const notifyEmail = process.env.FEEDBACK_NOTIFY_EMAIL;
    if (notifyEmail) {
      const categoryLabel = parsed.data.category === "bug" ? "🐛 Bug report" : "💡 Návrh zlepšení";
      const pageInfo = parsed.data.pageUrl ? `<p style="color:#64748b;font-size:12px;">Stránka: ${parsed.data.pageUrl}</p>` : "";
      await sendEmail({
        to: notifyEmail,
        subject: `[Aidvisora] ${categoryLabel}: ${parsed.data.title}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#1e293b">${categoryLabel}</h2>
            <p style="color:#374151;font-size:14px;font-weight:600">${parsed.data.title}</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0;white-space:pre-wrap;font-size:13px;color:#374151">${parsed.data.body}</div>
            ${pageInfo}
            <p style="color:#94a3b8;font-size:11px;">Tenant: ${membership.tenantId} · User: ${user.id}</p>
          </div>
        `,
      }).catch(() => { /* neblokovat odpověď pokud selže email */ });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Uložení selhalo." }, { status: 500 });
  }
}
