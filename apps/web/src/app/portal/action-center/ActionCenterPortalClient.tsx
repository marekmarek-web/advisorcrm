"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionCenterScreen } from "../mobile/screens/ActionCenterScreen";
import type { ActionCenterItemSerialized } from "@/lib/execution/action-center";

type Props = {
  /** Rows z RSC; na mobilu se nevyplňuje. */
  initialItems?: ActionCenterItemSerialized[];
  /** true = data už načetl server, neprovádět bootstrap fetch. */
  hydratedFromServer?: boolean;
};

export function ActionCenterPortalClient({
  initialItems = [],
  hydratedFromServer = false,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ActionCenterItemSerialized[]>(() =>
    hydratedFromServer ? initialItems : [],
  );
  const [loading, setLoading] = useState(!hydratedFromServer);

  useEffect(() => {
    if (!hydratedFromServer) return;
    setItems(initialItems);
    setLoading(false);
  }, [hydratedFromServer, initialItems]);

  const refresh = useCallback(async (): Promise<ActionCenterItemSerialized[]> => {
    const res = await fetch("/api/mobile/action-center", { credentials: "include" });
    if (!res.ok) throw new Error("Akční centrum se nepodařilo načíst.");
    const data = (await res.json()) as { items?: ActionCenterItemSerialized[] };
    const next = data.items ?? [];
    setItems(next);
    return next;
  }, []);

  useEffect(() => {
    if (hydratedFromServer) return;
    let cancelled = false;
    refresh()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hydratedFromServer, refresh]);

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-[color:var(--wp-text-secondary)]">
        Načítání akčního centra…
      </div>
    );
  }

  return (
    <ActionCenterScreen
      initialItems={items}
      onNavigate={(path) => router.push(path)}
      onRefresh={refresh}
    />
  );
}
