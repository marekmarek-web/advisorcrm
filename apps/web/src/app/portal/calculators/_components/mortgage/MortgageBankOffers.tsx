"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { formatCurrency, formatRate } from "@/lib/calculators/mortgage/formatters";
import type { BankOffer } from "@/lib/calculators/mortgage/mortgage.types";

export interface MortgageBankOffersProps {
  offers: BankOffer[];
  fetchedAt?: string;
  source?: string;
  sourceUrl?: string;
  /** Optional: when provided, "Chci nabídku" button is shown (web/lead mode). */
  onRequestOffer?: (bankName: string) => void;
}

function getInitials(name: string): string {
  const first = name.split(/\s+/)[0] ?? "";
  if (first.length <= 3) return first;
  return first.slice(0, 2).toUpperCase();
}

const FALLBACK_BRAND_STYLES: Record<string, string> = {
  rb: "bg-[#fff8d6] text-[#111827]",
  ucb: "bg-[#ffe7ee] text-[#9f1239]",
  csob: "bg-[#e8f0ff] text-[#1e3a8a]",
  cs: "bg-[#e6f4ff] text-[#0c4a6e]",
  mbank: "bg-[#eef2ff] text-[#1e3a8a]",
  kb: "bg-[#e7ecff] text-[#1e40af]",
  rsts: "bg-[#fff8d6] text-[#111827]",
  mpyr: "bg-[#e0f2fe] text-[#0369a1]",
};

export function MortgageBankOffers({
  offers,
  fetchedAt,
  source,
  sourceUrl,
  onRequestOffer,
}: MortgageBankOffersProps) {
  const sortedByMonthly = [...offers].sort(
    (a, b) => a.monthlyPayment - b.monthlyPayment
  );
  const lowestMonthlyId = sortedByMonthly[0]?.bank.id;
  const lowestRateId = [...offers].sort((a, b) => a.rate - b.rate)[0]?.bank.id;
  const updatedAt = fetchedAt ? new Date(fetchedAt) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          Srovnání nabídek trhu
        </h3>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg w-fit">
          Seřazeno od nejnižšího úroku
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {offers.map((offer, index) => (
          <BankOfferCard
            key={offer.bank.id}
            offer={offer}
            index={index}
            isLowestRate={offer.bank.id === lowestRateId}
            isLowestMonthly={offer.bank.id === lowestMonthlyId}
            onRequestOffer={onRequestOffer}
          />
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 text-xs text-slate-600 leading-relaxed">
        {updatedAt ? (
          <p className="text-slate-500">
            Aktualizováno: {updatedAt.toLocaleDateString("cs-CZ")}{" "}
            {updatedAt.toLocaleTimeString("cs-CZ", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {source ? ` · Zdroj: ${source}` : ""}
            {sourceUrl ? ` · ${sourceUrl}` : ""}
          </p>
        ) : (
          <p className="text-slate-500">Zdroj sazeb se aktualizuje průběžně.</p>
        )}
      </div>
    </div>
  );
}

function BankOfferCard({
  offer,
  index,
  isLowestRate,
  isLowestMonthly,
  onRequestOffer,
}: {
  offer: BankOffer;
  index: number;
  isLowestRate: boolean;
  isLowestMonthly: boolean;
  onRequestOffer?: (bankName: string) => void;
}) {
  const [logoError, setLogoError] = useState(false);
  const showLogo = offer.bank.logoUrl && !logoError;
  const initials = getInitials(offer.bank.name);

  return (
    <div
      className="animate-fade-in bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col min-h-0"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 min-h-[22px]">
        {isLowestRate && (
          <span className="inline-flex items-center rounded-full bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1">
            Nejnižší sazba
          </span>
        )}
        {isLowestMonthly && (
          <span className="inline-flex items-center rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1">
            Nejnižší splátka
          </span>
        )}
        {index === 0 && (
          <span className="inline-flex items-center rounded-full bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 gap-1">
            <CheckCircle2 size={10} /> Top volba
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shadow-sm shrink-0 overflow-hidden border border-slate-200 ${
            FALLBACK_BRAND_STYLES[offer.bank.id] ?? "bg-slate-100 text-slate-700"
          }`}
        >
          {showLogo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={offer.bank.logoUrl}
              alt={offer.bank.name}
              className="w-full h-full object-contain p-1"
              onError={() => setLogoError(true)}
            />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0">
          <h4 className="font-black text-slate-900 text-sm leading-tight truncate">
            {offer.bank.name}
          </h4>
          <span className="text-xs font-bold text-indigo-600">
            {formatRate(offer.rate)} p.a.
          </span>
          {offer.apr != null ? (
            <div className="text-[11px] text-slate-400 mt-0.5">RPSN {formatRate(offer.apr)}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-slate-100 flex items-end justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
            Splátka
          </span>
          <span className="font-black text-xl text-slate-900 break-all leading-none">
            {formatCurrency(offer.monthlyPayment)} Kč
          </span>
        </div>
        {onRequestOffer != null ? (
          <button
            type="button"
            onClick={() => onRequestOffer(offer.bank.name)}
            className="min-h-[44px] min-w-[44px] shrink-0 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all text-sm touch-manipulation"
          >
            Chci nabídku
          </button>
        ) : (
          <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 shrink-0 flex-shrink-0" aria-hidden>
            <ChevronRight size={14} />
          </div>
        )}
      </div>
    </div>
  );
}
