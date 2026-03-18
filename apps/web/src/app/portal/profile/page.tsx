import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { db, tenants, advisorPreferences, memberships } from "db";
import { eq, and } from "db";
import { AdvisorProfileView } from "./AdvisorProfileView";
import { listSupervisorOptions, type SupervisorOption } from "@/app/actions/auth";

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

const FALLBACK_INITIAL = {
  email: "",
  fullName: null as string | null,
  roleName: "—",
  tenantName: "—",
  phone: "",
  website: "",
  reportLogoUrl: null as string | null,
  currentSupervisorId: null as string | null,
  supervisorOptions: [] as SupervisorOption[],
};

export default async function ProfilePage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>;
  try {
    auth = await requireAuth();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return (
      <AdvisorProfileView initial={FALLBACK_INITIAL} isFallback />
    );
  }

  let initial = {
    ...FALLBACK_INITIAL,
    roleName: auth.roleName,
  };
  let isFallback = false;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email ?? "";
    const fullName = (user?.user_metadata?.full_name as string | undefined) ?? null;

    const [tenantRow] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, auth.tenantId))
      .limit(1);
    const tenantName = tenantRow?.name ?? "—";

    const [prefsRow] = await db
      .select({
        phone: advisorPreferences.phone,
        website: advisorPreferences.website,
        reportLogoUrl: advisorPreferences.reportLogoUrl,
      })
      .from(advisorPreferences)
      .where(
        and(
          eq(advisorPreferences.tenantId, auth.tenantId),
          eq(advisorPreferences.userId, auth.userId)
        )
      )
      .limit(1);
    const [membershipRow] = await db
      .select({ parentId: memberships.parentId })
      .from(memberships)
      .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.userId, auth.userId)))
      .limit(1);
    const supervisorOptions = await listSupervisorOptions().catch(() => []);

    initial = {
      email,
      fullName,
      roleName: auth.roleName,
      tenantName,
      phone: prefsRow?.phone ?? "",
      website: prefsRow?.website ?? "",
      reportLogoUrl: prefsRow?.reportLogoUrl ?? null,
      currentSupervisorId: membershipRow?.parentId ?? null,
      supervisorOptions,
    };
  } catch {
    isFallback = true;
    initial = { ...initial, roleName: auth.roleName };
  }

  return (
    <AdvisorProfileView
      initial={initial}
      isFallback={isFallback}
    />
  );
}
