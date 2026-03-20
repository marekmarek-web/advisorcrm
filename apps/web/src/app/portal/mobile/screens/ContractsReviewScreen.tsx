"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  approveContractReview,
  applyContractReviewDrafts,
  confirmCreateNewClient,
  rejectContractReview,
  selectMatchedClient,
} from "@/app/actions/contract-review";
import {
  DocumentStateCard,
  DocumentUploadCard,
  EmptyState,
  ErrorState,
  FullscreenSheet,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
  SearchBar,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";

type ReviewListItem = {
  id: string;
  fileName: string;
  processingStatus: "uploaded" | "processing" | "extracted" | "review_required" | "failed";
  reviewStatus: "pending" | "approved" | "rejected" | "applied" | null;
  confidence: number | null;
  createdAt: string;
  errorMessage?: string | null;
};

type ReviewDetail = {
  id: string;
  fileName: string;
  processingStatus: ReviewListItem["processingStatus"];
  reviewStatus: ReviewListItem["reviewStatus"];
  confidence: number | null;
  errorMessage?: string | null;
  extractedPayload?: Record<string, unknown> | null;
  draftActions?: unknown[] | null;
  clientMatchCandidates?: Array<{ id: string; fullName?: string; score?: number }> | null;
  matchedClientId?: string;
  createdAt: string;
};

export function ContractsReviewScreen({
  detailIdFromPath,
}: {
  detailIdFromPath: string | null;
}) {
  const [items, setItems] = useState<ReviewListItem[]>([]);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function fetchList() {
    try {
      const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/contracts/review${query}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Načtení seznamu revizí selhalo.");
      setItems((json.items || []) as ReviewListItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení seznamu revizí selhalo.");
    }
  }

  async function fetchDetail(id: string) {
    try {
      const res = await fetch(`/api/contracts/review/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Načtení detailu selhalo.");
      setDetail(json as ReviewDetail);
      setDetailOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení detailu selhalo.");
    }
  }

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      await fetchList();
    });
  }, []);

  useEffect(() => {
    if (!detailIdFromPath) return;
    startTransition(async () => {
      await fetchDetail(detailIdFromPath);
    });
  }, [detailIdFromPath]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((item) => item.fileName.toLowerCase().includes(q));
  }, [items, search]);

  async function handleUpload(file: File | null) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/contracts/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Nahrání smlouvy selhalo.");
        await fetchList();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nahrání smlouvy selhalo.");
      }
    });
  }

  async function handleApprove(id: string) {
    startTransition(async () => {
      const result = await approveContractReview(id);
      if (!result.ok) setError(result.error);
      await fetchList();
      await fetchDetail(id);
    });
  }

  async function handleReject(id: string) {
    startTransition(async () => {
      const result = await rejectContractReview(id, "Vyžaduje manuální revizi");
      if (!result.ok) setError(result.error);
      await fetchList();
      await fetchDetail(id);
    });
  }

  async function handleApply(id: string) {
    startTransition(async () => {
      const result = await applyContractReviewDrafts(id);
      if (!result.ok) setError(result.error);
      await fetchList();
      await fetchDetail(id);
    });
  }

  return (
    <>
      {error ? <ErrorState title={error} onRetry={fetchList} /> : null}
      {pending && items.length === 0 ? <LoadingSkeleton rows={2} /> : null}

      <MobileSection title="AI Review smluv">
        <DocumentUploadCard
          title="Nahrát smlouvu"
          description="PDF do 20 MB. Po nahrání poběží AI extrakce a validace."
          action={
            <label className="inline-flex items-center justify-center min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold px-4 cursor-pointer">
              Vybrat PDF
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
              />
            </label>
          }
        />
      </MobileSection>

      <SearchBar value={search} onChange={setSearch} placeholder="Hledat revizi…" />

      <MobileSection title="Queue">
        {filteredItems.length === 0 ? (
          <EmptyState title="Žádné položky" description="Zatím tu nejsou žádné AI revize." />
        ) : (
          filteredItems.map((item) => (
            <DocumentStateCard
              key={item.id}
              fileName={item.fileName}
              status={item.reviewStatus ?? item.processingStatus}
              confidence={item.confidence}
              details={item.errorMessage || new Date(item.createdAt).toLocaleDateString("cs-CZ")}
              action={
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fetchDetail(item.id)}
                    className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-bold"
                  >
                    Detail
                  </button>
                  {item.processingStatus === "failed" ? (
                    <StatusBadge tone="danger">retry přes nový upload</StatusBadge>
                  ) : null}
                </div>
              }
            />
          ))
        )}
      </MobileSection>

      <FullscreenSheet open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail AI revize">
        {!detail ? (
          <LoadingSkeleton rows={2} />
        ) : (
          <div className="space-y-3">
            <DocumentStateCard
              fileName={detail.fileName}
              status={detail.reviewStatus ?? detail.processingStatus}
              confidence={detail.confidence}
              details={detail.errorMessage || "Zkontrolujte extrahovaná data před aplikací."}
            />

            <MobileCard>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-black">Match klienta</p>
              {detail.clientMatchCandidates?.length ? (
                <div className="mt-2 space-y-2">
                  {detail.clientMatchCandidates.slice(0, 3).map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => selectMatchedClient(detail.id, candidate.id)}
                      className="w-full min-h-[40px] rounded-lg border border-slate-200 text-left px-3 text-sm"
                    >
                      {candidate.fullName || candidate.id} {typeof candidate.score === "number" ? `• ${Math.round(candidate.score * 100)}%` : ""}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => confirmCreateNewClient(detail.id)}
                    className="w-full min-h-[40px] rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-bold"
                  >
                    Vytvořit nového klienta
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mt-1">Bez kandidátů; použijte manuální validaci.</p>
              )}
            </MobileCard>

            <MobileCard>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-black">Rozhodnutí</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleApprove(detail.id)}
                  className="min-h-[40px] rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold"
                >
                  Schválit
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(detail.id)}
                  className="min-h-[40px] rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold"
                >
                  Zamítnout
                </button>
                <button
                  type="button"
                  onClick={() => handleApply(detail.id)}
                  className="min-h-[40px] rounded-lg bg-[#1a1c2e] text-white text-xs font-bold"
                >
                  Aplikovat
                </button>
              </div>
            </MobileCard>
          </div>
        )}
      </FullscreenSheet>
    </>
  );
}
