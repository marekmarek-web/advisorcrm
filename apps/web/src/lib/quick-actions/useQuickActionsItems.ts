"use client";

import { useEffect, useMemo, useState } from "react";
import { getQuickActionsConfig } from "@/app/actions/preferences";
import {
  QUICK_ACTIONS_CATALOG,
  DEFAULT_QUICK_ACTIONS_ORDER,
  getDefaultQuickActionsConfig,
} from "@/lib/quick-actions";
import type { QuickActionId, QuickActionItem } from "@/lib/quick-actions";

type QuickActionsShape = ReturnType<typeof getDefaultQuickActionsConfig>;

function normalizeQuickActionsConfig(c: QuickActionsShape): {
  order: QuickActionId[];
  visible: Record<string, boolean>;
} {
  const catalogIds = QUICK_ACTIONS_CATALOG.map((a) => a.id);
  const orderIds = c.order.length
    ? (c.order.filter((id) => catalogIds.includes(id as QuickActionId)) as QuickActionId[])
    : [...catalogIds];
  const missing = catalogIds.filter((id) => !orderIds.includes(id));
  const order = [...orderIds, ...missing];
  const visible = catalogIds.reduce<Record<string, boolean>>((acc, id) => {
    acc[id] = c.visible[id] !== false;
    return acc;
  }, {});
  return { order, visible };
}

/**
 * @param initialConfig – z RSC (layout), okamžitě `ready` bez skeletonu; server action v pozadí sladí změny z Nastavení.
 */
export function useQuickActionsItems(
  initialConfig?: QuickActionsShape | null
): { items: QuickActionItem[]; ready: boolean } {
  const seeded = initialConfig != null;
  const [order, setOrder] = useState<QuickActionId[]>(() => {
    if (initialConfig) return normalizeQuickActionsConfig(initialConfig).order;
    return DEFAULT_QUICK_ACTIONS_ORDER;
  });
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    if (initialConfig) return normalizeQuickActionsConfig(initialConfig).visible;
    const { visible: v } = getDefaultQuickActionsConfig();
    return v;
  });
  const [ready, setReady] = useState(seeded);

  useEffect(() => {
    if (seeded) {
      setReady(true);
      return;
    }
    void getQuickActionsConfig().then((c) => {
      const n = normalizeQuickActionsConfig(c);
      setOrder(n.order);
      setVisible(n.visible);
      setReady(true);
    });
  }, [seeded]);

  const items = useMemo(
    () =>
      order
        .filter((id) => visible[id])
        .map((id) => QUICK_ACTIONS_CATALOG.find((a) => a.id === id))
        .filter(Boolean) as QuickActionItem[],
    [order, visible]
  );

  return { items, ready };
}
