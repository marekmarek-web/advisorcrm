import { createClient } from "@/lib/supabase/server";
import { getMembership, hasPermission, type RoleName } from "@/lib/auth/get-membership";

const USER_ID_HEADER = "x-user-id";

export type IntegrationAuth = { userId: string; tenantId: string };

/**
 * Auth pro integration routes: buď x-user-id z middleware, nebo Supabase session.
 * Vyžaduje oprávnění events:* (kalendář).
 */
export async function getIntegrationAuth(
  request: Request
): Promise<{ ok: true; auth: IntegrationAuth } | { ok: false; response: Response }> {
  let userId: string | null = request.headers.get(USER_ID_HEADER);
  if (!userId) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    userId = user.id;
  }
  const membership = await getMembership(userId);
  if (!membership || !hasPermission(membership.roleName as RoleName, "events:*")) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { ok: true, auth: { userId, tenantId: membership.tenantId } };
}
