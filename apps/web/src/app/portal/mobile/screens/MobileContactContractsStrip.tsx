"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { FileCheck, Banknote, Hash, CalendarClock, Coins } from "lucide-react";
import Link from "next/link";
import { fetchContactDocumentsBundle } from "@/app/dashboard/contacts/contact-documents-bundle";
import { getContractAiProvenance } from "@/app/actions/contracts";
import type { ContractRow, ContractAiProvenanceResult } from "@/app/actions/contracts";
import { AiReviewProvenanceBadge } from "@/app/components/aidvisora/AiReviewProvenanceBadge";
import { contractSourceKindLabel, resolveAiProvenanceKind } from "@/lib/portal/ai-review-provenance";
import { ContractPendingFieldsGuard } from "@/app/dashboard/contacts/[id]/ContractPendingFieldsGuard";
import { MobileSection, MobileCard, EmptyState } from "@/app/shared/mobile-ui/primitives";
import { segmentLabel } from "@/app/lib/segment-labels";
import { resolveInstitutionLogo } from "@/lib/institutions/institution-logo";

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

function readAttrString(attrs: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const raw = attrs[key];
    if (raw == null) continue;
    const trimmed = String(raw).trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

type PaymentInfo = {
  account: string | null;
  variableSymbol: string | null;
  frequency: string | null;
  amount: string | null;
};

function formatPremium(amount: string | null, frequency: string | null): string | null {
  if (!amount) return null;
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) return null;
  const formatted = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(num);
  const unit = frequency ? ` Kč · ${frequency}` : " Kč";
  return `${formatted}${unit}`;
}

function extractPaymentInfo(contract: ContractRow): PaymentInfo {
  const attrs = contract.portfolioAttributes || {};
  return {
    account: readAttrString(attrs, "paymentAccountDisplay", "paymentAccount", "bankAccount"),
    variableSymbol: readAttrString(attrs, "paymentVariableSymbol", "variableSymbol", "vs"),
    frequency: readAttrString(attrs, "paymentFrequencyLabel", "paymentFrequency", "frequency"),
    amount: contract.premiumAmount,
  };
}

function hasAnyPayment(info: PaymentInfo): boolean {
  return Boolean(info.account || info.variableSymbol || info.frequency || formatPremium(info.amount, info.frequency));
}

/**
 * F8: Parita s desktop ContractsSection — zdroj smlouvy, pending confirm,
 * supporting-doc guard, institution logo + kompaktní platební instrukce.
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

  const renderedContracts = useMemo(() => contracts, [contracts]);

  if (loading) {
    return (
      <MobileSection title="Produkty / smlouvy">
        <div className="h-16 rounded-2xl bg-[color:var(--wp-surface-card-border)]/50 animate-pulse" />
      </MobileSection>
    );
  }

  if (renderedContracts.length === 0) {
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
    <MobileSection title={`Produkty / smlouvy (${renderedContracts.length})`}>
      <ul className="space-y-4">
        {renderedContracts.map((c) => {
          const aiKind = resolveAiProvenanceKind(c.sourceKind, c.advisorConfirmedAt);
          const prov = provenanceMap[c.id];
          const partnerName = c.partnerName || "";
          const title = c.productName || segmentLabel(c.segment);
          const subtitle = partnerName || segmentLabel(c.segment);
          const logo = resolveInstitutionLogo(partnerName);
          const payment = extractPaymentInfo(c);
          const premiumLabel = formatPremium(payment.amount, payment.frequency);
          const showPayment = hasAnyPayment(payment);
          return (
            <li key={c.id}>
              <MobileCard className="min-w-0 shadow-sm">
                <div className="flex min-w-0 items-start gap-3.5">
                  {logo ? (
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200 p-1">
                      <Image
                        src={logo.src}
                        alt={logo.alt}
                        width={40}
                        height={40}
                        className="h-full w-full object-contain"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div
                      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-black uppercase text-white shadow-sm ${partnerColor(partnerName)}`}
                      aria-hidden
                    >
                      {partnerMonogram(partnerName || title)}
                    </div>
                  )}
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

                {showPayment ? (
                  <div className="mt-3 rounded-xl bg-[color:var(--wp-main-scroll-bg)]/80 px-3 py-2.5 ring-1 ring-slate-100">
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)]">
                      Platební instrukce
                    </p>
                    <div className="flex flex-col gap-1.5 text-[11px] font-semibold text-[color:var(--wp-text)]">
                      {payment.account ? (
                        <div className="flex items-center gap-1.5">
                          <Banknote className="h-3.5 w-3.5 shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
                          <span className="font-mono">{payment.account}</span>
                        </div>
                      ) : null}
                      {payment.variableSymbol ? (
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3.5 w-3.5 shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
                          <span className="font-mono">VS {payment.variableSymbol}</span>
                        </div>
                      ) : null}
                      {premiumLabel ? (
                        <div className="flex items-center gap-1.5">
                          <Coins className="h-3.5 w-3.5 shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
                          <span>{premiumLabel}</span>
                        </div>
                      ) : payment.frequency ? (
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
                          <span>{payment.frequency}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 flex min-w-0 flex-col gap-1.5">
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
                    <span className="inline-flex items-start gap-1.5 text-[10px] leading-snug text-[color:var(--wp-text-secondary)]">
                      <FileCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
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
        className="mt-4 flex min-h-[44px] w-full items-center justify-center text-center text-xs font-bold text-indigo-700"
      >
        Celý přehled v portálu
      </Link>
    </MobileSection>
  );
}
