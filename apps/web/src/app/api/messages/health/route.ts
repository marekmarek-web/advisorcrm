import { NextResponse } from "next/server";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "@/lib/db";
import { sql } from "db";

/**
 * GET /api/messages/health — diagnostika: existují tabulky messages a message_attachments?
 * Přístupné pouze přihlášenému uživateli (advisor nebo client).
 * Vrátí JSON s přesnými chybami, aby bylo jasné co v Supabase chybí.
 */
export async function GET() {
  try {
    await requireAuthInAction();
  } catch {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }

  const checks: Record<string, string> = {};

  for (const table of ["messages", "message_attachments"] as const) {
    try {
      await db.execute(sql.raw(`SELECT 1 FROM ${table} LIMIT 1`));
      checks[table] = "OK";
    } catch (e) {
      checks[table] = e instanceof Error ? e.message : String(e);
    }
  }

  const allOk = Object.values(checks).every((v) => v === "OK");
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
