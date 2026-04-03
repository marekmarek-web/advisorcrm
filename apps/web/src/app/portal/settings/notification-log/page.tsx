import Link from "next/link";
import { getNotificationLog, getNotificationLogStats } from "@/app/actions/notification-log";
import { EmptyState } from "@/app/components/EmptyState";
import { NotificationLogClient } from "./NotificationLogClient";

export const dynamic = "force-dynamic";

export default async function NotificationLogPage() {
  let notifications: Awaited<ReturnType<typeof getNotificationLog>> = [];
  let stats: Awaited<ReturnType<typeof getNotificationLogStats>> = { sent: 0, failed: 0, pending: 0, total: 0 };

  try {
    [notifications, stats] = await Promise.all([
      getNotificationLog({ limit: 200 }),
      getNotificationLogStats(),
    ]);
  } catch {
    notifications = [];
  }

  return (
    <div className="space-y-4 p-4 wp-fade-in md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Historie odeslaných e-mailů</h1>
          <p className="text-sm text-[color:var(--wp-text-secondary)]">
            Přehled systémových e-mailů a kanálů (odlišné od klientských požadavků v inboxu).
          </p>
        </div>
        <Link
          href="/portal/notifications"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 text-sm font-semibold text-indigo-600 hover:bg-[color:var(--wp-link-hover-bg)]"
        >
          ← Klientské požadavky
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Celkem (30d)", value: stats.total, color: "text-[color:var(--wp-text)]" },
          { label: "Odesláno", value: stats.sent, color: "text-emerald-600" },
          { label: "Selhalo", value: stats.failed, color: "text-red-600" },
          { label: "Čeká", value: stats.pending, color: "text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-secondary)]">{s.label}</p>
            <p className={`mt-1 text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <NotificationLogClient initialRows={notifications} />
    </div>
  );
}
