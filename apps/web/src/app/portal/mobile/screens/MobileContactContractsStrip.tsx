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
          href={`/portal/contacts/${contactId}?tab=smlouvy`}
          className="mt-3 block w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 text-center text-sm font-bold text-indigo-800 py-3 px-4"
        >
          Otevřít smlouvy v portálu
        </Link>
      </MobileSection>
    );
  }

  return (
    <MobileSection title={`Produkty / smlouvy (${contracts.length})`}>
      <ul className="space-y-2">
        {contracts.map((c) => {
          const aiKind = resolveAiProvenanceKind(c.sourceKind, c.advisorConfirmedAt);
          const prov = provenanceMap[c.id];
          return (
            <li key={c.id}>
              <MobileCard className="p-3.5 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[color:var(--wp-text)] break-words">
                    {c.contractNumber ? `č. ${c.contractNumber} · ` : ""}
                    {segmentLabel(c.segment)}
                    {c.partnerName || c.productName ? ` — ${c.partnerName || c.productName}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-col gap-1.5 min-w-0">
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
                      <span className="inline-flex items-start gap-1.5 text-[10px] text-slate-600 leading-snug">
                        <FileCheck className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden />
                        <span>
                          Podkladový dokument — evidenční záznam bez potvrzovacího toku
                        </span>
                      </span>
                    ) : prov ? (
                      <ContractPendingFieldsGuard contractId={c.id} provenance={prov} />
                    ) : null}
                  </div>
                </div>
              </MobileCard>
            </li>
          );
        })}
      </ul>
      <Link
        href={`/portal/contacts/${contactId}?tab=smlouvy`}
        className="mt-3 block w-full text-center text-xs font-bold text-indigo-700 min-h-[44px] py-2"
      >
        Celý přehled v portálu
      </Link>
    </MobileSection>
  );
}
