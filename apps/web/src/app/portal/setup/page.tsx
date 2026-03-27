import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { getWorkspaceBillingSnapshot } from "@/lib/stripe/workspace-billing";
import { db, tenants, advisorPreferences } from "db";
import { eq, and } from "db";
import { SetupView } from "./SetupView";

export default async function SetupPage() {
  const auth = await requireAuth();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "";
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? null;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaCompany = typeof meta.company === "string" ? meta.company.trim() : "";
  const metaCorr = typeof meta.correspondence_address === "string" ? meta.correspondence_address.trim() : "";

  const [prefRow] = await db
    .select({ phone: advisorPreferences.phone })
    .from(advisorPreferences)
    .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
    .limit(1);

  const [tenantRow] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, auth.tenantId))
    .limit(1);
  const tenantName = tenantRow?.name ?? "—";

  /** Legacy: sídlo se dřív ukládalo do `company`; po migraci je v correspondence_address. */
  const initialCorrespondenceAddress = metaCorr || metaCompany;
  const initialNetworkCompany = metaCorr ? metaCompany || tenantName : undefined;

  const billing = await getWorkspaceBillingSnapshot({
    tenantId: auth.tenantId,
    roleName: auth.roleName,
  });

  return (
    <Suspense>
      <SetupView
        initial={{
          userId: auth.userId,
          email,
          fullName,
          roleName: auth.roleName,
          tenantName,
          billing,
          phone: prefRow?.phone ?? "",
          ico: typeof meta.ico === "string" ? meta.ico : "",
          correspondenceAddress: initialCorrespondenceAddress,
          networkCompany: initialNetworkCompany,
          publicRole: typeof meta.public_role === "string" ? meta.public_role : "",
          bio: typeof meta.bio === "string" ? meta.bio : "",
        }}
      />
    </Suspense>
  );
}
