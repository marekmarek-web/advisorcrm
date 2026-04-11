import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/require-auth";
import type { WorkspaceBillingSnapshot } from "@/lib/stripe/billing-types";
import { getEffectiveAccessContextForTenant } from "@/lib/entitlements";
import { getWorkspaceBillingSnapshot } from "@/lib/stripe/workspace-billing";
import { db, tenants, advisorPreferences, memberships } from "db";
import { eq, and } from "db";
import { AdvisorProfileView, type AdvisorProfileInitial } from "./AdvisorProfileView";
import { listSupervisorOptions, type SupervisorOption } from "@/app/actions/auth";
import { getPublicBookingSettings } from "@/app/actions/public-booking-settings";
import type { PublicBookingSettingsDTO } from "@/app/actions/public-booking-settings";

const EMPTY_PUBLIC_BOOKING: PublicBookingSettingsDTO = {
  publicBookingEnabled: false,
  publicBookingToken: null,
  bookingSlotMinutes: 30,
  bookingBufferMinutes: 0,
  bookingAvailability: null,
};

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

const FALLBACK_INITIAL: AdvisorProfileInitial = {
  email: "",
  fullName: null as string | null,
  roleName: "—",
  tenantName: "—",
  phone: "",
  website: "",
  reportContactEmail: "",
  reportLogoUrl: null as string | null,
  currentSupervisorId: null as string | null,
  supervisorOptions: [] as SupervisorOption[],
  billing: undefined as WorkspaceBillingSnapshot | undefined,
  internalAdminAccessBadge: false,
  publicBooking: EMPTY_PUBLIC_BOOKING,
  canonicalBaseUrl: "",
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
        reportContactEmail: advisorPreferences.reportContactEmail,
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

    const [billing, publicBooking, accessCtx] = await Promise.all([
      getWorkspaceBillingSnapshot({
        tenantId: auth.tenantId,
        roleName: auth.roleName,
      }),
      getPublicBookingSettings(),
      getEffectiveAccessContextForTenant({
        tenantId: auth.tenantId,
        userId: auth.userId,
        email,
      }),
    ]);
    const canonicalBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

    initial = {
      email,
      fullName,
      roleName: auth.roleName,
      tenantName,
      phone: prefsRow?.phone ?? "",
      website: prefsRow?.website ?? "",
      reportContactEmail: prefsRow?.reportContactEmail ?? "",
      reportLogoUrl: prefsRow?.reportLogoUrl ?? null,
      currentSupervisorId: membershipRow?.parentId ?? null,
      supervisorOptions,
      billing,
      internalAdminAccessBadge: accessCtx.source === "internal_admin",
      publicBooking,
      canonicalBaseUrl,
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
