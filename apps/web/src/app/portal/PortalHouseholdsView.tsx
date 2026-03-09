"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getHouseholdsList } from "@/app/actions/households";
import type { HouseholdRow } from "@/app/actions/households";
import { EmptyState } from "@/app/components/EmptyState";

export function PortalHouseholdsView() {
  const [list, setList] = useState<HouseholdRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHouseholdsList()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-monday-text">Households</h1>
      {loading ? (
        <p className="text-monday-text-muted text-sm">Načítám…</p>
      ) : list.length === 0 ? (
        <EmptyState
          icon="🏠"
          title="Zatím žádné domácnosti"
          description="Vytvořte první domácnost."
          actionLabel="Vytvořit domácnost"
          actionHref="/portal/households"
        />
      ) : (
        <div className="rounded-lg border border-monday-border bg-monday-surface overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-monday-border bg-monday-row-hover">
                <th className="text-left p-2 text-monday-text-muted font-semibold">Název</th>
                <th className="text-left p-2 text-monday-text-muted font-semibold">Počet členů</th>
                <th className="text-left p-2 text-monday-text-muted font-semibold" />
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className="border-b border-monday-border hover:bg-monday-row-hover">
                  <td className="p-2 text-monday-text font-medium">{h.name}</td>
                  <td className="p-2 text-monday-text-muted">{h.memberCount}</td>
                  <td className="p-2">
                    <Link
                      href={`/portal/households/${h.id}`}
                      className="text-monday-blue text-sm font-medium hover:underline"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
