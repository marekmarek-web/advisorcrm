"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  approveContractReview,
  approveAndApplyContractReview,
  rejectContractReview,
  applyContractReviewDrafts,
  selectMatchedClient,
  confirmCreateNewClient,
  linkContractReviewFileToContactDocuments,
  confirmPendingField,
  confirmManualField,
  confirmAllPendingFields,
  persistFinalContractOverride,
} from "@/app/actions/contract-review";
import { useToast } from "@/app/components/Toast";
import { useConfirm } from "@/app/components/ConfirmDialog";
import { AIReviewExtractionShell } from "@/app/components/ai-review/AIReviewExtractionShell";
import { mapApiToExtractionDocument } from "@/lib/ai-review/mappers";
import type { ExtractionDocument, MatchVerdict } from "@/lib/ai-review/types";
import { isSupportingDocumentOnly } from "@/lib/ai/apply-policy-enforcement";
import { DEFAULT_OCR_SCAN_PENDING_MAX_MS } from "@/lib/contracts/ocr-scan-pending-policy";

function resolveMatchVerdictFromDoc(d: ExtractionDocument | null): MatchVerdict | null {
  if (!d) return null;
  const v =
    d.matchVerdict ?? (d.extractionTrace as { matchVerdict?: MatchVerdict } | undefined)?.matchVerdict;
  if (v === "existing_match" || v === "near_match" || v === "ambiguous_match" || v === "no_match") {
    return v;
  }
  return null;
}

/** Polling revize na skrytém tabu – méně zátěže než plný backoff. */
const HIDDEN_POLL_MS = 60_000;

const PROCESSING_STEPS = [
  { key: "uploaded", label: "Soubor nahrán" },
  { key: "preprocessing", label: "Předpracování dokumentu" },
  { key: "classifying", label: "Rozpoznávám typ dokumentu" },
  { key: "extracting", label: "Extrahuji data" },
  { key: "validating", label: "Ověřuji výsledek" },
  { key: "matching", label: "Navrhuji klienta a akce" },
  { key: "processing", label: "Zpracovávám…" },
] as const;

function processingStepHintFromTrace(trace: unknown): string | undefined {
  const t = trace as Record<string, unknown> | null | undefined;
  if (!t || typeof t !== "object") return undefined;
  if (typeof t.classifierDurationMs !== "number") return "classifying";
  if (typeof t.extractionDurationMs !== "number") return "extracting";
  if (typeof t.validationDurationMs !== "number") return "validating";
  return "matching";
}

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
        <p className="text-xl font-black text-[color:var(--wp-text)] mb-1">
          {label}
          {dots}
        </p>
        <p className="text-sm text-[color:var(--wp-text-secondary)] font-medium max-w-md">
          AI čte dokument a extrahuje data. Doba závisí na délce souboru a kvalitě textu — typicky desítky sekund až
          několik minut u velkých skenů. Po dokončení uvidíte v detailu rozklad času (předzpracování vs. AI). Stránka
          se automaticky aktualizuje.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-md">
        {PROCESSING_STEPS.filter((s) => s.key !== "processing" && s.key !== "uploaded").map((s, i) => {
          const steps = PROCESSING_STEPS.filter((x) => x.key !== "processing" && x.key !== "uploaded");
          const active = i <= frame % steps.length;
          return (
            <div
              key={s.key}
              className={`h-1.5 rounded-full transition-all duration-700 ${active ? "w-8 bg-indigo-500" : "w-4 bg-[color:var(--wp-surface-card-border)]"}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function ContractReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const toast = useToast();
  const confirm = useConfirm();

  const [doc, setDoc] = useState<ExtractionDocument | null>(null);
  const [rawExtractedPayload, setRawExtractedPayload] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingStepHint, setProcessingStepHint] = useState<string | undefined>();
  const [scanRetryBusy, setScanRetryBusy] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [matchedClientId, setMatchedClientId] = useState<string | null>(null);
  const [linkDocBusy, setLinkDocBusy] = useState(false);
  const pollTimeoutRef = useRef<number | null>(null);
  const pollBackoffMsRef = useRef(2500);
  /** Aktuální iterace backoff pollingu (pro visibility + hidden interval). */
  const pollRunRef = useRef<(() => Promise<void>) | null>(null);
  const processingStartedRef = useRef(false);
  /** `pdfUrl` zrcadlo pro load/poller, abychom neinvaliovali useCallback pokaždé, když se PDF URL načte — dříve to restartovalo polling a způsobovalo re-entrance race. */
  const pdfUrlRef = useRef("");

  const loadPdf = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts/review/${id}/file`);
      if (res.ok) {
        const data = (await res.json()) as { url?: string };
        const url = data.url;
        if (url) {
          pdfUrlRef.current = url;
          setPdfUrl(url);
          setDoc((prev) => (prev ? { ...prev, pdfUrl: url } : prev));
        }
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
      setMatchedClientId(typeof data.matchedClientId === "string" ? data.matchedClientId : null);
      // F0-1 (C-01): snapshot raw envelope tak, aby Approve/Approve+Apply mohl
      // poslat aktuální snapshot spolu s field edits. Bez tohoto se UI edity
      // sice zobrazí, ale do DB přes `approveContractReview` nedojdou
      // (rawExtractedPayload zůstal null a server edity zahodil).
      setRawExtractedPayload(
        data.extractedPayload && typeof data.extractedPayload === "object"
          ? (data.extractedPayload as Record<string, unknown>)
          : null
      );
      const mapped = mapApiToExtractionDocument(data, pdfUrlRef.current);
      setDoc(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current != null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollRunRef.current = null;
  }, []);

  /** Exponential backoff (2.5s → ~12s cap) snižuje počet requestů při dlouhém běhu AI. Na skrytém tabu se interval prodlouží. */
  const startPolling = useCallback(() => {
    stopPolling();
    pollBackoffMsRef.current = 2500;
    const run = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        pollTimeoutRef.current = window.setTimeout(() => {
          void pollRunRef.current?.();
        }, HIDDEN_POLL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/contracts/review/${id}`);
        if (!res.ok) {
          pollBackoffMsRef.current = Math.min(Math.round(pollBackoffMsRef.current * 1.35), 12000);
          pollTimeoutRef.current = window.setTimeout(() => {
            void pollRunRef.current?.();
          }, pollBackoffMsRef.current);
          return;
        }
        const data = await res.json();
        const status: string = data.processingStatus ?? "";
        setProcessingStatus(status);
        setMatchedClientId(typeof data.matchedClientId === "string" ? data.matchedClientId : null);
        const hint = processingStepHintFromTrace(data.extractionTrace);
        if (hint) setProcessingStepHint(hint);
        if (status !== "uploaded" && status !== "processing") {
          stopPolling();
          pollBackoffMsRef.current = 2500;
          setRawExtractedPayload(
            data.extractedPayload && typeof data.extractedPayload === "object"
              ? (data.extractedPayload as Record<string, unknown>)
              : null
          );
          const mapped = mapApiToExtractionDocument(data, pdfUrlRef.current);
          setDoc(mapped);
          setLoading(false);
          if (status === "failed") {
            const trace = data.extractionTrace as { ocrWatchdogExpired?: boolean } | undefined;
            if (trace?.ocrWatchdogExpired) {
              setError(null);
            } else {
              setError(data.errorMessage ?? "Extrakce selhala.");
            }
          }
          return;
        }
      } catch {
        /* keep retrying */
      }
      pollBackoffMsRef.current = Math.min(Math.round(pollBackoffMsRef.current * 1.35), 12000);
      pollTimeoutRef.current = window.setTimeout(() => {
        void pollRunRef.current?.();
      }, pollBackoffMsRef.current);
    };
    pollRunRef.current = run;
    pollTimeoutRef.current = window.setTimeout(() => {
      void run();
    }, pollBackoffMsRef.current);
  }, [id, stopPolling]);

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

  const handleRetryAfterScan = useCallback(async () => {
    setScanRetryBusy(true);
    processingStartedRef.current = false;
    try {
      const res = await fetch(`/api/contracts/review/${id}/process`, { method: "POST" });
      if (res.ok || res.status === 409) {
        setProcessingStatus("processing");
        setProcessingStepHint("preprocessing");
        startPolling();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.showToast(body.error ?? "Spuštění zpracování selhalo.", "error");
    } catch {
      toast.showToast("Spuštění zpracování selhalo.", "error");
    } finally {
      setScanRetryBusy(false);
    }
  }, [id, startPolling, toast]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  /** `scan_pending_ocr` — periodické GET kvůli serverovému watchdog; žádné nekonečné „ticho“. */
  useEffect(() => {
    if (processingStatus !== "scan_pending_ocr") return;
    const scanPollTimer = window.setInterval(() => {
      void load();
    }, 20_000);
    return () => window.clearInterval(scanPollTimer);
  }, [processingStatus, load]);

  /** Odpočet / uplynulý čas u scan pending */
  useEffect(() => {
    if (processingStatus !== "scan_pending_ocr") return;
    const t = window.setInterval(() => setNowTick(Date.now()), 10_000);
    return () => window.clearInterval(t);
  }, [processingStatus]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (pollTimeoutRef.current == null) return;
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
      void pollRunRef.current?.();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const handleBack = useCallback(() => {
    router.push("/portal/contracts/review");
  }, [router]);

  const handleDiscard = useCallback(async () => {
    const message =
      "Smazat soubor z úložiště i z revize? Tím odeberete dokument a související data.";
    if (
      !(await confirm({
        title: "Smazat revizi",
        message,
        confirmLabel: "Smazat",
        variant: "destructive",
      }))
    ) {
      return;
    }
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
  }, [confirm, id, router, toast]);

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

  const ensureClientResolvedForApply = useCallback(async (): Promise<boolean> => {
    const alreadyResolved =
      !!matchedClientId || !!doc?.matchedClientId || doc?.createNewClientConfirmed === "true";
    if (alreadyResolved) return true;

    const verdict = resolveMatchVerdictFromDoc(doc);
    if (verdict === "ambiguous_match") {
      toast.showToast(
        "Nejdřív vyberte klienta v sekci níže — propsání do Aidvisory je do výběru pozastavené.",
        "error"
      );
      return false;
    }
    if (verdict === "near_match" || verdict === "existing_match") {
      return true;
    }

    const payload = rawExtractedPayload;
    if (payload && isSupportingDocumentOnly(payload)) {
      toast.showToast(
        "U podpůrného dokumentu vyberte klienta pro připojení — automatické založení nového klienta zde není k dispozici.",
        "error"
      );
      return false;
    }

    if (
      verdict == null &&
      Array.isArray(doc?.clientMatchCandidates) &&
      doc.clientMatchCandidates.length > 1
    ) {
      toast.showToast("Vyberte klienta z kandidátů.", "error");
      return false;
    }

    const result = await confirmCreateNewClient(id);
    if (!result.ok) {
      toast.showToast(result.error ?? "Nepodařilo se připravit klienta pro zápis.", "error");
      return false;
    }
    return true;
  }, [doc, id, matchedClientId, rawExtractedPayload, toast]);

  const handleApply = useCallback(async (options?: {
    overrideGateReasons?: string[];
    overrideReason?: string;
  }) => {
    setActionLoading("apply");
    try {
      const ready = await ensureClientResolvedForApply();
      if (!ready) return;
      const result = await applyContractReviewDrafts(id, options);
      if (result.ok) {
        toast.showToast("Údaje propsány do Aidvisory.", "success");
        load();
      } else {
        toast.showToast(result.error ?? "Chyba", "error");
      }
    } finally {
      setActionLoading(null);
    }
  }, [ensureClientResolvedForApply, id, toast, load]);

  const handleApproveAndApply = useCallback(
    async (
      editedFields: Record<string, string>,
      options?: {
        overrideGateReasons?: string[];
        overrideReason?: string;
      }
    ) => {
      setActionLoading("approveApply");
      try {
        const ready = await ensureClientResolvedForApply();
        if (!ready) return;
        const result = await approveAndApplyContractReview(id, {
          fieldEdits: editedFields,
          rawExtractedPayload: rawExtractedPayload ?? undefined,
          overrideGateReasons: options?.overrideGateReasons,
          overrideReason: options?.overrideReason,
        });
        if (result.ok) {
          toast.showToast("Kontrola schválena a údaje propsány do Aidvisory.", "success");
          load();
        } else {
          toast.showToast(result.error ?? "Chyba", "error");
        }
      } finally {
        setActionLoading(null);
      }
    },
    [ensureClientResolvedForApply, id, rawExtractedPayload, toast, load]
  );

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
          throw new Error(result.error ?? "Nepodařilo se uložit výběr klienta.");
        }
      } finally {
        setActionLoading(null);
      }
    },
    [id, toast, load]
  );

  const handleLinkToClientDocuments = useCallback(
    async (visibleToClient: boolean) => {
      setLinkDocBusy(true);
      try {
        const result = await linkContractReviewFileToContactDocuments(id, { visibleToClient });
        if (result.ok) {
          toast.showToast(
            visibleToClient
              ? "Soubor je v dokumentech klienta a viditelný v portálu."
              : "Soubor je v dokumentech klienta (zatím jen interně).",
            "success"
          );
        } else {
          toast.showToast(result.error ?? "Chyba", "error");
        }
      } finally {
        setLinkDocBusy(false);
      }
    },
    [id, toast]
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

  const handleConfirmFinalContract = useCallback(
    async (gateReasons: string[]) => {
      const result = await persistFinalContractOverride(id, gateReasons);
      if (!result.ok) throw new Error(result.error);
      load();
    },
    [id, load]
  );

  /** Fáze 11: Per-field pending confirmation handler */
  const handleConfirmPendingField = useCallback(
    async (fieldKey: string, scope: "contact" | "contract" | "payment") => {
      const result = await confirmPendingField(id, fieldKey, scope);
      if (result.ok) {
        toast.showToast(`Pole "${fieldKey}" potvrzeno a zapsáno.`, "success");
        load();
      } else {
        toast.showToast(result.error ?? "Potvrzení selhalo.", "error");
        throw new Error(result.error);
      }
    },
    [id, toast, load]
  );

  /** Fáze 12: Ruční doplnění manual_required pole handler */
  const handleConfirmManualField = useCallback(
    async (fieldKey: string, scope: "contact" | "contract" | "payment", value: string) => {
      const result = await confirmManualField(id, fieldKey, scope, value);
      if (result.ok) {
        toast.showToast(`Pole "${fieldKey}" doplněno a propsáno do Aidvisory.`, "success");
        load();
      } else {
        toast.showToast(result.error ?? "Zápis selhal.", "error");
        throw new Error(result.error);
      }
    },
    [id, toast, load]
  );

  /** Fáze 12b: Bulk potvrzení všech prefill_confirm polí najednou */
  const handleConfirmAllPendingFields = useCallback(
    async () => {
      const result = await confirmAllPendingFields(id);
      if (result.ok) {
        if (result.confirmedCount > 0) {
          toast.showToast(`${result.confirmedCount} ${result.confirmedCount === 1 ? "pole potvrzeno" : "polí potvrzeno"} a propsáno do Aidvisory.`, "success");
        } else {
          toast.showToast("Žádná pole k potvrzení.", "info");
        }
        load();
      } else {
        toast.showToast(result.error ?? "Hromadné potvrzení selhalo.", "error");
      }
    },
    [id, toast, load]
  );

  if (processingStatus === "uploaded" || processingStatus === "processing") {
    return <ProcessingProgress stepHint={processingStepHint} />;
  }

  if (processingStatus === "scan_pending_ocr") {
    const policy = doc?.ocrScanPendingPolicy;
    const maxMin = Math.round((policy?.maxWaitMs ?? DEFAULT_OCR_SCAN_PENDING_MAX_MS) / 60_000);
    const since = (doc?.extractionTrace as { ocrScanPendingSinceMs?: number } | undefined)?.ocrScanPendingSinceMs;
    const elapsedMin =
      since != null ? Math.max(0, Math.floor((nowTick - since) / 60_000)) : null;
    const remainingMin =
      policy?.msUntilExpiry != null ? Math.max(0, Math.ceil(policy.msUntilExpiry / 60_000)) : null;

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 px-4 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-2xl font-black">
          OCR
        </div>
        <div>
          <h1 className="text-xl font-black text-[color:var(--wp-text)] mb-2">Čeká na čitelný text (sken / OCR)</h1>
          <p className="text-sm text-[color:var(--wp-text-secondary)] leading-relaxed mb-3">
            Soubor vypadá jako naskenovaný dokument nebo obrázek — AI Review potřebuje dostatek strojově čitelného textu.
            Toto není „nekonečný job“ v pozadí: pokud stav nepřejde do výsledku, server ho po {maxMin} minutách ukončí a
            nabídne znovu spustit zpracování.
          </p>
          {(elapsedMin != null || remainingMin != null) && (
            <p className="text-xs font-semibold text-amber-900/90 mb-3" role="status">
              {elapsedMin != null ? `Uplynulo přibližně ${elapsedMin} min.` : null}
              {elapsedMin != null && remainingMin != null ? " · " : null}
              {remainingMin != null
                ? `Do automatického ukončení zbývá přibližně ${remainingMin} min.`
                : null}
            </p>
          )}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left space-y-2">
            <p className="text-xs font-bold text-amber-900">Co dál?</p>
            <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside leading-relaxed">
              <li>Pokud máte PDF s textovou vrstvou, klikněte „Zkusit znovu“ — server nejdřív zkusí nativní text vrstvy.</li>
              <li>Pokud je soubor čistě skenem, zapněte Adobe OCR v nastavení a znovu spusťte zpracování.</li>
              <li>Alternativně nahrajte verzi dokumentu s textovou vrstvou (ne čistý scan).</li>
            </ul>
          </div>
        </div>
        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-bold text-indigo-600 hover:text-indigo-800"
          >
            Otevřít náhled dokumentu
          </a>
        ) : null}
        <button
          type="button"
          disabled={scanRetryBusy}
          onClick={() => void handleRetryAfterScan()}
          className="min-h-[44px] px-6 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
        >
          {scanRetryBusy ? "Spouštím…" : "Zkusit zpracování znovu"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/portal/contracts/review")}
          className="text-sm font-semibold text-[color:var(--wp-text-secondary)]"
        >
          Zpět na seznam
        </button>
      </div>
    );
  }

  if (loading && !doc) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm font-bold text-[color:var(--wp-text-secondary)]">Načítám AI extrakci…</p>
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
          <p className="text-sm font-bold text-[color:var(--wp-text)]">{error ?? "Dokument nenalezen."}</p>
          <button onClick={handleBack} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
            Zpět na seznam
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      {doc.processingStatus === "blocked" ? (
        <div
          role="status"
          className="mx-4 md:mx-6 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950"
        >
          <p className="font-bold mb-1">Platba / údaje vyžadují kontrolu</p>
          <p className="text-orange-900/90 leading-relaxed">
            Dokument je zpracovaný, ale kritická pole nejsou dostatečně jistá. Zkontrolujte extrahované hodnoty před
            schválením; návrh platby do portálu se nevytvoří, dokud stav neodpovídá pravidlům kvality.
          </p>
        </div>
      ) : null}
      <AIReviewExtractionShell
        doc={doc}
        onBack={handleBack}
        onDiscard={handleDiscard}
        onApprove={handleApprove}
        onApproveAndApply={handleApproveAndApply}
        onReject={handleReject}
        onApply={handleApply}
        onSelectClient={handleSelectClient}
        onConfirmCreateNew={handleConfirmCreateNew}
        onConfirmFinalContract={handleConfirmFinalContract}
        onConfirmPendingField={handleConfirmPendingField}
        onConfirmManualField={handleConfirmManualField}
        onConfirmAllPendingFields={handleConfirmAllPendingFields}
        isApproving={actionLoading === "approve"}
        actionLoading={actionLoading}
        onRefreshPdf={loadPdf}
        onLinkToClientDocuments={handleLinkToClientDocuments}
        linkDocBusy={linkDocBusy}
        onRetryPipeline={
          doc.processingStatus === "failed" &&
          (doc.extractionTrace as { ocrWatchdogExpired?: boolean } | undefined)?.ocrWatchdogExpired
            ? handleRetryAfterScan
            : undefined
        }
        retryPipelineBusy={scanRetryBusy}
      />
    </div>
  );
}
