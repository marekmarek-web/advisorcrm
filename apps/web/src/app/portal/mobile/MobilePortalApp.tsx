import { getCachedMembership, getCachedSupabaseUser } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";
import { Suspense } from "react";
import { MobilePortalClientLoader } from "./MobilePortalClientLoader";

export async function MobilePortalApp({
  showTeamOverview = true,
  tenantId,
}: {
  showTeamOverview?: boolean;
  tenantId: string;
}) {
  const user = await getCachedSupabaseUser();
  const advisorName = (user?.user_metadata?.full_name as string | undefined) ?? "Poradce";

  let canWriteCalendar = true;
  let roleName: RoleName = "Advisor";
  if (user?.id) {
    const membership = await getCachedMembership(user.id);
    if (membership?.roleName) roleName = membership.roleName as RoleName;
    canWriteCalendar = membership
      ? hasPermission(membership.roleName as RoleName, "contacts:write")
      : false;
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] flex-col bg-[color:var(--wp-app-canvas-bg)]">
          <div className="px-4 pt-[var(--safe-area-top)] pb-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]">
            <div className="h-10 w-40 rounded-lg bg-[color:var(--wp-surface-muted)] animate-pulse" />
          </div>
          <div className="flex-1 p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <MobilePortalClientLoader
        advisorName={advisorName}
        showTeamOverview={showTeamOverview}
        canWriteCalendar={canWriteCalendar}
        roleName={roleName}
        tenantId={tenantId}
      />
    </Suspense>
  );
}
