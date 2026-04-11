import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { perfLog } from "@/lib/perf-log";
import { db } from "db";
import { tenants, roles, memberships, opportunityStages } from "db";
import { DEFAULT_TRIAL_PLAN, getTrialDurationDays } from "@/lib/billing/plan-catalog";

export type EnsureMembershipResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; redirectTo?: string };

/** Stejné výchozí fáze jako v ensureDefaultStages (pipeline.ts). */
const DEFAULT_OPPORTUNITY_STAGES = [
  { name: "Zahájeno", sortOrder: 0, probability: 0 },
  { name: "Analýza potřeb", sortOrder: 1, probability: 20 },
  { name: "Nabídka", sortOrder: 2, probability: 40 },
  { name: "Před uzavřením", sortOrder: 3, probability: 60 },
  { name: "Realizace", sortOrder: 4, probability: 80 },
  { name: "Péče a servis", sortOrder: 5, probability: 100 },
] as const;

function mapProvisionError(msg: string): string {
  if (msg.includes("relation") && msg.includes("does not exist")) {
    return "V databázi chybí tabulky. V repozitáři spusť: pnpm db:apply-schema (s DATABASE_URL na tento Supabase projekt).";
  }
  if (msg.includes("connection") || msg.includes("ECONNREFUSED") || msg.includes("timeout")) {
    return "Nepodařilo se připojit k databázi. Zkontrolujte DATABASE_URL na Vercelu a že Supabase projekt běží.";
  }
  if (msg.includes("authentication") || msg.includes("password")) {
    return "Chyba přihlášení k databázi. Zkontrolujte heslo v DATABASE_URL na Vercelu.";
  }
  if (msg.includes("SUPABASE") || msg.includes("supabase") || msg.includes("NEXT_PUBLIC")) {
    return "Chybí nebo je špatně nastavená proměnná Supabase (NEXT_PUBLIC_SUPABASE_URL a anon nebo publishable klíč).";
  }
  if (msg.includes("DATABASE_URL")) {
    return "Na Vercelu v Environment Variables přidej DATABASE_URL (celý connection string z Supabase → Database).";
  }
  if (msg.includes("MaxClients") || msg.includes("max clients") || msg.toLowerCase().includes("pool")) {
    return "Server je momentálně přetížen. Zkuste to za minutu znovu.";
  }
  return msg || "Nepodařilo se dokončit registraci.";
}

/**
 * Po prvním přihlášení vytvoří tenant, role, membership a výchozí pipeline fáze.
 * Volitelně z server component (redirect) i ze server action.
 */
export async function provisionWorkspaceIfNeeded(): Promise<EnsureMembershipResult> {
  const t0 = Date.now();
  try {
    let supabase;
    try {
      supabase = await createClient();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      perfLog("ensureMembership", t0);
      return { ok: false, error: m || "Chyba připojení k Supabase." };
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      perfLog("ensureMembership", t0);
      return { ok: false, error: "Nejprve se přihlaste.", redirectTo: "/" };
    }
    const existing = await getMembership(user.id);
    if (existing) {
      const redirectTo = existing.roleName === "Client" ? "/client" : "/portal/today";
      perfLog("ensureMembership", t0);
      return { ok: true, redirectTo };
    }

    const email = user.email ?? "";
    const slug =
      email.replace(/@.*/, "").replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 20) || "workspace";

    const trialStartedAt = new Date();
    const trialEndsAt = new Date(
      trialStartedAt.getTime() + getTrialDurationDays() * 86_400_000
    );

    await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants as any)
        .values({
          name: "Můj workspace",
          slug: slug + "-" + Math.random().toString(36).slice(2, 8),
          trialStartedAt,
          trialEndsAt,
          trialPlanKey: DEFAULT_TRIAL_PLAN,
        })
        .returning({ id: tenants.id, slug: tenants.slug } as any);
      if (!tenant) throw new Error("Nepodařilo se vytvořit workspace.");

      const roleRows = await tx
        .insert(roles as any)
        .values([
          { tenantId: tenant.id, name: "Admin" },
          { tenantId: tenant.id, name: "Advisor" },
          { tenantId: tenant.id, name: "Manager" },
          { tenantId: tenant.id, name: "Director" },
          { tenantId: tenant.id, name: "Viewer" },
          { tenantId: tenant.id, name: "Client" },
        ])
        .returning({ id: roles.id, name: roles.name } as any);

      const adminRole = roleRows.find((r: any) => r?.name === "Admin");
      if (!adminRole) throw new Error("Nepodařilo se vytvořit roli.");

      await tx.insert(memberships as any).values({
        tenantId: tenant.id,
        userId: user.id,
        roleId: adminRole.id,
      });

      await tx.insert(opportunityStages as any).values(
        DEFAULT_OPPORTUNITY_STAGES.map((s) => ({
          tenantId: tenant.id,
          name: s.name,
          sortOrder: s.sortOrder,
          probability: s.probability,
        })),
      );
    });

    perfLog("ensureMembership", t0);
    return { ok: true, redirectTo: "/portal/today" };
  } catch (e) {
    perfLog("ensureMembership", t0);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: mapProvisionError(msg) };
  }
}
