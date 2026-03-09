import { getNotificationLog } from "@/app/actions/notification-log";
import { EmptyState } from "@/app/components/EmptyState";

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
};

export default async function NotificationsPage() {
  const notifications = await getNotificationLog();

  return (
    <div className="p-4 space-y-4 wp-fade-in">
      <h1 className="text-lg font-semibold text-slate-800">Notifikace</h1>
      <p className="text-slate-500 text-sm">
        Přehled odeslaných e-mailů a notifikací.
      </p>

      <div className="rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white overflow-hidden shadow-sm">
        {notifications.length === 0 ? (
          <EmptyState
            icon="🔔"
            title="Žádné notifikace"
            description="Historie odeslaných notifikací se zobrazí zde."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Datum</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Příjemce</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Předmět</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Kanál</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Kontakt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                      {new Date(n.sentAt).toLocaleString("cs-CZ", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{n.recipient ?? "–"}</td>
                    <td className="px-4 py-2.5 text-slate-700">{n.subject ?? "–"}</td>
                    <td className="px-4 py-2.5 text-slate-700 capitalize">{n.channel}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-[var(--wp-radius-sm)] text-xs font-medium ${STATUS_COLORS[n.status] ?? "bg-slate-100 text-slate-800"}`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{n.contactName ?? "–"}</td>
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
