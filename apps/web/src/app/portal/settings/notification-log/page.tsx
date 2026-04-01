import Link from "next/link";
import { getNotificationLog } from "@/app/actions/notification-log";
import { EmptyState } from "@/app/components/EmptyState";

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200",
};

export const dynamic = "force-dynamic";

export default async function NotificationLogPage() {
  let notifications: Awaited<ReturnType<typeof getNotificationLog>> = [];
  try {
    notifications = await getNotificationLog();
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

      <div className="overflow-hidden rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm">
        {notifications.length === 0 ? (
          <EmptyState
            icon="🔔"
            title="Žádné záznamy"
            description="Historie odeslaných notifikací se zobrazí zde."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
                    Datum
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
                    Příjemce
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
                    Předmět
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
                    Kanál
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
                    Stav
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
                    Kontakt
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--wp-surface-card-border)]">
                {notifications.map((n) => (
                  <tr key={n.id} className="hover:bg-[color:var(--wp-surface-muted)] transition-colors">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[color:var(--wp-text-secondary)]">
                      {new Date(n.sentAt).toLocaleString("cs-CZ", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-[color:var(--wp-text-secondary)]">{n.recipient ?? "–"}</td>
                    <td className="px-4 py-2.5 text-[color:var(--wp-text-secondary)]">{n.subject ?? "–"}</td>
                    <td className="px-4 py-2.5 capitalize text-[color:var(--wp-text-secondary)]">{n.channel}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded-[var(--wp-radius-sm)] px-2 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[n.status] ?? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)]"
                        }`}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[color:var(--wp-text-secondary)]">{n.contactName ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
