"use client";

import React from "react";
import {
  LayoutDashboard,
  PieChart,
  CreditCard,
  FileQuestion,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  Copy,
  TrendingUp,
  Shield,
  PiggyBank,
} from "lucide-react";
import { DemoFrame } from "./DemoFrame";
import { DEMO_PORTAL_NAV, DEMO_PAYMENTS, DEMO_CLIENT, type DemoPortalNav } from "./demo-data";

const NAV_ICON: Record<DemoPortalNav["id"], React.ComponentType<{ size?: number; className?: string }>> = {
  prehled: LayoutDashboard,
  portfolio: PieChart,
  platby: CreditCard,
  pozadavky: FileQuestion,
  zpravy: MessageSquare,
};

/**
 * Klientský portál — nejvýraznější demo modul: vlastní sidebar, přepínání
 * sekcí (Můj přehled / Portfolio / Platby / Požadavky / Zprávy), realistická
 * demo data. Ukazuje, že Aidvisora není jen CRM, ale i portál pro klienta.
 */
export function ClientPortalDemo() {
  const [active, setActive] = React.useState<DemoPortalNav["id"]>("prehled");

  return (
    <DemoFrame label={`Klientský portál · ${DEMO_CLIENT.name}`} status="klientský pohled" statusTone="emerald">
      <div className="grid grid-cols-[104px_1fr] sm:grid-cols-[140px_1fr] md:grid-cols-[180px_1fr] min-h-[520px] bg-[#0a0f29]/40">
        {/* Sidebar */}
        <aside className="border-r border-white/10 bg-[#060918]/60 p-3 md:p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2 py-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-black shrink-0">
              A
            </div>
            <span className="text-xs font-bold text-white font-jakarta tracking-wide truncate">Můj portál</span>
          </div>
          {DEMO_PORTAL_NAV.map((n) => {
            const Icon = NAV_ICON[n.id];
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setActive(n.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-semibold transition-colors text-left ${
                  isActive
                    ? "bg-indigo-500/15 text-white border border-indigo-500/30"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                <span className="truncate">{n.label}</span>
              </button>
            );
          })}

          <div className="mt-auto pt-3 border-t border-white/10">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <ShieldCheck size={12} className="text-emerald-300 shrink-0" />
              <span className="text-[10px] font-bold text-emerald-300 leading-tight">Šifrovaný přenos</span>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="p-4 md:p-5 overflow-hidden">
          {active === "prehled" ? <OverviewPane /> : null}
          {active === "portfolio" ? <PortfolioPane /> : null}
          {active === "platby" ? <PaymentsPane /> : null}
          {active === "pozadavky" ? <RequestsPane /> : null}
          {active === "zpravy" ? <MessagesPane /> : null}
        </div>
      </div>
    </DemoFrame>
  );
}

function OverviewPane() {
  return (
    <div className="animate-in fade-in duration-200">
      <h3 className="font-jakarta text-lg font-bold text-white mb-1">Dobré ráno, Jano</h3>
      <p className="text-xs text-slate-400 mb-4">Přehled vaší finanční situace napříč produkty.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Objem měsíčně" value="31 950 Kč" tone="indigo" icon={CreditCard} />
        <StatCard label="Aktivních smluv" value="5" tone="emerald" icon={Shield} />
        <StatCard label="Nadcházející platba" value="15. 11." tone="amber" icon={PiggyBank} />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-white">Vývoj investičního portfolia</span>
          <span className="text-[10px] text-emerald-300 font-bold">+4,8 % YTD</span>
        </div>
        <div className="h-20 flex items-end gap-1">
          {[30, 42, 38, 48, 44, 52, 58, 56, 62, 68, 72, 78].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-emerald-500/20 to-emerald-400/70"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
          Ilustrativní graf — v produktu se propojuje s reálnými daty vašich investic.
        </p>
      </div>
    </div>
  );
}

function PortfolioPane() {
  return (
    <div className="animate-in fade-in duration-200">
      <h3 className="font-jakarta text-lg font-bold text-white mb-1">Moje portfolio</h3>
      <p className="text-xs text-slate-400 mb-4">Všechny vaše produkty pod jednou střechou.</p>

      <div className="space-y-2">
        {DEMO_CLIENT.products.slice(0, 4).map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-300">
              {p.institutionInitials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{p.kindLabel}</div>
              <div className="text-sm font-bold text-white truncate">{p.institution}</div>
              <div className="text-[11px] text-slate-400">č. {p.contractNumber}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-black text-white tabular-nums">{p.amountLabel}</div>
              <div className="text-[10px] text-slate-500">{p.frequencyLabel}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentsPane() {
  return (
    <div className="animate-in fade-in duration-200">
      <h3 className="font-jakarta text-lg font-bold text-white mb-1">Platby a příkazy</h3>
      <p className="text-xs text-slate-400 mb-4">Bankovní údaje a QR kódy pro jednorázové i trvalé platby.</p>

      <div className="space-y-2">
        {DEMO_PAYMENTS.map((p) => (
          <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-start gap-3">
              <div className="w-16 h-16 rounded-lg bg-white grid grid-cols-5 grid-rows-5 gap-px p-1 shrink-0" aria-label="QR kód (ukázka)">
                {Array.from({ length: 25 }).map((_, i) => (
                  <div key={i} className={`${(i * 7 + 3) % 3 === 0 ? "bg-slate-900" : "bg-white"} rounded-[1px]`} />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{p.productLabel}</div>
                    <div className="text-sm font-bold text-white truncate">{p.institution}</div>
                  </div>
                  <div className="text-sm font-black text-white tabular-nums shrink-0">{p.amountLabel}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-slate-500">Účet</span>
                    <span className="text-slate-200 font-mono truncate">{p.accountNumber}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-slate-500">VS</span>
                    <span className="text-slate-200 font-mono">{p.variableSymbol}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-slate-500">Splatnost</span>
                    <span className="text-slate-300">{p.dueLabel}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 shrink-0"
                aria-label="Zkopírovat platební údaje"
              >
                <Copy size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestsPane() {
  return (
    <div className="animate-in fade-in duration-200">
      <h3 className="font-jakarta text-lg font-bold text-white mb-1">Moje požadavky</h3>
      <p className="text-xs text-slate-400 mb-4">Pošlete poradci podklady nebo nový dotaz s pár kliky.</p>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Nový požadavek</div>
        <select className="w-full text-sm text-white bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 mb-2 appearance-none">
          <option>Nová hypotéka</option>
          <option>Úprava životního pojištění</option>
          <option>Investiční dotaz</option>
        </select>
        <textarea
          rows={2}
          placeholder="Krátký popis…"
          className="w-full text-xs text-slate-200 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:border-indigo-400/60 resize-none"
        />
        <button className="w-full inline-flex items-center justify-center gap-1.5 min-h-[36px] rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500">
          Odeslat poradci <ArrowRight size={13} />
        </button>
      </div>

      <div className="space-y-2">
        <RequestRow title="Revize portfolia" status="Řeší poradce" tone="amber" />
        <RequestRow title="Potvrzení o pojištění" status="Připraveno" tone="emerald" />
      </div>
    </div>
  );
}

function MessagesPane() {
  return (
    <div className="animate-in fade-in duration-200 flex flex-col h-full">
      <h3 className="font-jakarta text-lg font-bold text-white mb-1">Zprávy poradci</h3>
      <p className="text-xs text-slate-400 mb-4">Rychlá komunikace místo rozházených e-mailů.</p>

      <div className="space-y-2 flex-1">
        <Bubble from="poradce" text="Dobrý den, Jano. Posílám návrh na navýšení investice k odsouhlasení." time="9:12" />
        <Bubble from="ja" text="Ahoj, díky. Podívám se večer a dám vědět." time="9:14" />
        <Bubble from="poradce" text="Super, přikládám PDF s rozdíly." time="9:15" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          placeholder="Napište zprávu…"
          className="flex-1 text-sm text-white bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400/60"
        />
        <button className="inline-flex items-center justify-center min-h-[36px] px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500">
          Odeslat
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "indigo" | "emerald" | "amber";
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const toneMap = {
    indigo: "bg-indigo-500/10 border-indigo-500/25 text-indigo-300",
    emerald: "bg-emerald-500/10 border-emerald-500/25 text-emerald-300",
    amber: "bg-amber-500/10 border-amber-500/25 text-amber-300",
  } as const;

  return (
    <div className={`rounded-xl border p-3 ${toneMap[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-xl font-black text-white tabular-nums">{value}</div>
    </div>
  );
}

function RequestRow({ title, status, tone }: { title: string; status: string; tone: "amber" | "emerald" }) {
  const toneMap = {
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  } as const;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="min-w-0">
        <div className="text-sm font-bold text-white truncate">{title}</div>
        <div className="text-[10px] text-slate-500">Založeno dnes</div>
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${toneMap[tone]}`}>
        {status}
      </span>
    </div>
  );
}

function Bubble({ from, text, time }: { from: "ja" | "poradce"; text: string; time: string }) {
  const mine = from === "ja";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
          mine
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-white/[0.06] text-slate-200 border border-white/10 rounded-bl-sm"
        }`}
      >
        {text}
        <div className={`text-[10px] mt-1 ${mine ? "text-indigo-100/80" : "text-slate-500"}`}>{time}</div>
      </div>
    </div>
  );
}

export default ClientPortalDemo;
