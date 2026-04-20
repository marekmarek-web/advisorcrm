export const dynamic = "force-dynamic";

/**
 * Legacy `/dashboard/**` tree — canonical home is `/portal/**`. We no longer
 * swallow every nested route to `/portal/today` here because that made
 * contacts / households / pipeline deep links unreachable (calculator history
 * CTA, saved bookmarks). Root redirect is handled at `dashboard/page.tsx`.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
