"use client";

import { useState, useMemo, useCallback } from "react";
import type { NotificationRow } from "@/app/actions/notification-log";
import { EmptyState } from "@/app/components/EmptyState";
import { Search, ChevronDown, ChevronRight } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200",
};

export function NotificationLogClient({ initialRows }: { initialRows: NotificationRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const channels = useMemo(() => Array.from(new Set(initialRows.map((r) => r.channel))), [initialRows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return initialRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (channelFilter !== "all" && r.channel !== channelFilter) return false;
      if (q) {
        const haystack = [r.subject, r.recipient, r.template, r.contactName].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [initialRows, search, statusFilter, channelFilter]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)]" />
          <input
            type="text"
            placeholder="Hledat předmět, příjemce…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 min-h-[40px]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl focus:outline-none min-h-[40px]"
        >
          <option value="all">Všechny stavy</option>
          <option value="sent">Odesláno</option>
          <option value="failed">Selhalo</option>
          <option value="pending">Čeká</option>
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl focus:outline-none min-h-[40px]"
        >
          <option value="all">Všechny kanály</option>
          {channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="self-center text-xs text-[color:var(--wp-text-secondary)] px-1">{filtered.length} záznamů</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm">
        {filtered.length === 0 ? (
          <EmptyState icon="🔔" title="Žádné záznamy" description="Žádné notifikace neodpovídají filtru." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]">
                <tr>
                  <th className="w-8" />
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">Datum</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">Příjemce</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">Předmět</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">Kanál</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">Stav</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">Kontakt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--wp-surface-card-border)]">
                {filtered.map((n) => (
                  <>
                    <tr
                      key={n.id}
                      className="hover:bg-[color:var(--wp-surface-muted)] transition-colors cursor-pointer"
                      onClick={() => toggleExpand(n.id)}
                    >
                      <td className="pl-3 py-2.5 text-[color:var(--wp-text-tertiary)]">
                        {expandedId === n.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[color:var(--wp-text-secondary)]">
                        {new Date(n.sentAt).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5 text-[color:var(--wp-text-secondary)]">{n.recipient ?? "–"}</td>
                      <td className="px-4 py-2.5 text-[color:var(--wp-text-secondary)] max-w-xs truncate">{n.subject ?? "–"}</td>
                      <td className="px-4 py-2.5 capitalize text-[color:var(--wp-text-secondary)]">{n.channel}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-[var(--wp-radius-sm)] px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[n.status] ?? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)]"}`}>
                          {n.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[color:var(--wp-text-secondary)]">{n.contactName ?? "–"}</td>
                    </tr>
                    {expandedId === n.id && (
                      <tr key={`${n.id}-detail`} className="bg-[color:var(--wp-surface-muted)]/60">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-2 text-xs">
                            <div className="flex flex-wrap gap-x-8 gap-y-1">
                              <span><strong className="text-[color:var(--wp-text)]">Šablona:</strong> {n.template ?? "—"}</span>
                              <span><strong className="text-[color:var(--wp-text)]">Kanál:</strong> {n.channel}</span>
                              {n.contactId && <span><strong className="text-[color:var(--wp-text)]">Kontakt ID:</strong> {n.contactId}</span>}
                            </div>
                            {n.status === "failed" && n.meta && (
                              <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3">
                                <p className="font-bold text-red-700 dark:text-red-400 mb-1">Detail selhání</p>
                                <pre className="text-red-700 dark:text-red-300 text-[10px] whitespace-pre-wrap break-all">
                                  {JSON.stringify(n.meta, null, 2)}
                                </pre>
                              </div>
                            )}
                            {n.meta && n.status !== "failed" && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]">Meta data</summary>
                                <pre className="mt-1 text-[10px] text-[color:var(--wp-text-secondary)] whitespace-pre-wrap break-all">
                                  {JSON.stringify(n.meta, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
