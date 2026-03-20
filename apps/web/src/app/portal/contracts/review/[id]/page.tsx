"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  approveContractReview,
  rejectContractReview,
  applyContractReviewDrafts,
  selectMatchedClient,
  confirmCreateNewClient,
} from "@/app/actions/contract-review";
import { useToast } from "@/app/components/Toast";
import { ContractReviewDetailView } from "./ContractReviewDetailView";

type ClientMatchCandidate = {
  clientId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  matchedFields: Record<string, boolean>;
  displayName?: string;
};

type ValidationWarningItem = { code?: string; message: string; field?: string };

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
    bridgeSuggestions?: Array<{
      id: string;
      label: string;
      href: string;
      type: "analysis" | "service_action";
    }>;
  };
  detectedDocumentType?: string | null;
  inputMode?: string | null;
  extractionMode?: string | null;
  extractionTrace?: { failedStep?: string; warnings?: string[] } | null;
  validationWarnings?: ValidationWarningItem[] | null;
  fieldConfidenceMap?: Record<string, number> | null;
  classificationReasons?: string[] | null;
};

export default function ContractReviewDetailPage() {
  const params = useParams();
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

  const extracted = detail?.extractedPayload as Record<string, unknown> | undefined;
  const client = extracted?.client as Record<string, unknown> | undefined;
  const candidates = (detail?.clientMatchCandidates ?? []) as ClientMatchCandidate[];
  const isApplied = detail?.reviewStatus === "applied";
  const isPending = detail?.reviewStatus === "pending" || !detail?.reviewStatus;
  const canApproveReject =
    isPending && (detail?.processingStatus === "extracted" || detail?.processingStatus === "review_required");
  const isApproved = detail?.reviewStatus === "approved";
  const hasResolvedClient = !!detail?.matchedClientId || detail?.createNewClientConfirmed === "true";
  const canApply = isApproved && hasResolvedClient && !isApplied;
  const confidenceVal = detail?.confidence ?? 0;
  const lowConfidence = confidenceVal < 0.7;
  const missingFields = (extracted?.missingFields as string[] | undefined) ?? [];

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

  return (
    <ContractReviewDetailView
      detail={detail}
      extracted={extracted}
      client={client}
      candidates={candidates}
      isApplied={isApplied}
      canApproveReject={canApproveReject}
      isApproved={isApproved}
      hasResolvedClient={hasResolvedClient}
      canApply={canApply}
      lowConfidence={lowConfidence}
      missingFields={missingFields}
      actionLoading={actionLoading}
      rejectReason={rejectReason}
      showRejectModal={showRejectModal}
      showApplyConfirm={showApplyConfirm}
      onOpenOriginalFile={openOriginalFile}
      onSelectClient={handleSelectClient}
      onConfirmCreateNew={handleConfirmCreateNew}
      onApprove={handleApprove}
      onReject={handleReject}
      setShowRejectModal={setShowRejectModal}
      setRejectReason={setRejectReason}
      setShowApplyConfirm={setShowApplyConfirm}
      onApply={handleApply}
    />
  );
}
