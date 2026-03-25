import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";

const USER_ID_HEADER = "x-user-id";

export type CalendarAuth = { userId: string; tenantId: string };

/**
 * Get authenticated user for calendar API routes (middleware sets x-user-id or we use Supabase).
 * Returns 401/403 response or the auth context.
 * @param request - Request object
 * @param options.requireWrite - If false, allows roles with only events:read (e.g. status endpoint). Default true (events:*).
 */
export async function getCalendarAuth(
  request: Request,
  options?: { requireWrite?: boolean }
): Promise<{ ok: true; auth: CalendarAuth } | { ok: false; response: Response }> {
  let userId: string | null = request.headers.get(USER_ID_HEADER);
  if (!userId) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } }) };
    }
    userId = user.id;
  }
  const membership = await getMembership(userId);
  if (!membership) {
    return { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } }) };
  }
  const canAccess = options?.requireWrite === false
    ? hasPermission(membership.roleName as RoleName, "events:read") || hasPermission(membership.roleName as RoleName, "events:*")
    : hasPermission(membership.roleName as RoleName, "events:*");
  if (!canAccess) {
    return { ok: false, response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } }) };
  }
  return { ok: true, auth: { userId, tenantId: membership.tenantId } };
}

/**
 * Map getValidAccessToken / calendar token errors to a consistent JSON response.
 * Returns NextResponse or null if the error is not a known token error.
 */
export function calendarTokenErrorResponse(e: unknown): NextResponse | null {
  const code = (e as Error & { code?: string }).code;
  if (code === "not_connected") {
    return NextResponse.json(
      {
        error:
          "Google Kalendář není propojen. Přejděte do Nastavení -> Integrace a u položky Google Calendar klikněte na 'Připojit Google účet'.",
      },
      { status: 400 }
    );
  }
  if (code === "refresh_failed") {
    return NextResponse.json({ error: "Obnovení tokenu selhalo" }, { status: 502 });
  }
  if (code === "decrypt_failed") {
    return NextResponse.json({ error: "Chyba tokenu" }, { status: 500 });
  }
  if (code === "encryption_failed") {
    return NextResponse.json(
      { error: "Chyba konfigurace serveru (šifrování). Kontaktujte správce." },
      { status: 500 }
    );
  }
  return null;
}
