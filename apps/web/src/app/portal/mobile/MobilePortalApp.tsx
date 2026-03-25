import { getCachedMembership, getCachedSupabaseUser } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/lib/auth/get-membership";
import { Suspense } from "react";
import { MobilePortalClientLoader } from "./MobilePortalClientLoader";

export async function MobilePortalApp({ showTeamOverview = true }: { showTeamOverview?: boolean }) {
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
        <div className="min-h-[100dvh] flex flex-col bg-slate-50">
          <div className="px-4 pt-[var(--safe-area-top)] pb-2 border-b border-slate-200 bg-white">
            <div className="h-10 w-40 rounded-lg bg-slate-100 animate-pulse" />
          </div>
          <div className="flex-1 p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-200/70 animate-pulse" />
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
      />
    </Suspense>
  );
}
