"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** Záloha, když Realtime neběží nebo není nasazená migrace. */
const POLL_MS = 45_000;
const ADVISOR_TOAST_TYPES = "client_portal_request,client_material_response";

export type AdvisorInAppNotificationRow = {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  body: string | null;
  severity: string;
  targetUserId: string;
  channels: unknown;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  status: string;
  groupKey: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
};

type AdvisorInAppNotificationsContextValue = {
  items: AdvisorInAppNotificationRow[];
  unreadCount: number;
  loading: boolean;
  refresh: () => void;
  markRead: (notificationId: string) => Promise<boolean>;
  markAllRead: () => Promise<boolean>;
};

const AdvisorInAppNotificationsContext = createContext<AdvisorInAppNotificationsContextValue | null>(null);

async function fetchNotifications(): Promise<AdvisorInAppNotificationRow[]> {
  const res = await fetch(
    `/api/notifications?limit=50&types=${encodeURIComponent(ADVISOR_TOAST_TYPES)}`,
    { credentials: "same-origin", cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: AdvisorInAppNotificationRow[] };
  return Array.isArray(data.items) ? data.items : [];
}

export function AdvisorInAppNotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AdvisorInAppNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const next = await fetchNotifications();
      if (!mounted.current) return;
      setItems(next);
    } catch {
      if (!mounted.current) return;
      setItems([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onBadgeRefresh = () => void load();
    window.addEventListener("portal-notifications-badge-refresh", onBadgeRefresh);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
      window.removeEventListener("portal-notifications-badge-refresh", onBadgeRefresh);
    };
  }, [load]);

  /** Okamžité obnovení po INSERTu in-app notifikace (Supabase Realtime + RLS na advisor_notifications). */
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!url) return;

    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id || cancelled) return;

      const ch = supabase
        .channel(`advisor-notifications-rt-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "advisor_notifications",
            filter: `target_user_id=eq.${user.id}`,
          },
          () => {
            if (!mounted.current) return;
            void load();
          }
        );
      if (cancelled) return;
      channel = ch.subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [load]);

  const unreadCount = useMemo(
    () => items.filter((i) => i.status === "unread").length,
    [items]
  );

  const refresh = useCallback(() => {
    void load();
    try {
      window.dispatchEvent(new CustomEvent("portal-notifications-badge-refresh"));
    } catch {
      /* ignore */
    }
  }, [load]);

  const markRead = useCallback(async (notificationId: string) => {
    try {
      const res = await fetch("/api/notifications/mark-read", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) {
        setItems((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, status: "read", readAt: new Date().toISOString() }
              : n
          )
        );
        window.dispatchEvent(new CustomEvent("portal-notifications-badge-refresh"));
      }
      return !!data.ok;
    } catch {
      return false;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          types: ADVISOR_TOAST_TYPES.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) {
        setItems((prev) =>
          prev.map((n) =>
            n.status === "unread"
              ? { ...n, status: "read", readAt: new Date().toISOString() }
              : n
          )
        );
        window.dispatchEvent(new CustomEvent("portal-notifications-badge-refresh"));
      }
      return !!data.ok;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<AdvisorInAppNotificationsContextValue>(
    () => ({
      items,
      unreadCount,
      loading,
      refresh,
      markRead,
      markAllRead,
    }),
    [items, unreadCount, loading, refresh, markRead, markAllRead]
  );

  return (
    <AdvisorInAppNotificationsContext.Provider value={value}>{children}</AdvisorInAppNotificationsContext.Provider>
  );
}

export function useAdvisorInAppNotifications(): AdvisorInAppNotificationsContextValue {
  const v = useContext(AdvisorInAppNotificationsContext);
  if (!v) {
    throw new Error("useAdvisorInAppNotifications must be used within AdvisorInAppNotificationsProvider");
  }
  return v;
}

export function useAdvisorInAppNotificationsOptional(): AdvisorInAppNotificationsContextValue | null {
  return useContext(AdvisorInAppNotificationsContext);
}
