"use client";

import { useMemo, useState } from "react";
import { CreditCard, Home, PiggyBank, QrCode, Shield, TrendingUp, Car } from "lucide-react";
import type { PaymentInstruction } from "@/app/actions/payment-pdf";
import { segmentLabel } from "@/app/lib/segment-labels";
import {
  PAYMENT_CATEGORY_LABELS,
  paymentDedupKey,
  paymentSegmentCategory,
  type PaymentSegmentCategory,
} from "@/lib/products/canonical-payment-read";
import { formatPaymentFrequencyCs } from "@/lib/client-portal/payment-display-cs";
import { QrPaymentModal } from "../QrPaymentModal";

type ClientPaymentsViewProps = {
  paymentInstructions: PaymentInstruction[];
  /** True when server action selhal — prázdný stav nesmí vypadat jako „žádné platby v evidenci“. */
  paymentsLoadFailed?: boolean;
  /** Skryje titulek/úvod (mobilní shell už má vlastní hlavičku). */
  embeddedInMobileShell?: boolean;
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

function formatPaymentAmountLine(instruction: PaymentInstruction): string {
  const amount = Number(instruction.amount ?? "");
  const freq = formatPaymentFrequencyCs(instruction.frequency);
  const freqSuffix = freq ? ` · ${freq}` : instruction.frequency?.trim() ? ` · ${instruction.frequency.trim()}` : "";

  if (Number.isFinite(amount) && amount > 0) {
    const cur = instruction.currency?.trim();
    const suffix = cur && cur.toUpperCase() !== "CZK" ? ` ${cur}` : " Kč";
    return `${amount.toLocaleString("cs-CZ")}${suffix}${freqSuffix}`;
  }
  if (instruction.note?.trim()) return instruction.note;
  return "Dle smlouvy";
}

function CopyMiniButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* ignore */
        }
      }}
      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
    >
      {done ? "Hotovo" : label}
    </button>
  );
}

function paymentContractStatusBadgeClasses(linkedStatus: string | null | undefined): string {
  if (linkedStatus === "ended") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-emerald-50 text-emerald-800 border-emerald-100";
}

function paymentContractStatusBadgeLabel(linkedStatus: string | null | undefined): string {
  if (linkedStatus === "ended") return "Ukončená smlouva";
  return "Aktivní smlouva";
}

export function ClientPaymentsView({
  paymentInstructions,
  paymentsLoadFailed = false,
  embeddedInMobileShell = false,
}: ClientPaymentsViewProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const selectedPayment = useMemo(() => {
    if (selectedIndex == null) return null;
    const payment = paymentInstructions[selectedIndex];
    if (!payment) return null;

    return {
      partnerName: payment.partnerName,
      productName: payment.productName,
      accountNumber: payment.accountNumber,
      amountLabel: formatPaymentAmountLine(payment),
      variableSymbol: payment.variableSymbol || payment.contractNumber || null,
      specificSymbol: payment.specificSymbol,
      constantSymbol: payment.constantSymbol,
      note: payment.note || null,
    };
  }, [selectedIndex, paymentInstructions]);

  return (
    <div className="space-y-6 sm:space-y-8 client-fade-in">
      {!embeddedInMobileShell ? (
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight">Platby a příkazy</h2>
          <p className="text-sm font-medium text-slate-500 mt-2 max-w-2xl">
            Přehled platebních údajů napojených na smlouvy, které máte v portálu zveřejněné od poradce.
          </p>
        </div>
      ) : null}

      {paymentsLoadFailed ? (
        <div className="bg-white rounded-[24px] border border-rose-100 shadow-sm p-8 sm:p-10 text-center space-y-3">
          <p className="text-slate-800 font-semibold">Platební údaje se nepodařilo načíst</p>
          <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
            Zkuste stránku načíst znovu. Pokud problém přetrvává, napište svému poradci — údaje v evidenci se tím
            nemění.
          </p>
        </div>
      ) : paymentInstructions.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-8 sm:p-10 text-center space-y-3">
          <p className="text-slate-600 font-semibold">Žádné platební údaje nejsou v portálu k dispozici</p>
          <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
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
              const vs = instruction.variableSymbol || instruction.contractNumber || "—";

              return (
                <article
                  key={rowKey}
                  className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md hover:border-indigo-200 transition-all"
                >
                  <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <CatIcon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-indigo-700">
                          {PAYMENT_CATEGORY_LABELS[cat]}
                        </p>
                        <h3 className="font-bold text-slate-900 text-sm leading-snug mt-1 line-clamp-2">
                          {instruction.productName || segmentLabel(instruction.segment)}
                        </h3>
                        <p className="text-xs font-medium text-slate-500 truncate mt-0.5">{instruction.partnerName}</p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${paymentContractStatusBadgeClasses(instruction.linkedContractPortfolioStatus)}`}
                    >
                      {paymentContractStatusBadgeLabel(instruction.linkedContractPortfolioStatus)}
                    </span>
                  </div>

                  <div className="p-5 flex-1 flex flex-col gap-4 text-sm">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Částka</p>
                      <p className="text-lg font-black text-slate-900">{formatPaymentAmountLine(instruction)}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                            Účet
                          </p>
                          <p className="font-mono text-slate-800 font-bold text-xs break-all">{instruction.accountNumber}</p>
                        </div>
                        <CopyMiniButton text={instruction.accountNumber.replace(/\s+/g, "")} label="Kopírovat" />
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                            Variabilní symbol
                          </p>
                          <p className="font-bold text-slate-800 text-sm">{vs}</p>
                        </div>
                        {vs !== "—" ? <CopyMiniButton text={vs} label="Kopírovat" /> : null}
                      </div>
                      {instruction.specificSymbol ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                              Specifický symbol
                            </p>
                            <p className="font-bold text-slate-800 text-sm">{instruction.specificSymbol}</p>
                          </div>
                          <CopyMiniButton text={instruction.specificSymbol} label="Kopírovat" />
                        </div>
                      ) : null}
                      {instruction.constantSymbol ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                              Konstantní symbol
                            </p>
                            <p className="font-bold text-slate-800 text-sm">{instruction.constantSymbol}</p>
                          </div>
                          <CopyMiniButton text={instruction.constantSymbol} label="Kopírovat" />
                        </div>
                      ) : null}
                    </div>

                    {instruction.note ? (
                      <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">{instruction.note}</p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      className="mt-auto w-full min-h-[48px] rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 text-xs font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <QrCode size={18} />
                      QR platba
                    </button>
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
