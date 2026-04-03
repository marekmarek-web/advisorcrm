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
import { getPortalNotificationDeepLink } from "@/lib/client-portal/portal-notification-routing";

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

  async function handleClick(item: PortalNotificationRow) {
    if (!item.readAt) {
      await markPortalNotificationRead(item.id);
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date() } : n))
      );
    }
    const route = getNotificationRoute(item);
    if (route) router.push(route);
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-10 text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">
          <Bell size={22} />
        </div>
        <p className="font-semibold text-slate-700">Žádná oznámení</p>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Nové zprávy, dokumenty a požadavky od poradce se zobrazí zde.
        </p>
      </div>
    );
  }

  return (
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
              className={`w-full text-left rounded-[20px] border shadow-sm p-4 transition-all hover:shadow-md ${
                isUnread
                  ? "bg-indigo-50/60 border-indigo-200 hover:border-indigo-300"
                  : "bg-white border-slate-100 hover:border-slate-200 opacity-80"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`shrink-0 mt-0.5 w-10 h-10 rounded-xl border grid place-items-center ${
                    isUnread
                      ? "bg-indigo-100 border-indigo-200 text-indigo-600"
                      : "bg-slate-100 border-slate-200 text-slate-500"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className={`font-bold text-sm leading-snug ${isUnread ? "text-slate-900" : "text-slate-700"}`}>
                      {n.title}
                    </p>
                    {isUnread && (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-indigo-500 mt-1" />
                    )}
                  </div>
                  {n.body && (
                    <p className="text-sm text-slate-500 line-clamp-2 mt-0.5">
                      {formatPortalNotificationBody(n.type, n.body)}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <p className="text-xs text-slate-400">
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
  );
}
