"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { CreditCard, Home, PiggyBank, QrCode, Shield, TrendingUp, Car } from "lucide-react";
import type { PaymentInstruction } from "@/app/actions/payment-pdf";
import { segmentLabel } from "@/app/lib/segment-labels";
import {
  PAYMENT_CATEGORY_LABELS,
  paymentDedupKey,
  paymentSegmentCategory,
  type PaymentSegmentCategory,
} from "@/lib/products/canonical-payment-read";
import {
  accountFieldLabel,
  firstPaymentPillLabel,
  formatPortalPrimaryAmountLine,
  institutionDisplayName,
  isPortalPaymentQrActionEligible,
  portalFrequencyLabel,
  portalPaymentsViewKind,
  variableSymbolDisplay,
} from "@/lib/client-portal/portal-payments-read-model";
import { resolveInstitutionLogo } from "@/lib/institutions/institution-logo";
import { Badge, StatusPill } from "@/app/components/ui/primitives";
import { QrPaymentModal } from "../QrPaymentModal";

type ClientPaymentsViewProps = {
  paymentInstructions: PaymentInstruction[];
  /** True when server action selhal — prázdný stav nesmí vypadat jako „žádné platby v evidenci“. */
  paymentsLoadFailed?: boolean;
  /** Skryje titulek/úvod (mobilní shell už má vlastní hlavičku). */
  embeddedInMobileShell?: boolean;
  /** Mobilní shell potřebuje při QR sheetu schovat bottom nav. */
  onModalOpenChange?: (open: boolean) => void;
};

function categoryIcon(cat: PaymentSegmentCategory) {
  switch (cat) {
    case "bydleni":
      return Home;
    case "uvery":
      return CreditCard;
    case "pojisteni_osob":
      return Shield;
    case "penze":
      return PiggyBank;
    case "investice":
      return TrendingUp;
    case "pojisteni_majetku":
      return Home;
    case "pojisteni_vozidel":
      return Car;
    default:
      return CreditCard;
  }
}

function categoryColors(cat: PaymentSegmentCategory): { icon: string; label: string } {
  switch (cat) {
    case "bydleni":
      return { icon: "bg-blue-50 text-blue-600", label: "text-blue-700" };
    case "uvery":
      return { icon: "bg-cyan-50 text-cyan-600", label: "text-cyan-700" };
    case "pojisteni_osob":
      return { icon: "bg-rose-50 text-rose-600", label: "text-rose-700" };
    case "penze":
      return { icon: "bg-emerald-50 text-emerald-600", label: "text-emerald-700" };
    case "investice":
      return { icon: "bg-purple-50 text-purple-600", label: "text-purple-700" };
    case "pojisteni_majetku":
      return { icon: "bg-orange-50 text-orange-500", label: "text-orange-600" };
    case "pojisteni_vozidel":
      return { icon: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]", label: "text-[color:var(--wp-text-secondary)]" };
    default:
      return { icon: "bg-indigo-50 text-indigo-600", label: "text-indigo-700" };
  }
}

function CopyMiniButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  // B2.6: clipboard může selhat na iOS Safari / private mode / bez gesture.
  // Fallback — vybere text v dočasném <textarea> + zkusí `execCommand('copy')`.
  // Když i to selže, zobrazíme „Nelze“ místo false success.
  async function writeClipboard(value: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // fall through to execCommand fallback
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await writeClipboard(text);
        setState(ok ? "done" : "error");
        setTimeout(() => setState("idle"), ok ? 1600 : 2400);
      }}
      className={`shrink-0 min-h-[44px] min-w-[64px] rounded-lg border px-2.5 text-xs font-black uppercase tracking-wider transition-colors touch-manipulation ${
        state === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-[color:var(--wp-surface-card-border)] bg-white text-[color:var(--wp-text-secondary)] hover:border-indigo-200 hover:text-indigo-700"
      }`}
      title={state === "error" ? "Prohlížeč nepovolil kopírování — označte hodnotu a zkopírujte ručně." : undefined}
    >
      {state === "done" ? "Hotovo" : state === "error" ? "Nelze" : label}
    </button>
  );
}

function paymentContractStatusTone(
  linkedStatus: string | null | undefined,
): "neutral" | "emerald" {
  return linkedStatus === "ended" ? "neutral" : "emerald";
}

function paymentContractStatusBadgeLabel(linkedStatus: string | null | undefined): string {
  if (linkedStatus === "ended") return "Ukončená smlouva";
  return "Aktivní smlouva";
}

export function ClientPaymentsView({
  paymentInstructions,
  paymentsLoadFailed = false,
  embeddedInMobileShell = false,
  onModalOpenChange,
}: ClientPaymentsViewProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const viewKind = portalPaymentsViewKind(paymentsLoadFailed, paymentInstructions.length);

  useEffect(() => {
    onModalOpenChange?.(selectedIndex != null);
  }, [onModalOpenChange, selectedIndex]);

  useEffect(() => {
    return () => onModalOpenChange?.(false);
  }, [onModalOpenChange]);

  const selectedPayment = useMemo(() => {
    if (selectedIndex == null) return null;
    const payment = paymentInstructions[selectedIndex];
    if (!payment) return null;

    return {
      partnerName: payment.partnerName,
      productName: payment.productName,
      accountNumber: payment.accountNumber,
      amountLabel: formatPortalPrimaryAmountLine(payment),
      variableSymbol: payment.variableSymbol || payment.contractNumber || null,
      specificSymbol: payment.specificSymbol,
      constantSymbol: payment.constantSymbol,
      note: payment.note || null,
      currency: payment.currency,
    };
  }, [selectedIndex, paymentInstructions]);

  return (
    <div className="space-y-6 sm:space-y-8 client-fade-in min-w-0 w-full">
      {!embeddedInMobileShell ? (
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight">Platby a příkazy</h2>
          <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mt-2 max-w-2xl">
            Přehled platebních údajů napojených na smlouvy, které máte v portálu zveřejněné od poradce.
          </p>
        </div>
      ) : null}

      {viewKind === "load_failed" ? (
        <div className="bg-white rounded-[24px] border border-rose-100 shadow-sm p-8 sm:p-10 text-center space-y-3">
          <p className="text-[color:var(--wp-text)] font-semibold">Platební údaje se nepodařilo načíst</p>
          <p className="text-[color:var(--wp-text-secondary)] text-sm max-w-md mx-auto leading-relaxed">
            Zkuste stránku načíst znovu. Pokud problém přetrvává, napište svému poradci — údaje v evidenci se tím
            nemění.
          </p>
        </div>
      ) : viewKind === "empty" ? (
        <div className="bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-8 sm:p-10 text-center space-y-3">
          <p className="text-[color:var(--wp-text-secondary)] font-semibold">Žádné platební údaje nejsou v portálu k dispozici</p>
          <p className="text-[color:var(--wp-text-secondary)] text-sm max-w-md mx-auto leading-relaxed">
            Jakmile poradce zveřejní platby u vašich smluv v klientské zóně, nebo doplní údaje z katalogu institucí,
            zobrazí se zde účet, částka, variabilní symbol a další pole podle toho, co je ve smlouvě k dispozici.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {paymentInstructions.map((instruction, index) => {
              const cat = paymentSegmentCategory(instruction.segment);
              const CatIcon = categoryIcon(cat);
              const dedup = paymentDedupKey({
                partnerName: instruction.partnerName,
                productName: instruction.productName,
                contractNumber: instruction.contractNumber,
                accountNumber: instruction.accountNumber,
                variableSymbol: instruction.variableSymbol,
              });
              const rowKey = instruction.paymentSetupId ?? instruction.contractId ?? `${dedup}-${index}`;
              const institution = institutionDisplayName(instruction.partnerName);
              const vs = variableSymbolDisplay(instruction);
              const freqRow = portalFrequencyLabel(instruction);
              const qrEligible = isPortalPaymentQrActionEligible(instruction);
              const acct = instruction.accountNumber?.trim() ?? "";
              const acctLabel = acct ? accountFieldLabel(acct) : "Účet";

              const colors = categoryColors(cat);
              const logoOrIcon = resolveInstitutionLogo(instruction.partnerName);
              const pill = firstPaymentPillLabel(instruction.firstPaymentDate);

              return (
                <article
                  key={rowKey}
                  className="bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all group"
                >
                  <div className="p-5 border-b border-[color:var(--wp-surface-card-border)] flex items-start gap-4">
                    {logoOrIcon ? (
                      <Image
                        src={logoOrIcon.src}
                        alt={logoOrIcon.alt}
                        width={96}
                        height={96}
                        className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain p-1.5 ring-1 ring-slate-100"
                        unoptimized
                      />
                    ) : (
                      <div className={`h-16 w-16 rounded-2xl flex items-center justify-center shrink-0 ${colors.icon}`}>
                        <CatIcon size={28} strokeWidth={2} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${colors.label}`}>
                          {PAYMENT_CATEGORY_LABELS[cat]}
                        </p>
                        <StatusPill
                          size="xs"
                          tone={paymentContractStatusTone(instruction.linkedContractPortfolioStatus)}
                          className="shrink-0"
                        >
                          {paymentContractStatusBadgeLabel(instruction.linkedContractPortfolioStatus)}
                        </StatusPill>
                      </div>
                      <h3 className="font-bold text-[color:var(--wp-text)] text-[15px] leading-snug mt-1 line-clamp-2">
                        {instruction.productName || segmentLabel(instruction.segment)}
                      </h3>
                      {institution ? (
                        <p className="text-xs font-medium text-[color:var(--wp-text-secondary)] truncate mt-0.5">{institution}</p>
                      ) : null}
                      {pill ? (
                        <Badge tone="amber" size="xs" variant="tag" className="mt-1.5">
                          {pill}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col gap-4 text-sm bg-[color:var(--wp-main-scroll-bg)]/30">
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <span className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">Částka k úhradě</span>
                        <span className="text-2xl font-black text-[color:var(--wp-text)]">{formatPortalPrimaryAmountLine(instruction)}</span>
                      </div>
                      {freqRow ? (
                        <Badge tone="neutral" size="xs" variant="count" className="shrink-0 bg-white">
                          {freqRow}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="space-y-2 mt-2">
                      {acct ? (
                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[color:var(--wp-surface-card-border)]">
                          <div className="min-w-0 flex-1">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
                              {acctLabel}
                            </span>
                            <span className="font-mono text-[color:var(--wp-text)] font-bold text-sm break-all">{acct}</span>
                          </div>
                          <CopyMiniButton text={acct.replace(/\s+/g, "")} label="Kopírovat" />
                        </div>
                      ) : null}
                      {vs ? (
                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[color:var(--wp-surface-card-border)]">
                          <div className="min-w-0 flex-1">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
                              Variabilní symbol
                            </span>
                            <span className="font-bold text-[color:var(--wp-text)] text-sm font-mono">{vs}</span>
                          </div>
                          <CopyMiniButton text={vs} label="Kopírovat" />
                        </div>
                      ) : null}
                      {instruction.specificSymbol ? (
                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[color:var(--wp-surface-card-border)]">
                          <div className="min-w-0 flex-1">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
                              Specifický symbol
                            </span>
                            <span className="font-bold text-[color:var(--wp-text)] text-sm font-mono">{instruction.specificSymbol}</span>
                          </div>
                          <CopyMiniButton text={instruction.specificSymbol} label="Kopírovat" />
                        </div>
                      ) : null}
                      {instruction.constantSymbol ? (
                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[color:var(--wp-surface-card-border)]">
                          <div className="min-w-0 flex-1">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
                              Konstantní symbol
                            </span>
                            <span className="font-bold text-[color:var(--wp-text)] text-sm font-mono">{instruction.constantSymbol}</span>
                          </div>
                          <CopyMiniButton text={instruction.constantSymbol} label="Kopírovat" />
                        </div>
                      ) : null}
                      {instruction.contractNumber ? (
                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[color:var(--wp-surface-card-border)]">
                          <div className="min-w-0 flex-1">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
                              Číslo smlouvy
                            </span>
                            <span className="font-bold text-[color:var(--wp-text)] text-sm font-mono break-all">{instruction.contractNumber}</span>
                          </div>
                          <CopyMiniButton text={instruction.contractNumber} label="Kopírovat" />
                        </div>
                      ) : null}
                      {instruction.bank ? (
                        <div className="p-3 bg-white rounded-xl border border-[color:var(--wp-surface-card-border)]">
                          <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
                            Banka
                          </span>
                          <span className="font-bold text-[color:var(--wp-text)] text-sm">{instruction.bank}</span>
                        </div>
                      ) : null}
                      {instruction.currency ? (
                        <div className="p-3 bg-white rounded-xl border border-[color:var(--wp-surface-card-border)]">
                          <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
                            Měna
                          </span>
                          <span className="font-bold text-[color:var(--wp-text)] text-sm">{instruction.currency}</span>
                        </div>
                      ) : null}
                    </div>

                    {instruction.note ? (
                      <p className="text-xs text-[color:var(--wp-text-secondary)] leading-relaxed border-t border-[color:var(--wp-surface-card-border)] pt-3">{instruction.note}</p>
                    ) : null}

                    {qrEligible ? (
                      <button
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        className="mt-auto w-full min-h-[48px] rounded-xl bg-[color:var(--wp-surface-muted)] hover:bg-indigo-50 text-[color:var(--wp-text)] hover:text-indigo-700 border border-[color:var(--wp-surface-card-border)] text-xs font-black uppercase tracking-widest transition-all inline-flex items-center justify-center gap-2 touch-manipulation active:scale-[0.98]"
                      >
                        <QrCode size={16} />
                        Zobrazit QR kód
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <QrPaymentModal
        open={selectedIndex != null}
        onClose={() => setSelectedIndex(null)}
        payment={selectedPayment}
      />
    </div>
  );
}
