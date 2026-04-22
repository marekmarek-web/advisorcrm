"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPortalNotificationsForClient, markPortalNotificationRead } from "@/app/actions/portal-notifications";
import { getPortalNotificationDeepLink } from "@/lib/client-portal/portal-notification-routing";
import { X } from "lucide-react";

type ToastItem = { id: string; notificationId: string; title: string; href: string };

const TOAST_SHOWN_STORAGE_KEY = "aidv.clientPortal.materialRequestToast.shownIds";

/** Informativní stav — už je na přehledu v kartě „Aktuálně k řešení“; toast jen zdvojoval pozornost. */
const NO_TOAST_ADVISOR_MATERIAL_TITLES = new Set([
  "Požadavek splněn",
  "Požadavek uzavřen",
]);

function readStoredToastIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(TOAST_SHOWN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function persistToastIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(
      TOAST_SHOWN_STORAGE_KEY,
      JSON.stringify([...ids].slice(-120)),
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * Toast pro klienta při nové nepřečtené notifikaci od poradce.
 *
 * Scope (v1 conscious decision): zobrazuje pouze `advisor_material_request` notifikace.
 * Ostatní typy (new_message, new_document, request_status_change) se zobrazují
 * pouze přes bell badge a stránku /client/notifications — toast je určen
 * pro "immediate action required" požadavky, kde klient potřebuje okamžitou akci.
 *
 * Polling: 35 s interval je vědomé v1 release rozhodnutí. Nahradit WebSocket/SSE
 * push delivery v případě, že by polling způsoboval zjevné problémy (latence, load).
 *
 * Deep-link routing: používá sdílenou `getPortalNotificationDeepLink` —
 * stejný zdroj jako bell, toast a notifications page.
 */
export function ClientMaterialRequestToastStack() {
  const router = useRouter();
  const shownRef = useRef<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((localId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== localId));
  }, []);

  const poll = useCallback(async () => {
    try {
      const list = await getPortalNotificationsForClient();
      for (const n of list) {
        if (n.type !== "advisor_material_request" || n.readAt) continue;
        if (NO_TOAST_ADVISOR_MATERIAL_TITLES.has(n.title)) continue;
        if (shownRef.current.has(n.id)) continue;
        shownRef.current.add(n.id);
        persistToastIds(shownRef.current);
        const href = getPortalNotificationDeepLink(n);
        if (!href) continue;
        setToasts((prev) => {
          if (prev.some((t) => t.notificationId === n.id)) return prev;
          return [
            ...prev.slice(-4),
            {
              id: `local-${n.id}`,
              notificationId: n.id,
              title: n.title,
              href,
            },
          ];
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    for (const id of readStoredToastIds()) {
      shownRef.current.add(id);
    }
    void poll();
    const t = window.setInterval(() => void poll(), 35_000);
    return () => window.clearInterval(t);
  }, [poll]);

  async function openAndRead(toast: ToastItem) {
    try {
      await markPortalNotificationRead(toast.notificationId);
    } catch {
      /* best-effort */
    }
    router.push(toast.href);
    dismiss(toast.id);
  }

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white p-4 shadow-xl"
        >
          <div className="flex justify-between gap-2">
            <p className="text-sm font-bold text-[color:var(--wp-text)]">{t.title}</p>
            <button
              type="button"
              className="shrink-0 rounded-lg p-1 text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-main-scroll-bg)]"
              aria-label="Zavřít"
              onClick={() => dismiss(t.id)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void openAndRead(t)}
              className="min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white"
            >
              Otevřít
            </button>
            <Link
              href={t.href}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 text-sm font-bold text-[color:var(--wp-text)]"
              onClick={() => dismiss(t.id)}
            >
              Zobrazit
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
