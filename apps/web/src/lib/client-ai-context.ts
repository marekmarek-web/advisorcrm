/**
 * AI-ready client context: single row from client_ai_context view.
 * Use for briefing, next best action, draft email; never pass raw document content.
 */
import { db } from "db";
import { sql } from "db";

export type ClientAiContextRow = {
  contact_id: string;
  tenant_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  household_name: string | null;
  last_analysis_at: Date | null;
  last_analysis_status: string | null;
  last_analysis_id: string | null;
  active_contracts_count: number;
  next_anniversary_date: string | null;
  last_contact_at: Date | null;
  open_opportunities_count: number;
  open_tasks_count: number;
  next_service_due: string | null;
};

/**
 * Load one row from client_ai_context for the given contact and tenant.
 * Returns null if contact does not exist or is not in tenant.
 */
export async function getClientAiContext(
  contactId: string,
  tenantId: string
): Promise<ClientAiContextRow | null> {
  const result = await db.execute(
    sql`
      SELECT
        contact_id,
        tenant_id,
        display_name,
        email,
        phone,
        household_name,
        last_analysis_at,
        last_analysis_status,
        last_analysis_id,
        active_contracts_count,
        next_anniversary_date,
        last_contact_at,
        open_opportunities_count,
        open_tasks_count,
        next_service_due
      FROM client_ai_context
      WHERE contact_id = ${contactId} AND tenant_id = ${tenantId}
      LIMIT 1
    `
  );
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
  const row = rows[0] as ClientAiContextRow | undefined;
  return row ?? null;
}
