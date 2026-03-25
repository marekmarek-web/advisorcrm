"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  approveContractReview,
  rejectContractReview,
  applyContractReviewDrafts,
  selectMatchedClient,
  confirmCreateNewClient,
} from "@/app/actions/contract-review";
import { useToast } from "@/app/components/Toast";
import { AIReviewExtractionShell } from "@/app/components/ai-review/AIReviewExtractionShell";
import { mapApiToExtractionDocument } from "@/lib/ai-review/mappers";
import type { ExtractionDocument } from "@/lib/ai-review/types";

const PROCESSING_STEPS = [
  { key: "uploaded", label: "Soubor nahrán" },
  { key: "preprocessing", label: "Předpracování dokumentu" },
  { key: "classifying", label: "Klasifikace smlouvy" },
  { key: "extracting", label: "AI extrakce dat" },
  { key: "matching", label: "Hledání klientů a smluv" },
  { key: "processing", label: "Zpracovávám…" },
] as const;

function ProcessingProgress({ stepHint }: { stepHint?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => f + 1), 600);
    return () => clearInterval(t);
  }, []);
  const dots = ".".repeat((frame % 3) + 1);
  const label = stepHint
    ? PROCESSING_STEPS.find((s) => s.key === stepHint)?.label ?? "Zpracovávám"
    : "Zpracovávám";
  return (
    <div className="flex flex-col items-center justify-center h-[70vh] gap-6 text-center px-4">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full bg-indigo-100 animate-ping opacity-40" />
        <div className="relative w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </div>
      <div>
        <p className="text-xl font-black text-slate-800 mb-1">
          {label}
          {dots}
        </p>
        <p className="text-sm text-slate-500 font-medium max-w-xs">
          AI čte dokument a extrahuje data. Obvykle to trvá 20–50 sekund. Stránka se automaticky aktualizuje.
        </p>
      </div>
      <div className="flex gap-2">
        {PROCESSING_STEPS.slice(0, 5).map((s, i) => (
          <div
            key={s.key}
            className={`h-1.5 rounded-full transition-all duration-700 ${
              i <= (frame % 5) ? "w-8 bg-indigo-500" : "w-4 bg-slate-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function ContractReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const toast = useToast();

  const [doc, setDoc] = useState<ExtractionDocument | null>(null);
  const [rawExtractedPayload, setRawExtractedPayload] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingStepHint, setProcessingStepHint] = useState<string | undefined>();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingStartedRef = useRef(false);

  const loadPdf = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/review/${id}/file`);
      if (res.ok) {
        const { url } = await res.json();
        if (url) setPdfUrl(url);
      }
    } catch {
      /* PDF URL optional */
    }
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/review/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Položka nenalezena.");
        throw new Error("Načtení detailu selhalo.");
      }
      const data = await res.json();
      setProcessingStatus(data.processingStatus ?? null);
      const mapped = mapApiToExtractionDocument(data, pdfUrl);
      setDoc(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }, [id, pdfUrl]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/contracts/review/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        const status: string = data.processingStatus ?? "";
        setProcessingStatus(status);
        if (status !== "uploaded" && status !== "processing") {
          stopPolling();
          const mapped = mapApiToExtractionDocument(data, pdfUrl);
          setDoc(mapped);
          setLoading(false);
          if (status === "failed") {
            setError(data.errorMessage ?? "Extrakce selhala.");
          }
        }
      } catch {
        /* polling error – keep retrying */
      }
    }, 3000);
  }, [id, pdfUrl, stopPolling]);

  const triggerProcessing = useCallback(async () => {
    if (processingStartedRef.current) return;
    processingStartedRef.current = true;
    setProcessingStepHint("preprocessing");
    try {
      const res = await fetch(`/api/contracts/review/${id}/process`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { error?: string; code?: string };
      if (!res.ok && res.status !== 409) {
        setError(data.error ?? "Spuštění zpracování selhalo.");
        setLoading(false);
        return;
      }
    } catch {
      setError("Spuštění zpracování selhalo.");
      setLoading(false);
      return;
    }
    startPolling();
  }, [id, startPolling]);

  useEffect(() => {
    loadPdf();
  }, [loadPdf]);

  useEffect(() => {
    if (!id) return;
    load();
  }, [load, id]);

  useEffect(() => {
    if (processingStatus === "uploaded") {
      triggerProcessing();
    } else if (processingStatus === "processing") {
      setProcessingStepHint("extracting");
      startPolling();
    }
  }, [processingStatus, triggerProcessing, startPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleBack = useCallback(() => {
    router.push("/portal/contracts/review");
  }, [router]);

  const handleDiscard = useCallback(async () => {
    const msg = "Smazat soubor z úložiště i z revize? Tím odeberete dokument a související data.";
    if (!window.confirm(msg)) return;
    setActionLoading("delete");
    try {
      const res = await fetch(`/api/contracts/review/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.showToast(data.error ?? "Smazání selhalo.", "error");
        return;
      }
      toast.showToast("Položka smazána.", "success");
      router.push("/portal/contracts/review");
    } catch {
      toast.showToast("Smazání selhalo.", "error");
    } finally {
      setActionLoading(null);
    }
  }, [id, router, toast]);

  const handleApprove = useCallback(
    async (editedFields: Record<string, string>) => {
      setActionLoading("approve");
      try {
        const result = await approveContractReview(id, {
          fieldEdits: editedFields,
          rawExtractedPayload: rawExtractedPayload ?? undefined,
        });
        if (result.ok) {
          toast.showToast("Položka schválena.", "success");
          load();
        } else {
          toast.showToast(result.error ?? "Chyba", "error");
        }
      } finally {
        setActionLoading(null);
      }
    },
    [id, rawExtractedPayload, toast, load]
  );

  const handleReject = useCallback(
    async (reason?: string) => {
      setActionLoading("reject");
      try {
        const result = await rejectContractReview(id, reason || undefined);
        if (result.ok) {
          toast.showToast("Položka zamítnuta.", "success");
          load();
        } else {
          toast.showToast(result.error ?? "Chyba", "error");
        }
      } finally {
        setActionLoading(null);
      }
    },
    [id, toast, load]
  );

  const handleApply = useCallback(async () => {
    setActionLoading("apply");
    try {
      const result = await applyContractReviewDrafts(id);
      if (result.ok) {
        toast.showToast("Akce aplikovány do CRM.", "success");
        load();
      } else {
        toast.showToast(result.error ?? "Chyba", "error");
      }
    } finally {
      setActionLoading(null);
    }
  }, [id, toast, load]);

  const handleSelectClient = useCallback(
    async (clientId: string) => {
      setActionLoading("select");
      try {
        const result = await selectMatchedClient(id, clientId);
        if (result.ok) {
          toast.showToast("Klient vybrán.", "success");
          load();
        } else {
          toast.showToast(result.error ?? "Chyba", "error");
        }
      } finally {
        setActionLoading(null);
      }
    },
    [id, toast, load]
  );

  const handleConfirmCreateNew = useCallback(async () => {
    setActionLoading("createNew");
    try {
      const result = await confirmCreateNewClient(id);
      if (result.ok) {
        toast.showToast("Vytvoření nového klienta potvrzeno.", "success");
        load();
      } else {
        toast.showToast(result.error ?? "Chyba", "error");
      }
    } finally {
      setActionLoading(null);
    }
  }, [id, toast, load]);

  if (processingStatus === "uploaded" || processingStatus === "processing") {
    return <ProcessingProgress stepHint={processingStepHint} />;
  }

  if (loading && !doc) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm font-bold text-slate-500">Načítám AI extrakci…</p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-slate-800">{error ?? "Dokument nenalezen."}</p>
          <button onClick={handleBack} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
            Zpět na seznam
          </button>
        </div>
      </div>
    );
  }

  return (
    <AIReviewExtractionShell
      doc={doc}
      onBack={handleBack}
      onDiscard={handleDiscard}
      onApprove={handleApprove}
      onReject={handleReject}
      onApply={handleApply}
      onSelectClient={handleSelectClient}
      onConfirmCreateNew={handleConfirmCreateNew}
      isApproving={actionLoading === "approve"}
      actionLoading={actionLoading}
    />
  );
}
