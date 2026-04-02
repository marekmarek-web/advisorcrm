"use client";

import { useEffect, useState } from "react";
import { markPortalNotificationRead } from "@/app/actions/portal-notifications";
import type { PortalNotificationRow } from "@/app/actions/portal-notifications";
import { formatPortalNotificationBody } from "@/lib/client-portal/format-portal-notification-body";

export function ClientNotificationsList({
  initialNotifications,
}: {
  initialNotifications: PortalNotificationRow[];
}) {
  const [items, setItems] = useState<PortalNotificationRow[]>(initialNotifications);

  useEffect(() => {
    setItems(initialNotifications);
  }, [initialNotifications]);

  async function handleMarkRead(id: string) {
    await markPortalNotificationRead(id);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n))
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-monday-border bg-monday-surface p-6 text-center">
        <p className="text-monday-text-muted text-sm">
          Zatím nemáte žádná oznámení.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((n) => (
        <li
          key={n.id}
          className={`rounded-xl border border-monday-border bg-monday-surface p-4 ${
            n.readAt ? "opacity-80" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-monday-text">{n.title}</p>
              {n.body && (
                <p className="mt-1 text-sm text-monday-text-muted line-clamp-2">
                  {formatPortalNotificationBody(n.type, n.body)}
                </p>
              )}
              <p className="mt-1 text-xs text-monday-text-muted">
                {new Date(n.createdAt).toLocaleDateString("cs-CZ", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {!n.readAt && (
              <button
                type="button"
                onClick={() => handleMarkRead(n.id)}
                className="shrink-0 rounded-[var(--wp-radius-sm)] border border-monday-border bg-monday-surface px-2.5 py-1.5 text-xs font-medium text-monday-text hover:bg-monday-row-hover min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                Označit přečteno
              </button>
            )}
          </div>
          {n.relatedEntityType === "message" && n.relatedEntityId && (
            <a
              href="/client/messages"
              className="mt-2 inline-block text-sm text-monday-blue font-medium hover:underline"
            >
              Otevřít zprávy →
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
