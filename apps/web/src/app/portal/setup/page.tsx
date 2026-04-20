import { Suspense } from "react";
import { requireAuth, getCachedSupabaseUser } from "@/lib/auth/require-auth";
import { getWorkspaceBillingSnapshot } from "@/lib/stripe/workspace-billing";
import { listSupervisorOptions } from "@/app/actions/auth";
import { db, tenants, advisorPreferences, memberships } from "db";
import { eq, and } from "db";
import { SetupView } from "./SetupView";
import { getPublicBookingSettings } from "@/app/actions/public-booking-settings";
import { getFundLibrarySetupSnapshot } from "@/lib/fund-library/setup-snapshot.server";
import type { RoleName } from "@/shared/rolePermissions";

export default async function SetupPage() {
  const auth = await requireAuth();

  const [user, prefRows, tenantRows, membershipRows, publicBooking, fundLibrarySnapshot, supervisorOptions] =
    await Promise.all([
      getCachedSupabaseUser(),
      db
        .select({ phone: advisorPreferences.phone })
        .from(advisorPreferences)
        .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
        .limit(1),
      db
        .select({ name: tenants.name, stripeCustomerId: tenants.stripeCustomerId })
        .from(tenants)
        .where(eq(tenants.id, auth.tenantId))
        .limit(1),
      db
        .select({ parentId: memberships.parentId })
        .from(memberships)
        .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.userId, auth.userId)))
        .limit(1),
      getPublicBookingSettings(),
      getFundLibrarySetupSnapshot(auth.tenantId, auth.userId, auth.roleName as RoleName),
      listSupervisorOptions().catch(() => []),
    ]);

  const [tenantRow] = tenantRows;
  // Pass stripeCustomerId so billing can skip its own tenant round-trip.
  const billing = await getWorkspaceBillingSnapshot({
    tenantId: auth.tenantId,
    roleName: auth.roleName,
    stripeCustomerId: tenantRow?.stripeCustomerId ?? null,
  });

  const canonicalBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  const email = user?.email ?? "";
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? null;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaCompany = typeof meta.company === "string" ? meta.company.trim() : "";
  const metaCorr = typeof meta.correspondence_address === "string" ? meta.correspondence_address.trim() : "";

  const [prefRow] = prefRows;
  const [membershipRow] = membershipRows;
  const tenantName = tenantRow?.name ?? "—";

  /** Legacy: sídlo se dřív ukládalo do `company`; po migraci je v correspondence_address. */
  const initialCorrespondenceAddress = metaCorr || metaCompany;
  const initialNetworkCompany = metaCorr ? metaCompany || tenantName : undefined;

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
          publicBooking,
          canonicalBaseUrl,
          fundLibrarySnapshot,
          currentSupervisorId: membershipRow?.parentId ?? null,
          supervisorOptions,
        }}
      />
    </Suspense>
  );
}
