"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileText,
  MessageSquare,
} from "lucide-react";
import { markPortalNotificationRead } from "@/app/actions/portal-notifications";
import type { PortalNotificationRow } from "@/app/actions/portal-notifications";
import { formatPortalNotificationBody } from "@/lib/client-portal/format-portal-notification-body";
import {
  getPortalNotificationDeepLink,
  getPortalNotificationDeepLinkWithFallback,
} from "@/lib/client-portal/portal-notification-routing";

export function getNotificationRoute(n: { type: string; relatedEntityId?: string | null }): string | null {
  return getPortalNotificationDeepLink(n);
}

function getIcon(type: string) {
  if (type === "new_message") return MessageSquare;
  if (type === "new_document") return FileText;
  if (type === "advisor_material_request") return ClipboardList;
  if (type === "request_status_change") return CheckCircle2;
  if (type === "important_date") return Calendar;
  return Bell;
}

export function ClientNotificationsList({
  initialNotifications,
}: {
  initialNotifications: PortalNotificationRow[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<PortalNotificationRow[]>(initialNotifications);
  const [toast, setToast] = useState<string | null>(null);

  async function handleClick(item: PortalNotificationRow) {
    if (!item.readAt) {
      try {
        await markPortalNotificationRead(item.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[ClientNotificationsList] markRead failed", e);
      }
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date() } : n))
      );
    }
    // B1.7: vždy naviguj — u neznámých typů vede fallback na /client/notifications
    // s toastem, místo tichého „nic se nestalo“ po kliku.
    const { route, known } = getPortalNotificationDeepLinkWithFallback(item);
    if (!known) {
      setToast("Tato akce již není dostupná nebo má nový formát. Kontaktujte poradce.");
      setTimeout(() => setToast(null), 4000);
      return;
    }
    router.push(route);
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-10 text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[color:var(--wp-surface-muted)] grid place-items-center text-[color:var(--wp-text-tertiary)]">
          <Bell size={22} />
        </div>
        <p className="font-semibold text-[color:var(--wp-text)]">Žádná oznámení</p>
        <p className="text-sm text-[color:var(--wp-text-secondary)] max-w-sm mx-auto">
          Nové zprávy, dokumenty a požadavky od poradce se zobrazí zde.
        </p>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <div
          role="status"
          className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {toast}
        </div>
      )}
    <ul className="space-y-2">
      {items.map((n) => {
        const route = getNotificationRoute(n);
        const isUnread = !n.readAt;
        const Icon = getIcon(n.type);
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => handleClick(n)}
              className={`w-full text-left rounded-xl border shadow-sm p-4 transition-all hover:shadow-md ${
                isUnread
                  ? "bg-indigo-50/60 border-indigo-200 hover:border-indigo-300"
                  : "bg-white border-[color:var(--wp-surface-card-border)] hover:border-[color:var(--wp-surface-card-border)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`shrink-0 mt-0.5 w-10 h-10 rounded-xl border grid place-items-center ${
                    isUnread
                      ? "bg-indigo-100 border-indigo-200 text-indigo-600"
                      : "bg-[color:var(--wp-surface-muted)] border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className={`font-bold text-sm leading-snug ${isUnread ? "text-[color:var(--wp-text)]" : "text-[color:var(--wp-text)]"}`}>
                      {n.title}
                    </p>
                    {isUnread && (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-indigo-500 mt-1" />
                    )}
                  </div>
                  {n.body && (
                    <p className="text-sm text-[color:var(--wp-text-secondary)] line-clamp-2 mt-0.5">
                      {formatPortalNotificationBody(n.type, n.body)}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <p className="text-xs text-[color:var(--wp-text-tertiary)]">
                      {new Date(n.createdAt).toLocaleDateString("cs-CZ", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {route && (
                      <span className="text-xs font-bold text-indigo-600">Otevřít →</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
    </>
  );
}
