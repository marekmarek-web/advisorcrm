"use client";

import { useEffect, useState } from "react";
import { FileCheck } from "lucide-react";
import Link from "next/link";
import { fetchContactDocumentsBundle } from "@/app/dashboard/contacts/contact-documents-bundle";
import { getContractAiProvenance } from "@/app/actions/contracts";
import type { ContractRow, ContractAiProvenanceResult } from "@/app/actions/contracts";
import { AiReviewProvenanceBadge } from "@/app/components/aidvisora/AiReviewProvenanceBadge";
import { contractSourceKindLabel, resolveAiProvenanceKind } from "@/lib/portal/ai-review-provenance";
import { ContractPendingFieldsGuard } from "@/app/dashboard/contacts/[id]/ContractPendingFieldsGuard";
import { MobileSection, MobileCard, EmptyState } from "@/app/shared/mobile-ui/primitives";
import { segmentLabel } from "@/app/lib/segment-labels";

const PARTNER_PALETTE = [
  "bg-indigo-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-teal-500",
];

function partnerColor(name: string): string {
  if (!name) return PARTNER_PALETTE[0];
  const idx = Array.from(name).reduce((s, c) => s + c.charCodeAt(0), 0) % PARTNER_PALETTE.length;
  return PARTNER_PALETTE[idx];
}

function partnerMonogram(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

/**
 * F8: Parita s desktop ContractsSection — zdroj smlouvy, pending confirm,
 * supporting-doc guard (bez plného CRM editoru).
 */
export function MobileContactContractsStrip({ contactId }: { contactId: string }) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [provenanceMap, setProvenanceMap] = useState<Record<string, ContractAiProvenanceResult | null | undefined>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchContactDocumentsBundle(contactId)
      .then(({ contracts: list }) => {
        if (!cancelled) setContracts(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  useEffect(() => {
    const aiContracts = contracts.filter((c) => c.sourceKind === "ai_review" && c.sourceContractReviewId);
    for (const c of aiContracts) {
      if (provenanceMap[c.id] !== undefined) continue;
      void getContractAiProvenance(c.id).then((prov) => {
        setProvenanceMap((prev) => ({ ...prev, [c.id]: prov }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only when contract ids change
  }, [contracts]);

  if (loading) {
    return (
      <MobileSection title="Produkty / smlouvy">
        <div className="h-16 rounded-2xl bg-[color:var(--wp-surface-card-border)]/50 animate-pulse" />
      </MobileSection>
    );
  }

  if (contracts.length === 0) {
    return (
      <MobileSection title="Produkty / smlouvy">
        <EmptyState title="Žádné smlouvy" description="Přidejte produkt v desktopovém portálu nebo přes AI Review." />
        <Link
          href={`/portal/contacts/${contactId}?tab=prehled`}
          className="mt-3 block w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 text-center text-sm font-bold text-indigo-800 py-3 px-4"
        >
          Otevřít přehled v portálu
        </Link>
      </MobileSection>
    );
  }

  return (
    <MobileSection title={`Produkty / smlouvy (${contracts.length})`}>
      <ul className="space-y-3">
        {contracts.map((c) => {
          const aiKind = resolveAiProvenanceKind(c.sourceKind, c.advisorConfirmedAt);
          const prov = provenanceMap[c.id];
          const partnerName = c.partnerName || "";
          const title = c.productName || segmentLabel(c.segment);
          const subtitle = partnerName || segmentLabel(c.segment);
          return (
            <li key={c.id}>
              <MobileCard className="min-w-0 p-4 shadow-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-black uppercase text-white shadow-sm ${partnerColor(partnerName)}`}
                    aria-hidden
                  >
                    {partnerMonogram(partnerName || title)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-snug text-[color:var(--wp-text)]">
                      {title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-[color:var(--wp-text-secondary)]">
                      {subtitle}
                    </p>
                    {c.contractNumber ? (
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
                        č. {c.contractNumber}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2.5 flex min-w-0 flex-col gap-1.5">
                  {aiKind ? (
                    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-1">
                      <AiReviewProvenanceBadge
                        kind={aiKind}
                        reviewId={c.sourceContractReviewId}
                        confirmedAt={c.advisorConfirmedAt}
                        className="max-w-full flex-wrap [&_a]:break-words"
                      />
                    </span>
                  ) : (
                    <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">
                      Zdroj: {contractSourceKindLabel(c.sourceKind)}
                    </span>
                  )}
                  {c.sourceKind === "ai_review" && c.sourceContractReviewId && prov === undefined ? (
                    <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">Načítám stav polí…</span>
                  ) : null}
                  {prov?.supportingDocumentGuard ? (
                    <span className="inline-flex items-start gap-1.5 text-[10px] leading-snug text-slate-600">
                      <FileCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      <span>Podkladový dokument — evidenční záznam bez potvrzovacího toku</span>
                    </span>
                  ) : prov ? (
                    <ContractPendingFieldsGuard contractId={c.id} provenance={prov} />
                  ) : null}
                </div>
              </MobileCard>
            </li>
          );
        })}
      </ul>
      <Link
        href={`/portal/contacts/${contactId}?tab=prehled`}
        className="mt-3 flex min-h-[44px] w-full items-center justify-center text-center text-xs font-bold text-indigo-700"
      >
        Celý přehled v portálu
      </Link>
    </MobileSection>
  );
}
