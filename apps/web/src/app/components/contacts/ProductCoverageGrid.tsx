"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { COVERAGE_CATEGORIES } from "@/app/lib/segment-hierarchy";
import type { CoverageCategory, SegmentItem } from "@/app/lib/segment-hierarchy";

export type CoverageStatus = "done" | "in_progress" | "none";

const CATEGORY_COLORS: Record<string, { bg: string; border: string; icon: string; iconBg: string }> = {
  "Pojištění auta": { bg: "#edf2ff", border: "#c5d5ff", icon: "🚗", iconBg: "#dbe4ff" },
  "Pojištění majetku": { bg: "#fff8e1", border: "#ffe082", icon: "🏠", iconBg: "#fff3cd" },
  "Pojištění odpovědnosti": { bg: "#ecfdf5", border: "#a7f3d0", icon: "✅", iconBg: "#d1fae5" },
  "Pojištění zaměstnanecké odpovědnosti": { bg: "#ecfdf5", border: "#a7f3d0", icon: "✅", iconBg: "#d1fae5" },
  "Životní pojištění": { bg: "#fdf2f8", border: "#fbcfe8", icon: "❤️", iconBg: "#fce7f3" },
  "Úvěry": { bg: "#fff7ed", border: "#fed7aa", icon: "💳", iconBg: "#ffedd5" },
  "Investice": { bg: "#f3e8ff", border: "#d8b4fe", icon: "📈", iconBg: "#ede9fe" },
  "DPS": { bg: "#e0f2fe", border: "#7dd3fc", icon: "🏦", iconBg: "#e0f2fe" },
};

const DEFAULT_COLORS = { bg: "#f8fafc", border: "#e2e8f0", icon: "📋", iconBg: "#f1f5f9" };

function StatusIcon({ status }: { status: CoverageStatus }) {
  const size = 16;
  if (status === "done")
    return (
      <span className="shrink-0" style={{ color: "var(--wp-success)" }} aria-hidden>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      </span>
    );
  if (status === "in_progress")
    return (
      <span className="shrink-0" style={{ color: "var(--wp-warning)" }} aria-hidden>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
      </span>
    );
  return (
    <span className="shrink-0" style={{ color: "var(--wp-text-muted)", opacity: 0.5 }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>
    </span>
  );
}

const STORAGE_KEY_PREFIX = "weplan_coverage_";

function loadManualStatus(contactId: string): Record<string, CoverageStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + contactId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CoverageStatus>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveManualStatus(contactId: string, data: Record<string, CoverageStatus>) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + contactId, JSON.stringify(data));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("weplan_coverage_updated", { detail: contactId }));
    }
  } catch {}
}

function cellKey(cat: CoverageCategory, item?: SegmentItem): string {
  if (cat.type === "single") return cat.category;
  return item ? `${cat.category}:${item.label}` : cat.category;
}

function getAllCellKeys(): string[] {
  const keys: string[] = [];
  for (const cat of COVERAGE_CATEGORIES) {
    if (cat.type === "single") keys.push(cat.category);
    else for (const item of cat.items) keys.push(`${cat.category}:${item.label}`);
  }
  return keys;
}

const CYCLE: CoverageStatus[] = ["none", "in_progress", "done"];
function nextStatus(s: CoverageStatus): CoverageStatus {
  const i = CYCLE.indexOf(s);
  return CYCLE[(i + 1) % CYCLE.length];
}

const COVERAGE_UPDATED_EVENT = "weplan_coverage_updated";

/** Kompaktní karta „Celkové pokrytí portfolia“ – počet hotovo / řeší se / nic. Data ze stejného localStorage jako ProductCoverageGrid. */
export function CoverageSummaryCard({ contactId }: { contactId: string }) {
  const [manualStatus, setManualStatus] = useState<Record<string, CoverageStatus>>({});
  const allKeys = useMemo(() => getAllCellKeys(), []);

  useEffect(() => {
    setManualStatus(loadManualStatus(contactId));
  }, [contactId]);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<string>).detail === contactId) setManualStatus(loadManualStatus(contactId));
    };
    window.addEventListener(COVERAGE_UPDATED_EVENT, handler);
    return () => window.removeEventListener(COVERAGE_UPDATED_EVENT, handler);
  }, [contactId]);

  const getStatus = useCallback(
    (key: string): CoverageStatus => manualStatus[key] ?? "none",
    [manualStatus]
  );

  const progress = useMemo(() => {
    let done = 0, inProgress = 0, none = 0;
    for (const key of allKeys) {
      const s = getStatus(key);
      if (s === "done") done++;
      else if (s === "in_progress") inProgress++;
      else none++;
    }
    return { done, inProgress, none, total: allKeys.length };
  }, [allKeys, getStatus]);

  return (
    <div className="rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Celkové pokrytí portfolia</h3>
      <p className="text-sm mb-2">
        <span className="font-semibold" style={{ color: "var(--wp-success)" }}>{progress.done} hotovo</span>
        {", "}
        <span className="font-semibold" style={{ color: "var(--wp-warning)" }}>{progress.inProgress} řeší se</span>
        {", "}
        <span className="text-slate-500">{progress.none} nic</span>
      </p>
      <div
        className="flex overflow-hidden rounded-full"
        style={{ height: 6, background: "var(--wp-border)", maxWidth: 320 }}
      >
        <div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: "var(--wp-success)", transition: "width 0.3s" }} />
        <div style={{ width: `${progress.total ? (progress.inProgress / progress.total) * 100 : 0}%`, background: "var(--wp-warning)", transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

export function ProductCoverageGrid({ contactId }: { contactId: string }) {
  const [manualStatus, setManualStatus] = useState<Record<string, CoverageStatus>>({});
  const allKeys = useMemo(() => getAllCellKeys(), []);

  useEffect(() => {
    setManualStatus(loadManualStatus(contactId));
  }, [contactId]);

  const persist = useCallback(
    (next: Record<string, CoverageStatus>) => {
      setManualStatus(next);
      saveManualStatus(contactId, next);
    },
    [contactId]
  );

  const getStatus = useCallback(
    (key: string): CoverageStatus => manualStatus[key] ?? "none",
    [manualStatus]
  );

  const setStatus = useCallback(
    (key: string) => {
      persist({ ...manualStatus, [key]: nextStatus(getStatus(key)) });
    },
    [manualStatus, persist, getStatus]
  );

  const progress = useMemo(() => {
    let done = 0;
    let inProgress = 0;
    let none = 0;
    for (const key of allKeys) {
      const s = getStatus(key);
      if (s === "done") done++;
      else if (s === "in_progress") inProgress++;
      else none++;
    }
    return { done, inProgress, none, total: allKeys.length };
  }, [allKeys, getStatus]);

  return (
    <div className="wp-card rounded-[var(--wp-radius-sm)]" style={{ padding: "var(--wp-space-6)" }}>
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: "var(--wp-space-4)" }}>
        <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: "var(--wp-text)" }}>
          <span style={{ fontSize: 18 }} aria-hidden>📊</span>
          Pokrytí produktů
        </h2>
        <Link
          href={`/portal/contacts/${contactId}#obchody`}
          className="font-medium text-sm flex items-center gap-1"
          style={{ color: "var(--wp-cal-accent)" }}
        >
          Obchody <span aria-hidden>→</span>
        </Link>
      </div>

      {/* Progress bar */}
      <div className="text-center" style={{ marginBottom: "var(--wp-space-5)" }}>
        <p className="text-sm" style={{ marginBottom: "var(--wp-space-2)" }}>
          <span className="font-medium" style={{ color: "var(--wp-success)" }}>{progress.done} hotovo</span>
          {", "}
          <span className="font-medium" style={{ color: "var(--wp-warning)" }}>{progress.inProgress} řeší se</span>
          {", "}
          <span style={{ color: "var(--wp-text-muted)" }}>{progress.none} nic</span>
        </p>
        <div className="flex overflow-hidden mx-auto" style={{ height: 6, borderRadius: 99, background: "var(--wp-border)", maxWidth: 400 }}>
          <div style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: "var(--wp-success)", transition: "width 0.3s" }} />
          <div style={{ width: `${progress.total ? (progress.inProgress / progress.total) * 100 : 0}%`, background: "var(--wp-warning)", transition: "width 0.3s" }} />
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--wp-text-muted)" }}>Klikni na položku pro změnu stavu.</p>
      </div>

      {/* Portfolio card grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {COVERAGE_CATEGORIES.map((cat) => {
          const colors = CATEGORY_COLORS[cat.category] ?? DEFAULT_COLORS;

          if (cat.type === "single") {
            const key = cellKey(cat);
            const status = getStatus(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className="flex flex-col items-center text-center p-4 transition-shadow hover:shadow-md cursor-pointer"
                style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: "var(--wp-radius-sm)" }}
                title="Klikni pro změnu stavu"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-[var(--wp-radius-sm)] text-xl" style={{ background: colors.iconBg }} aria-hidden>
                  {colors.icon}
                </span>
                <span className="font-semibold text-sm mt-3" style={{ color: "var(--wp-text)" }}>{cat.category}</span>
                <span className="flex items-center gap-1 mt-2">
                  <StatusIcon status={status} />
                  <span className="text-xs font-medium" style={{ color: status === "done" ? "var(--wp-success)" : status === "in_progress" ? "var(--wp-warning)" : "var(--wp-text-muted)" }}>
                    {status === "done" ? "Hotovo" : status === "in_progress" ? "Řeší se" : "Nastavit"}
                  </span>
                </span>
              </button>
            );
          }

          return (
            <div
              key={cat.category}
              className="flex flex-col p-4"
              style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: "var(--wp-radius-sm)" }}
            >
              <div className="flex flex-col items-center text-center mb-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-[var(--wp-radius-sm)] text-xl" style={{ background: colors.iconBg }} aria-hidden>
                  {colors.icon}
                </span>
                <span className="font-semibold text-sm mt-2" style={{ color: "var(--wp-text)" }}>{cat.category}</span>
              </div>
              <div className="space-y-1.5">
                {cat.items.map((item) => {
                  const key = cellKey(cat, item);
                  const status = getStatus(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatus(key)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm font-medium transition-colors rounded-lg hover:opacity-80"
                      style={{
                        background: status === "done" ? "rgba(0,200,117,0.15)" : status === "in_progress" ? "rgba(253,171,61,0.15)" : "rgba(255,255,255,0.7)",
                        color: "var(--wp-text)",
                      }}
                      title="Klikni pro změnu stavu"
                    >
                      <StatusIcon status={status} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
