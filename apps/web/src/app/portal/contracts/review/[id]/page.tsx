"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  approveContractReview,
  rejectContractReview,
  applyContractReviewDrafts,
  selectMatchedClient,
  confirmCreateNewClient,
} from "@/app/actions/contract-review";
import { useToast } from "@/app/components/Toast";
import { FileText, ChevronLeft, UserPlus, Check, X, Send, AlertTriangle } from "lucide-react";

type ClientMatchCandidate = {
  clientId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  matchedFields: Record<string, boolean>;
  displayName?: string;
};

type ReviewDetail = {
  id: string;
  fileName: string;
  processingStatus: string;
  errorMessage?: string | null;
  extractedPayload?: Record<string, unknown>;
  clientMatchCandidates?: ClientMatchCandidate[];
  draftActions?: Array<{ type: string; label: string; payload: Record<string, unknown> }>;
  confidence?: number | null;
  reasonsForReview?: string[] | null;
  reviewStatus?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectReason?: string | null;
  appliedBy?: string | null;
  appliedAt?: string | null;
  matchedClientId?: string | null;
  createNewClientConfirmed?: string | null;
  applyResultPayload?: {
    createdClientId?: string;
    linkedClientId?: string;
    createdContractId?: string;
    createdTaskId?: string;
  };
};

export default function ContractReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const toast = useToast();
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async () => {
    setActionLoading("approve");
    try {
      const result = await approveContractReview(id);
      if (result.ok) {
        toast.showToast("Položka schválena.", "success");
        load();
      } else {
        toast.showToast(result.error ?? "Chyba", "error");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    setActionLoading("reject");
    try {
      const result = await rejectContractReview(id, rejectReason || undefined);
      if (result.ok) {
        toast.showToast("Položka zamítnuta.", "success");
        setShowRejectModal(false);
        setRejectReason("");
        load();
      } else {
        toast.showToast(result.error ?? "Chyba", "error");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelectClient = async (clientId: string) => {
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
  };

  const handleConfirmCreateNew = async () => {
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
  };

  const handleApply = async () => {
    setActionLoading("apply");
    try {
      const result = await applyContractReviewDrafts(id);
      if (result.ok) {
        toast.showToast("Akce aplikovány do CRM.", "success");
        setShowApplyConfirm(false);
        load();
      } else {
        toast.showToast(result.error ?? "Chyba", "error");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const openOriginalFile = async () => {
    try {
      const res = await fetch(`/api/contracts/review/${id}/file`);
      if (!res.ok) throw new Error("Odkaz nelze vytvořit.");
      const { url } = await res.json();
      if (url) window.open(url, "_blank");
    } catch {
      toast.showToast("Otevření souboru selhalo.", "error");
    }
  };

  if (loading && !detail) {
    return (
      <div className="p-6 text-center" style={{ color: "var(--wp-text-muted)" }}>
        Načítám…
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error ?? "Položka nenalezena."}</p>
        <Link href="/portal/contracts/review" className="text-sm mt-2 inline-block" style={{ color: "var(--wp-accent)" }}>
          ← Zpět na seznam
        </Link>
      </div>
    );
  }

  const extracted = detail.extractedPayload as Record<string, unknown> | undefined;
  const client = extracted?.client as Record<string, unknown> | undefined;
  const candidates = (detail.clientMatchCandidates ?? []) as ClientMatchCandidate[];
  const isApplied = detail.reviewStatus === "applied";
  const isPending = detail.reviewStatus === "pending" || !detail.reviewStatus;
  const canApproveReject =
    isPending && (detail.processingStatus === "extracted" || detail.processingStatus === "review_required");
  const isApproved = detail.reviewStatus === "approved";
  const hasResolvedClient = !!detail.matchedClientId || detail.createNewClientConfirmed === "true";
  const canApply = isApproved && hasResolvedClient && !isApplied;
  const lowConfidence = (detail.confidence ?? 0) < 0.7;
  const missingFields = (extracted?.missingFields as string[] | undefined) ?? [];

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/portal/contracts/review"
          className="flex items-center gap-1 text-sm"
          style={{ color: "var(--wp-accent)" }}
        >
          <ChevronLeft size={18} /> Zpět na seznam
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--wp-text)" }}>
          Review: {detail.fileName}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--wp-text-muted)" }}>
          Stav: {detail.processingStatus} / {detail.reviewStatus ?? "—"}
          {detail.appliedAt && ` · Aplikováno ${new Date(detail.appliedAt).toLocaleString("cs-CZ")}`}
        </p>
      </div>

      {lowConfidence && (
        <div
          className="flex items-start gap-2 rounded-lg border p-3 mb-4"
          style={{ borderColor: "var(--wp-border)", background: "var(--wp-bg)" }}
        >
          <AlertTriangle size={20} className="shrink-0" style={{ color: "var(--wp-text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--wp-text)" }}>
            Nízká confidence ({Math.round((detail.confidence ?? 0) * 100)} %). Zkontrolujte extrahované údaje.
          </p>
        </div>
      )}

      {missingFields.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 mb-4 text-sm">
          <p className="font-medium mb-1" style={{ color: "var(--wp-text)" }}>Chybějící pole</p>
          <ul className="list-disc list-inside" style={{ color: "var(--wp-text-muted)" }}>
            {missingFields.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--wp-text-muted)" }}>
          Metadata souboru
        </h2>
        <p className="text-sm" style={{ color: "var(--wp-text)" }}>
          Soubor: {detail.fileName}
        </p>
        <button
          type="button"
          onClick={openOriginalFile}
          className="mt-2 text-sm font-medium flex items-center gap-1"
          style={{ color: "var(--wp-accent)" }}
        >
          <FileText size={14} /> Otevřít originální PDF
        </button>
      </section>

      {extracted && (
        <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--wp-text-muted)" }}>
            Extrahovaná smlouva
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <dt style={{ color: "var(--wp-text-muted)" }}>Instituce</dt>
            <dd style={{ color: "var(--wp-text)" }}>{String(extracted.institutionName ?? "—")}</dd>
            <dt style={{ color: "var(--wp-text-muted)" }}>Číslo smlouvy</dt>
            <dd style={{ color: "var(--wp-text)" }}>{String(extracted.contractNumber ?? "—")}</dd>
            <dt style={{ color: "var(--wp-text-muted)" }}>Produkt</dt>
            <dd style={{ color: "var(--wp-text)" }}>{String(extracted.productName ?? "—")}</dd>
            <dt style={{ color: "var(--wp-text-muted)" }}>Klient</dt>
            <dd style={{ color: "var(--wp-text)" }}>
              {client ? [client.fullName, client.firstName, client.lastName].filter(Boolean).join(" ") || "—" : "—"}
            </dd>
            {client && (
              <>
                <dt style={{ color: "var(--wp-text-muted)" }}>E-mail / telefon</dt>
                <dd style={{ color: "var(--wp-text)" }}>{[client.email, client.phone].filter(Boolean).join(" · ") || "—"}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {detail.reasonsForReview?.length ? (
        <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--wp-text-muted)" }}>
            Důvody pro kontrolu
          </h2>
          <ul className="list-disc list-inside text-sm" style={{ color: "var(--wp-text)" }}>
            {detail.reasonsForReview.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--wp-text-muted)" }}>
          Kandidáti klientů
        </h2>
        {candidates.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--wp-text-muted)" }}>
            Žádní kandidáti. Při aplikaci bude vytvořen nový klient podle draft akce.
          </p>
        ) : (
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li
                key={c.clientId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                style={{ borderColor: "var(--wp-border)", background: "var(--wp-bg)" }}
              >
                <div>
                  <p className="font-medium text-sm" style={{ color: "var(--wp-text)" }}>
                    {c.displayName ?? c.clientId}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--wp-text-muted)" }}>
                    Skóre: {Math.round(c.score * 100)} % · {c.confidence} · {c.reasons.join(", ")}
                  </p>
                </div>
                {!isApplied && (
                  <button
                    type="button"
                    onClick={() => handleSelectClient(c.clientId)}
                    disabled={!!actionLoading || detail.matchedClientId === c.clientId}
                    className="text-sm px-3 py-1.5 rounded-lg border flex items-center gap-1"
                    style={{
                      borderColor: "var(--wp-border)",
                      color: detail.matchedClientId === c.clientId ? "var(--wp-accent)" : "var(--wp-text)",
                    }}
                  >
                    {detail.matchedClientId === c.clientId ? <Check size={14} /> : null}
                    {detail.matchedClientId === c.clientId ? "Vybráno" : "Vybrat tohoto klienta"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!isApplied && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleConfirmCreateNew}
              disabled={!!actionLoading || detail.createNewClientConfirmed === "true"}
              className="text-sm px-3 py-2 rounded-lg border flex items-center gap-2"
              style={{
                borderColor: "var(--wp-border)",
                color: detail.createNewClientConfirmed === "true" ? "var(--wp-accent)" : "var(--wp-text)",
              }}
            >
              <UserPlus size={16} />
              {detail.createNewClientConfirmed === "true" ? "Vytvoření nového klienta potvrzeno" : "Vytvořit nového klienta"}
            </button>
          </div>
        )}
      </section>

      {detail.draftActions?.length ? (
        <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--wp-text-muted)" }}>
            Návrhové akce
          </h2>
          <ul className="text-sm space-y-1" style={{ color: "var(--wp-text)" }}>
            {detail.draftActions.map((a, i) => (
              <li key={i}>{a.label}</li>
            ))}
          </ul>
        </section>
      )}

      {isApplied && detail.applyResultPayload && (
        <section className="rounded-xl border p-4 mb-4" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--wp-text-muted)" }}>
            Výsledek aplikace
          </h2>
          <ul className="text-sm space-y-1" style={{ color: "var(--wp-text)" }}>
            {detail.applyResultPayload.createdClientId && (
              <li>Vytvořen klient: {detail.applyResultPayload.createdClientId}</li>
            )}
            {detail.applyResultPayload.linkedClientId && !detail.applyResultPayload.createdClientId && (
              <li>Propojen klient: {detail.applyResultPayload.linkedClientId}</li>
            )}
            {detail.applyResultPayload.createdContractId && (
              <li>Vytvořena smlouva: {detail.applyResultPayload.createdContractId}</li>
            )}
            {detail.applyResultPayload.createdTaskId && (
              <li>Vytvořen úkol: {detail.applyResultPayload.createdTaskId}</li>
            )}
          </ul>
        </section>
      )}

      {!isApplied && (
        <section className="rounded-xl border p-4 flex flex-wrap gap-3" style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}>
          {canApproveReject && (
            <>
              <button
                type="button"
                onClick={handleApprove}
                disabled={!!actionLoading}
                className="px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                <Check size={18} /> Schválit
              </button>
              <button
                type="button"
                onClick={() => setShowRejectModal(true)}
                disabled={!!actionLoading}
                className="px-4 py-2 rounded-lg font-medium flex items-center gap-2 border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <X size={18} /> Zamítnout
              </button>
            </>
          )}
          {canApply && (
            <button
              type="button"
              onClick={() => setShowApplyConfirm(true)}
              disabled={!!actionLoading}
              className="px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send size={18} /> Aplikovat do CRM
            </button>
          )}
          {isApproved && !hasResolvedClient && (
            <p className="text-sm w-full" style={{ color: "var(--wp-text-muted)" }}>
              Pro aplikaci vyberte klienta z kandidátů nebo potvrďte vytvoření nového klienta.
            </p>
          )}
        </section>
      )}

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowRejectModal(false)}>
          <div
            className="rounded-xl border p-6 max-w-md w-full shadow-lg"
            style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--wp-text)" }}>Zamítnout položku</h3>
            <label className="block text-sm mt-2" style={{ color: "var(--wp-text-muted)" }}>
              Důvod (volitelné)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full mt-1 rounded-lg border p-2 text-sm"
              style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
              placeholder="Např. špatná smlouva, duplicita…"
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={!!actionLoading}
                className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === "reject" ? "Zamítám…" : "Zamítnout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showApplyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowApplyConfirm(false)}>
          <div
            className="rounded-xl border p-6 max-w-md w-full shadow-lg"
            style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--wp-text)" }}>Aplikovat do CRM?</h3>
            <p className="text-sm mb-4" style={{ color: "var(--wp-text-muted)" }}>
              Návrhové akce (klient, smlouva, úkol…) budou zapsány do CRM. Tuto akci lze provést jen jednou.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowApplyConfirm(false)}
                className="px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!!actionLoading}
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading === "apply" ? "Aplikuji…" : "Aplikovat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
