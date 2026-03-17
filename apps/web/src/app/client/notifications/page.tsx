import { requireAuth } from "@/lib/auth/require-auth";
import { getPortalNotificationsForClient } from "@/app/actions/portal-notifications";
import { ClientNotificationsList } from "./ClientNotificationsList";

export default async function ClientNotificationsPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const notifications = await getPortalNotificationsForClient();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-monday-text">
        Oznámení
      </h1>
      <p className="text-sm text-monday-text-muted">
        Nové zprávy od poradce, změny stavu požadavků a další upozornění.
      </p>
      <ClientNotificationsList initialNotifications={notifications} />
    </div>
  );
}
