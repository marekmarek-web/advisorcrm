"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Search,
  Filter,
  UploadCloud,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  FileCheck,
  AlertCircle,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { useAiAssistantDrawer } from "@/app/portal/AiAssistantDrawerContext";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { isLikelyPdfUpload } from "@/lib/security/file-signature";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import type { ProcessingStatus, ReviewStatus } from "@/lib/ai-review/types";

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
    productName?: string;
    client?: { fullName?: string; firstName?: string; lastName?: string };
    paymentDetails?: { amount?: unknown; currency?: string };
  };
};

const PROCESSING_LABELS: Record<ProcessingStatus, string> = {
  uploaded: "Nahráno",
  processing: "Zpracovává se",
  extracted: "Extrahováno",
  review_required: "Vyžaduje kontrolu",
  failed: "Chyba",
  scan_pending_ocr: "Čeká na OCR",
  blocked: "Blokováno (kontrola)",
};

const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: "Čeká",
  in_review: "V kontrole",
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

function buildInsightChips(payload: ReviewItem["extractedPayload"]): { label: string; value: string; alert?: boolean }[] {
  if (!payload) return [];
  const chips: { label: string; value: string; alert?: boolean }[] = [];
  if (payload.institutionName) chips.push({ label: "Instituce", value: payload.institutionName });
  if (payload.contractNumber) chips.push({ label: "Č. smlouvy", value: payload.contractNumber });
  if (payload.productName) chips.push({ label: "Produkt", value: payload.productName });
  const name = fullName(payload);
  if (name !== "—") chips.push({ label: "Klient", value: name });
  const pay = payload.paymentDetails;
  if (pay?.amount != null || pay?.currency) {
    const val = [pay.amount != null ? String(pay.amount) : "", pay.currency ?? ""].filter(Boolean).join(" ");
    if (val) chips.push({ label: "Platba", value: val });
  }
  return chips;
}

function getStatusConfig(
  processingStatus: ProcessingStatus,
  reviewStatus: ReviewStatus | null
): { icon: React.ReactNode; text: string; color: string; dot: string } {
  if (processingStatus === "failed") {
    return {
      icon: <AlertCircle size={16} />,
      text: "Chyba čtení",
      color:
        "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-100 dark:bg-rose-950/45 dark:border-rose-500/35",
      dot: "bg-rose-500",
    };
  }
  if (processingStatus === "scan_pending_ocr") {
    return {
      icon: <FileText size={16} />,
      text: "Čeká na OCR",
      color:
        "text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-100 dark:bg-amber-950/40 dark:border-amber-500/35",
      dot: "bg-amber-500",
    };
  }
  if (processingStatus === "blocked") {
    return {
      icon: <ShieldAlert size={16} />,
      text: "Blokováno — zkontrolujte údaje",
      color:
        "text-orange-800 bg-orange-50 border-orange-200 dark:text-orange-100 dark:bg-orange-950/40 dark:border-orange-500/35",
      dot: "bg-orange-500",
    };
  }
  if (reviewStatus === "applied") {
    return {
      icon: <CheckCircle2 size={16} />,
      text: "Aplikováno v CRM",
      color:
        "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-500/35",
      dot: "bg-emerald-500",
    };
  }
  if (processingStatus === "processing" || processingStatus === "uploaded") {
    return {
      icon: <RefreshCw size={16} className="animate-spin" />,
      text: "Zpracovává se",
      color:
        "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-100 dark:bg-blue-950/45 dark:border-blue-500/35",
      dot: "bg-blue-500 animate-pulse",
    };
  }
  return {
    icon: <ShieldAlert size={16} />,
    text: "Vyžaduje revizi",
    color:
      "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-100 dark:bg-amber-950/40 dark:border-amber-500/35",
    dot: "bg-amber-500",
  };
}

function formatUploadDate(createdAt: string): string {
  const d = new Date(createdAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - d.getTime();
  if (diff < 0) return "Dnes, " + d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  if (diff < 86400000) return "Včera";
  return d.toLocaleDateString("cs-CZ");
}

export default function ContractReviewListPage() {
  const router = useRouter();
  const { setOpen: setAiDrawerOpen } = useAiAssistantDrawer();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewStatus | "">("");
  const [processingFilter, setProcessingFilter] = useState<ProcessingStatus | "">("");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const uploadFile = useCallback(async (file: File) => {
    if (!file?.size || !isLikelyPdfUpload(file)) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      // Step 1: Fast upload (Storage + DB row), returns immediately.
      const res = await fetch("/api/contracts/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Nahrání selhalo.");
        return;
      }
      const reviewId = data.id as string;
      // Step 2: Navigate to detail page, which triggers processing and polls for status.
      router.push(`/portal/contracts/review/${reviewId}`);
    } catch {
      setError("Nahrání souboru selhalo.");
    } finally {
      setUploading(false);
    }
  }, [router]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && isLikelyPdfUpload(file)) uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const isProcessing = (row: ReviewItem) =>
    row.processingStatus === "uploaded" || row.processingStatus === "processing";

  const handleDeleteReview = async (e: React.MouseEvent, row: ReviewItem) => {
    e.preventDefault();
    e.stopPropagation();
    const warn = isProcessing(row);
    const msg = warn
      ? "Položka se stále zpracovává. Opravdu smazat soubor z úložiště i z revize?"
      : "Smazat soubor z úložiště i z revize?";
    if (!window.confirm(msg)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/review/${row.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Smazání selhalo.");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== row.id));
    } catch {
      setError("Smazání selhalo.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[color:var(--wp-main-scroll-bg)]">
      <div className="max-w-[1200px] mx-auto w-full p-6 md:p-8 space-y-6">
        {/* Header - reference style */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-start gap-4">
            <AiAssistantBrandIcon size={52} className="flex-shrink-0 self-center" />
            <div>
              <h1 className="text-3xl font-black text-[color:var(--wp-text)] tracking-tight mb-1">Review smluv</h1>
              <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] max-w-xl leading-relaxed">
                Seznam nahraných a zpracovaných smluv. Otevřete položku pro kontrolu a aplikaci do CRM.
              </p>
            </div>
          </div>
        </div>

        {/* Upload zone - reference */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-[32px] p-8 md:p-10 bg-[color:var(--wp-surface-card)] text-center cursor-pointer transition-all ${
            uploading
              ? "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 cursor-wait"
              : "border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50/20 dark:border-[color:var(--wp-border-strong)] dark:hover:border-indigo-400/40 dark:hover:bg-indigo-950/25"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleUpload}
          />
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-300">
            {uploading ? (
              <RefreshCw size={32} className="animate-spin" strokeWidth={1.5} />
            ) : (
              <UploadCloud size={32} strokeWidth={1.5} />
            )}
          </div>
          <h3 className="text-lg font-black text-[color:var(--wp-text)] mb-2">
            {uploading ? "Nahrávám…" : "Přetáhněte smlouvy sem"}
          </h3>
          <p className="text-sm text-[color:var(--wp-text-secondary)] font-medium mb-6">
            {uploading
              ? "Zpracovávám dokument."
              : "nebo klikněte pro výběr souborů (PDF). Můžete také otevřít AI asistenta vpravo dole."}
          </p>
          {!uploading && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setAiDrawerOpen(true); }}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              Otevřít AI asistenta
            </button>
          )}
        </div>

        {/* Error state - reference */}
        {error && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/35 dark:bg-rose-950/35">
            <div className="flex items-center gap-3 text-rose-700 dark:text-rose-100">
              <AlertCircle size={20} className="shrink-0" />
              <span className="font-bold text-sm">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => { setError(null); load(); }}
              className="px-4 py-2 rounded-xl bg-[color:var(--wp-surface-card)] border border-rose-200 text-rose-700 text-sm font-bold hover:bg-rose-50 transition-colors shrink-0"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {/* Filters - reference panel */}
        <div className="bg-[color:var(--wp-surface-card)] p-3 md:p-4 rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="relative flex-1 w-full max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)]" />
            <input
              type="search"
              placeholder="Klient, číslo smlouvy, instituce…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-[color:var(--wp-surface-muted)]/50 border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:border-indigo-400 transition-colors"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <CustomDropdown
              value={reviewFilter}
              onChange={(id) => setReviewFilter(id as ReviewStatus | "")}
              options={[
                { id: "", label: "Všechny stavy review" },
                ...(["pending", "approved", "rejected", "applied"] as const).map((s) => ({
                  id: s,
                  label: s === "pending" ? "K revizi" : s === "applied" ? "Dokončeno" : REVIEW_LABELS[s],
                })),
              ]}
              placeholder="Všechny stavy review"
              icon={Filter}
            />
            <CustomDropdown
              value={processingFilter}
              onChange={(id) => setProcessingFilter(id as ProcessingStatus | "")}
              options={[
                { id: "", label: "Všechny stavy zpracování" },
                ...([
                  "uploaded",
                  "processing",
                  "extracted",
                  "review_required",
                  "failed",
                  "scan_pending_ocr",
                  "blocked",
                ] as const).map((s) => ({
                  id: s,
                  label: PROCESSING_LABELS[s],
                })),
              ]}
              placeholder="Všechny stavy zpracování"
              icon={Filter}
            />
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-sm font-bold hover:bg-[color:var(--wp-surface-muted)] transition-colors shadow-sm"
            >
              <RefreshCw size={16} className={loading ? "animate-spin text-indigo-600" : ""} />
              Obnovit
            </button>
          </div>
        </div>

        {/* List - cards */}
        <div className="bg-[color:var(--wp-surface-card)] rounded-[32px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/30 flex items-center justify-between">
            <h2 className="font-black text-[color:var(--wp-text)] text-sm flex items-center gap-2">
              Položky{" "}
              <span className="bg-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] px-2 py-0.5 rounded-md text-xs font-bold">
                {items.length}
              </span>
            </h2>
          </div>

          <div className="flex-1 overflow-auto">
            {loading && items.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                <RefreshCw size={32} className="animate-spin text-indigo-500 mb-4" />
                <p className="text-[color:var(--wp-text-secondary)] font-medium">Načítám…</p>
              </div>
            ) : items.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-[color:var(--wp-surface-muted)] rounded-2xl flex items-center justify-center text-[color:var(--wp-text-tertiary)] mb-4">
                  <FileText size={32} />
                </div>
                <p className="text-[color:var(--wp-text-secondary)] font-medium mb-4">
                  Žádné položky. Nahrajte smlouvu v AI asistentovi nebo výše.
                </p>
                <CreateActionButton type="button" onClick={() => setAiDrawerOpen(true)} className="!normal-case !tracking-normal px-4 py-2.5 text-sm">
                  Otevřít AI asistenta
                </CreateActionButton>
              </div>
            ) : (
              <div className="flex flex-col">
                {items.map((row) => {
                  const statusConfig = getStatusConfig(row.processingStatus, row.reviewStatus);
                  const insights = buildInsightChips(row.extractedPayload);
                  const isDone = row.reviewStatus === "applied";
                  return (
                    <div
                      key={row.id}
                      className="p-6 border-b border-[color:var(--wp-surface-card-border)] last:border-0 hover:bg-[color:var(--wp-surface-muted)]/50 transition-colors flex flex-col xl:flex-row xl:items-start gap-6"
                    >
                      <div className="flex items-start gap-4 xl:w-[40%] min-w-0">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-sm ${
                            isDone ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-[color:var(--wp-surface-card)] border-[color:var(--wp-surface-card-border)] text-indigo-500"
                          }`}
                        >
                          {isDone ? <FileCheck size={24} /> : <FileText size={24} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-[color:var(--wp-text)] text-[15px] truncate mb-1">
                            {row.fileName}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[color:var(--wp-text-secondary)]">
                            <span className="text-[color:var(--wp-text-secondary)]">{fullName(row.extractedPayload)}</span>
                            <span className="h-1 w-1 rounded-full bg-[color:var(--wp-text-tertiary)]" />
                            <span>{row.extractedPayload?.institutionName ?? "—"}</span>
                            <span className="h-1 w-1 rounded-full bg-[color:var(--wp-text-tertiary)]" />
                            <span className="text-[color:var(--wp-text-tertiary)] font-medium">{formatUploadDate(row.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 xl:px-6 xl:border-l border-[color:var(--wp-surface-card-border)] min-w-0">
                        {isProcessing(row) ? (
                          <div className="flex items-center gap-3 text-sm font-medium text-[color:var(--wp-text-tertiary)]">
                            <div className="flex gap-1">
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                            AI čte dokument a extrahuje data…
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-400 dark:text-indigo-300">
                                <AiAssistantBrandIcon size={16} className="shrink-0" />
                                Extrahovaná data
                              </span>
                              {row.confidence != null && (
                                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200">
                                  Jistota {Math.round(row.confidence * 100)}%
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {insights.map((chip, idx) => (
                                <div
                                  key={idx}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-2 ${
                                    chip.alert
                                      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
                                      : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)]"
                                  }`}
                                >
                                  <span className="text-[color:var(--wp-text-tertiary)] font-medium">{chip.label}:</span>
                                  <span>{chip.value}</span>
                                  {chip.alert && <AlertCircle size={14} className="text-amber-500" />}
                                </div>
                              ))}
                              {insights.length === 0 && (
                                <span className="text-xs text-[color:var(--wp-text-tertiary)]">Žádná extrahovaná data</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-stretch xl:items-end justify-between gap-3 shrink-0 w-full xl:w-[220px]">
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border shadow-sm self-start xl:self-end ${statusConfig.color}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
                          {statusConfig.text}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteReview(e, row)}
                            disabled={deletingId === row.id}
                            className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-[color:var(--wp-surface-card)] text-rose-700 text-xs font-bold hover:bg-rose-50 transition-colors disabled:opacity-50"
                            aria-label="Smazat položku revize"
                          >
                            {deletingId === row.id ? (
                              <RefreshCw size={18} className="animate-spin shrink-0" />
                            ) : (
                              <Trash2 size={18} className="shrink-0" />
                            )}
                            <span>Smazat</span>
                          </button>
                          {row.reviewStatus !== "applied" && (
                            <CreateActionButton
                              href={`/portal/contracts/review/${row.id}`}
                              icon={ArrowRight}
                              className="px-4 py-2 shadow-md"
                            >
                              Provést revizi
                            </CreateActionButton>
                          )}
                          {row.reviewStatus === "applied" && (
                            <Link
                              href={`/portal/contracts/review/${row.id}`}
                              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[color:var(--wp-surface-muted)] transition-all shadow-sm"
                            >
                              Otevřít v CRM <ArrowRight size={14} />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
