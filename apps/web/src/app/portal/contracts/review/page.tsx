"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { FileText, Search, Filter } from "lucide-react";

type ProcessingStatus = "uploaded" | "processing" | "extracted" | "review_required" | "failed";
type ReviewStatus = "pending" | "approved" | "rejected" | "applied";

type ReviewItem = {
  id: string;
  fileName: string;
  processingStatus: ProcessingStatus;
  reviewStatus: ReviewStatus | null;
  confidence: number | null;
  createdAt: string;
  extractedPayload?: {
    institutionName?: string;
    contractNumber?: string;
    client?: { fullName?: string; firstName?: string; lastName?: string };
  };
};

const PROCESSING_LABELS: Record<string, string> = {
  uploaded: "Nahráno",
  processing: "Zpracovává se",
  extracted: "Extrahováno",
  review_required: "Vyžaduje kontrolu",
  failed: "Chyba",
};

const REVIEW_LABELS: Record<string, string> = {
  pending: "Čeká",
  approved: "Schváleno",
  rejected: "Zamítnuto",
  applied: "Aplikováno",
};

function fullName(p: ReviewItem["extractedPayload"]): string {
  if (!p?.client) return "—";
  const c = p.client;
  if (c.fullName) return c.fullName;
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
}

export default function ContractReviewListPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewStatus | "">("");
  const [processingFilter, setProcessingFilter] = useState<ProcessingStatus | "">("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (reviewFilter) params.set("reviewStatus", reviewFilter);
      if (processingFilter) params.set("processingStatus", processingFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/contracts/review?${params}`);
      if (!res.ok) throw new Error("Načtení seznamu selhalo.");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }, [reviewFilter, processingFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: "var(--wp-text)" }}>
          AI asistent – Review smluv
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--wp-text-muted)" }}>
          Seznam nahraných a zpracovaných smluv. Otevřete položku pro kontrolu a aplikaci do CRM.
        </p>
      </div>

      <div
        className="rounded-xl border p-4 mb-4 flex flex-col sm:flex-row gap-3 flex-wrap"
        style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
      >
        <div className="flex-1 min-w-[200px] flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--wp-border)" }}>
          <Search size={18} style={{ color: "var(--wp-text-muted)" }} />
          <input
            type="search"
            placeholder="Klient, číslo smlouvy, instituce…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none"
            style={{ color: "var(--wp-text)" }}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={18} style={{ color: "var(--wp-text-muted)" }} />
          <select
            value={reviewFilter}
            onChange={(e) => setReviewFilter((e.target.value || "") as ReviewStatus | "")}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)", background: "var(--wp-bg)" }}
          >
            <option value="">Všechny stavy review</option>
            {(["pending", "approved", "rejected", "applied"] as const).map((s) => (
              <option key={s} value={s}>{REVIEW_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={processingFilter}
            onChange={(e) => setProcessingFilter((e.target.value || "") as ProcessingStatus | "")}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)", background: "var(--wp-bg)" }}
          >
            <option value="">Všechny stavy zpracování</option>
            {(["uploaded", "processing", "extracted", "review_required", "failed"] as const).map((s) => (
              <option key={s} value={s}>{PROCESSING_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div
        className="rounded-2xl border overflow-hidden flex-1 min-h-0 flex flex-col"
        style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
      >
        <div className="px-4 md:px-6 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--wp-border)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--wp-text)" }}>
            Položky ({items.length})
          </h2>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-lg border"
            style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
          >
            {loading ? "Načítám…" : "Obnovit"}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {loading && items.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--wp-text-muted)" }}>
              Načítám…
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--wp-text-muted)" }}>
              Žádné položky. Nahrajte smlouvu přes upload.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--wp-border)" }}>
                    <th className="px-4 md:px-6 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>Datum</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>Soubor</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>Instituce</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>Klient</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>Č. smlouvy</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>Zpracování</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>Review</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>Confidence</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b hover:bg-black/5 transition-colors"
                      style={{ borderColor: "var(--wp-border)" }}
                    >
                      <td className="px-4 md:px-6 py-3 text-sm whitespace-nowrap" style={{ color: "var(--wp-text-muted)" }}>
                        {new Date(row.createdAt).toLocaleDateString("cs-CZ")}
                      </td>
                      <td className="px-4 py-3 text-sm flex items-center gap-2">
                        <FileText size={16} style={{ color: "var(--wp-text-muted)" }} />
                        <span style={{ color: "var(--wp-text)" }}>{row.fileName}</span>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--wp-text)" }}>
                        {row.extractedPayload?.institutionName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--wp-text)" }}>
                        {fullName(row.extractedPayload)}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--wp-text)" }}>
                        {row.extractedPayload?.contractNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-1 rounded" style={{ background: "var(--wp-bg)", color: "var(--wp-text)" }}>
                          {PROCESSING_LABELS[row.processingStatus] ?? row.processingStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-1 rounded" style={{ background: "var(--wp-bg)", color: "var(--wp-text)" }}>
                          {row.reviewStatus ? REVIEW_LABELS[row.reviewStatus] : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--wp-text-muted)" }}>
                        {row.confidence != null ? `${Math.round(row.confidence * 100)} %` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/portal/contracts/review/${row.id}`}
                          className="text-sm font-medium"
                          style={{ color: "var(--wp-accent, #4f46e5)" }}
                        >
                          Otevřít
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
