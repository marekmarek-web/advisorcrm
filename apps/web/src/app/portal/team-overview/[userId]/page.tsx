import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { getTeamMemberDetail } from "@/app/actions/team-overview";
import { TeamMemberDetailView } from "./TeamMemberDetailView";

export const dynamic = "force-dynamic";

export default async function TeamMemberDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) {
    redirect("/portal");
  }

  const { userId } = await params;
  const detail = await getTeamMemberDetail(userId).catch(() => null);
  if (!detail) notFound();

  return (
    <div className="min-h-screen bg-[var(--wp-bg)]">
      <div className="mx-auto max-w-5xl px-3 sm:px-6 lg:px-8 py-6 md:py-8">
        <Link
          href="/portal/team-overview"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-indigo-600 mb-6"
        >
          ← Zpět na Týmový přehled
        </Link>
        <TeamMemberDetailView detail={detail} />
      </div>
    </div>
  );
}
