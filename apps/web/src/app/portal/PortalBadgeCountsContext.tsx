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
import { getPortalShellBadgeCounts } from "@/app/actions/portal-badges";

const REFRESH_MS = 60_000;

export type PortalBadgeCountsValue = {
  openTasks: number | null;
  unreadConversations: number | null;
  notifications: number | null;
  refresh: () => void;
};

const PortalBadgeCountsContext = createContext<PortalBadgeCountsValue | null>(null);

export function PortalBadgeCountsProvider({ children }: { children: ReactNode }) {
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [unreadConversations, setUnreadConversations] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<number | null>(null);
  const mounted = useRef(true);

  const load = useCallback(() => {
    void getPortalShellBadgeCounts()
      .then((c) => {
        if (!mounted.current) return;
        setOpenTasks(c.openTasks);
        setUnreadConversations(c.unreadConversations);
        setNotifications(c.notifications);
      })
      .catch(() => {
        if (!mounted.current) return;
        setOpenTasks(0);
        setUnreadConversations(0);
        setNotifications(0);
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onAnyRefresh = () => load();
    window.addEventListener("portal-messages-badge-refresh", onAnyRefresh);
    window.addEventListener("portal-tasks-badge-refresh", onAnyRefresh);
    window.addEventListener("portal-notifications-badge-refresh", onAnyRefresh);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
      window.removeEventListener("portal-messages-badge-refresh", onAnyRefresh);
      window.removeEventListener("portal-tasks-badge-refresh", onAnyRefresh);
      window.removeEventListener("portal-notifications-badge-refresh", onAnyRefresh);
    };
  }, [load]);

  const value = useMemo<PortalBadgeCountsValue>(
    () => ({
      openTasks,
      unreadConversations,
      notifications,
      refresh: load,
    }),
    [openTasks, unreadConversations, notifications, load]
  );

  return (
    <PortalBadgeCountsContext.Provider value={value}>{children}</PortalBadgeCountsContext.Provider>
  );
}

export function usePortalBadgeCounts(): PortalBadgeCountsValue {
  const v = useContext(PortalBadgeCountsContext);
  if (!v) throw new Error("usePortalBadgeCounts must be used within PortalBadgeCountsProvider");
  return v;
}

/** Když komponenta může být mimo provider (např. storybook), vrátí null. */
export function usePortalBadgeCountsOptional(): PortalBadgeCountsValue | null {
  return useContext(PortalBadgeCountsContext);
}
