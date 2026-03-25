import { NextResponse } from "next/server";
import { z } from "zod";
import { db, portalFeedback } from "db";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { checkRateLimit } from "@/lib/security/rate-limit";

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

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Uložení selhalo." }, { status: 500 });
  }
}
