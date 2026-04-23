"use client";

import React from "react";
import {
  Bell,
  FileText,
  Home,
  Paperclip,
  Phone,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { DemoFrame, useInViewTrigger, prefersReducedMotion } from "./DemoFrame";
import { DEMO_REQUEST } from "./demo-data";

/**
 * Mini nástěnka poradce s příchozím požadavkem z klientského portálu.
 * Toast se objeví po mountu (resp. když se sekce dostane do viewportu) a
 * přidá do inboxu nový požadavek. Flow bez backendu — ilustruje moment
 * „klient poslal podklady, poradce má akci".
 */
export function ClientRequestDemo() {
  const { ref, inView } = useInViewTrigger<HTMLDivElement>();
  const [toastOpen, setToastOpen] = React.useState(false);
  const [newInInbox, setNewInInbox] = React.useState(false);

  React.useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) {
      setNewInInbox(true);
      return;
    }
    const t1 = window.setTimeout(() => setToastOpen(true), 600);
    const t2 = window.setTimeout(() => setNewInInbox(true), 1400);
    const t3 = window.setTimeout(() => setToastOpen(false), 5200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [inView]);

  return (
    <div ref={ref}>
      <DemoFrame
        label="Klientské požadavky · nástěnka"
        status={newInInbox ? "1 nová" : "vše čisté"}
        statusTone={newInInbox ? "amber" : "emerald"}
      >
        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_1.2fr] min-h-[420px]">
          {/* Levá strana — inbox */}
          <div className="border-b md:border-b-0 md:border-r border-white/10 p-4 md:p-5 bg-[#0a0f29]/40">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Inbox</h4>
              <span className="text-[10px] text-slate-500">Dnes</span>
            </div>

            <div className="space-y-2">
              {newInInbox ? (
                <InboxItem
                  highlighted
                  caseLabel={DEMO_REQUEST.caseLabel}
                  clientName={DEMO_REQUEST.clientName}
                  title={DEMO_REQUEST.title}
                  time={DEMO_REQUEST.receivedLabel}
                />
              ) : null}
              <InboxItem caseLabel="Pojištění" clientName="Martina H." title="Dotaz k výpovědi ŽP" time="9:12" muted />
              <InboxItem caseLabel="Investice" clientName="Pavel K." title="Navýšení pravidelné investice" time="včera" muted />
              <InboxItem caseLabel="Pojištění" clientName="Rodina D." title="Nová smlouva — potvrzení" time="včera" muted />
            </div>

            <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
              Portál přijímá podklady, chat a nové požadavky. Na straně poradce se rovnou objeví karta s úkolem.
            </p>
          </div>

          {/* Pravá strana — detail */}
          <div className="p-4 md:p-5">
            {newInInbox ? (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <Home size={18} className="text-amber-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {DEMO_REQUEST.caseLabel}
                      </span>
                      <span className="text-[10px] text-slate-500">{DEMO_REQUEST.receivedLabel}</span>
                    </div>
                    <h3 className="text-base font-bold text-white leading-tight truncate">{DEMO_REQUEST.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Od klienta: {DEMO_REQUEST.clientName}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300 leading-relaxed mb-3">
                  {DEMO_REQUEST.preview}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-4">
                  <Paperclip size={12} />
                  <span>{DEMO_REQUEST.attachments} přílohy · výpisy, pracovní smlouvy</span>
                </div>

                <div className="mt-auto grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button className="inline-flex items-center justify-center gap-1.5 min-h-[38px] rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-200 hover:bg-white/10 transition-colors">
                    <FileText size={13} /> Poznámka
                  </button>
                  <button className="inline-flex items-center justify-center gap-1.5 min-h-[38px] rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-200 hover:bg-white/10 transition-colors">
                    <Phone size={13} /> Zavolat
                  </button>
                  <button className="inline-flex items-center justify-center gap-1.5 min-h-[38px] rounded-lg bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-500 transition-colors">
                    Zpracovat <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                  <CheckCircle2 size={20} className="text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-white mb-1">Žádný otevřený požadavek</p>
                <p className="text-xs text-slate-400 max-w-[240px] leading-relaxed">
                  Jakmile klient pošle podklady nebo zprávu z portálu, objeví se karta tady.
                </p>
              </div>
            )}
          </div>

          {/* Toast */}
          <div
            className={`pointer-events-none absolute top-3 right-3 max-w-[280px] transition-all duration-300 ${
              toastOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
            }`}
            aria-live="polite"
          >
            <div className="rounded-xl border border-amber-500/30 bg-[#0a0f29]/95 backdrop-blur-md shadow-[0_10px_30px_-10px_rgba(245,158,11,0.4)] p-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                <Bell size={14} className="text-amber-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-0.5">
                  Nový požadavek z portálu
                </p>
                <p className="text-xs text-white font-semibold truncate">
                  {DEMO_REQUEST.clientName} — {DEMO_REQUEST.caseLabel.toLowerCase()}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">Poslal {DEMO_REQUEST.attachments} přílohy</p>
              </div>
            </div>
          </div>
        </div>
      </DemoFrame>
    </div>
  );
}

function InboxItem({
  caseLabel,
  clientName,
  title,
  time,
  highlighted,
  muted,
}: {
  caseLabel: string;
  clientName: string;
  title: string;
  time: string;
  highlighted?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 transition-all ${
        highlighted
          ? "border-amber-500/40 bg-amber-500/[0.08] shadow-[0_10px_30px_-15px_rgba(245,158,11,0.5)] animate-in fade-in slide-in-from-left-2 duration-300"
          : muted
            ? "border-white/10 bg-white/[0.02] opacity-70"
            : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
            highlighted
              ? "bg-amber-500/20 text-amber-300"
              : "bg-white/5 text-slate-400"
          }`}
        >
          {caseLabel}
        </span>
        <span className="text-[10px] text-slate-500">{time}</span>
      </div>
      <div className="text-xs font-bold text-white truncate">{title}</div>
      <div className="text-[11px] text-slate-400 truncate">{clientName}</div>
    </div>
  );
}

export default ClientRequestDemo;
