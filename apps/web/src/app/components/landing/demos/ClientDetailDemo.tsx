"use client";

import React from "react";
import {
  Shield,
  TrendingUp,
  PiggyBank,
  Home,
  Car,
  MapPin,
  Mail,
  Phone,
} from "lucide-react";
import { DemoFrame } from "./DemoFrame";
import { DEMO_CLIENT, type DemoProduct } from "./demo-data";

const KIND_ICON: Record<DemoProduct["kind"], React.ComponentType<{ size?: number; className?: string }>> = {
  zp: Shield,
  investice: TrendingUp,
  penzijni: PiggyBank,
  hypoteka: Home,
  leasing: Car,
};

const ACCENT: Record<string, { ring: string; text: string; bg: string }> = {
  rose: { ring: "ring-rose-500/25", text: "text-rose-300", bg: "bg-rose-500/10" },
  emerald: { ring: "ring-emerald-500/25", text: "text-emerald-300", bg: "bg-emerald-500/10" },
  indigo: { ring: "ring-indigo-500/25", text: "text-indigo-300", bg: "bg-indigo-500/10" },
  blue: { ring: "ring-blue-500/25", text: "text-blue-300", bg: "bg-blue-500/10" },
  amber: { ring: "ring-amber-500/25", text: "text-amber-300", bg: "bg-amber-500/10" },
};

/**
 * Detail klienta jako v Aidvisoře — cockpit poradce s hlavičkou klienta
 * a přehledem produktů napříč oblastmi. Monogramy institucí (ne reálná loga),
 * fiktivní čísla, přehledné karty.
 */
export function ClientDetailDemo() {
  const totalMonthly = "31 950 Kč";
  const activeCount = DEMO_CLIENT.products.length;

  return (
    <DemoFrame label="Detail klienta · Cockpit poradce" status={`${activeCount} aktivních smluv`} statusTone="indigo">
      <div className="p-4 md:p-5 bg-[#0a0f29]/40">
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/40 to-purple-500/40 flex items-center justify-center text-white font-black text-lg shrink-0 border border-white/10">
            {DEMO_CLIENT.initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-jakarta text-xl font-bold text-white leading-tight">{DEMO_CLIENT.name}</h3>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1"><MapPin size={11} /> {DEMO_CLIENT.city}</span>
              <span className="inline-flex items-center gap-1"><Mail size={11} /> {DEMO_CLIENT.email}</span>
              <span className="inline-flex items-center gap-1"><Phone size={11} /> {DEMO_CLIENT.phone}</span>
            </div>
          </div>
          <div className="hidden sm:block text-right shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Objem měsíčně</div>
            <div className="text-lg font-black text-white tabular-nums">{totalMonthly}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto scrollbar-none pb-1">
          {["Přehled", "Portfolio", "Dokumenty", "Zápisky", "Timeline"].map((t, i) => (
            <span
              key={t}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-full border whitespace-nowrap ${
                i === 1
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-transparent text-slate-400 border-white/10"
              }`}
            >
              {t}
            </span>
          ))}
        </div>

        {/* Product cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEMO_CLIENT.products.map((p) => {
            const Icon = KIND_ICON[p.kind];
            const accent = ACCENT[p.accent] ?? ACCENT.indigo;
            return (
              <div
                key={p.id}
                className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06] transition-colors ring-1 ring-inset ${accent.ring}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${accent.bg} border border-white/10 flex items-center justify-center shrink-0`}>
                    <Icon size={18} className={accent.text} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${accent.text}`}>
                        {p.kindLabel}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white leading-tight truncate">{p.institution}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">č. {p.contractNumber}</div>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-300 shrink-0">
                    {p.institutionInitials}
                  </div>
                </div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-lg font-black text-white tabular-nums">{p.amountLabel}</span>
                  <span className="text-[11px] text-slate-400">{p.frequencyLabel}</span>
                </div>
                {p.note ? (
                  <p className="text-[11px] text-slate-400 leading-relaxed border-t border-white/10 pt-2 mt-2">
                    {p.note}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
          Názvy institucí a čísla smluv v této ukázce jsou fiktivní. V produkci se automaticky propisují z AI review
          nebo je zadáte ručně.
        </p>
      </div>
    </DemoFrame>
  );
}

export default ClientDetailDemo;
