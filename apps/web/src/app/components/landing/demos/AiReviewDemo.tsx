"use client";

import React from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  User,
  Building2,
  CreditCard,
  Wallet,
} from "lucide-react";
import { DemoFrame, useInViewTrigger, prefersReducedMotion } from "./DemoFrame";

type Phase = "idle" | "scanning" | "result";

/**
 * AI Review demo — split view ve stylu skutečného `AIReviewExtractionShell`:
 * vlevo stylizovaný PDF náhled, vpravo extrahovaná pole.
 *
 * Flow: auto-start při scrollu do viewportu → 1.2 s loading → výsledek.
 * Respektuje prefers-reduced-motion (rovnou zobrazí výsledek).
 */
export function AiReviewDemo() {
  const { ref, inView } = useInViewTrigger<HTMLDivElement>();
  const [phase, setPhase] = React.useState<Phase>("idle");

  React.useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) {
      setPhase("result");
      return;
    }
    const t1 = window.setTimeout(() => setPhase("scanning"), 450);
    const t2 = window.setTimeout(() => setPhase("result"), 2100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [inView]);

  const reset = () => {
    setPhase("idle");
    window.setTimeout(() => setPhase("scanning"), 200);
    window.setTimeout(() => setPhase("result"), 1700);
  };

  return (
    <div ref={ref}>
      <DemoFrame
        label="AI review · Smlouva_o_ZP_2026.pdf"
        status={phase === "result" ? "extracted" : phase === "scanning" ? "běží" : "připraveno"}
        statusTone={phase === "result" ? "emerald" : phase === "scanning" ? "amber" : "slate"}
      >
        <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] min-h-[480px]">
          {/* PDF preview */}
          <div className="relative border-b md:border-b-0 md:border-r border-white/10 bg-[#0a0f29]/60 p-5 md:p-6 overflow-hidden">
            <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none" aria-hidden />
            <div className="relative mx-auto max-w-[320px] aspect-[3/4] rounded-2xl bg-[#f8fafc] text-slate-900 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)] p-5 overflow-hidden">
              <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-4">
                <span>Smlouva č. ZP-2026-004821</span>
                <FileText size={12} />
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 mb-1">Pojistník</div>
                  <div className="text-[11px] font-bold text-slate-800">Jana Nováková</div>
                  <div className="text-[9px] text-slate-500">Praha · r. č. ***</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 mb-1">Produkt</div>
                  <div className="text-[11px] text-slate-800">Rezervotvorné životní pojištění</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] uppercase font-bold text-slate-400 mb-1">Pojistné</div>
                    <div className="text-[11px] font-bold text-slate-800">1 850 Kč / měs.</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-bold text-slate-400 mb-1">Počátek</div>
                    <div className="text-[11px] text-slate-800">01. 03. 2026</div>
                  </div>
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="h-1.5 w-full rounded bg-slate-200" />
                  <div className="h-1.5 w-[92%] rounded bg-slate-200" />
                  <div className="h-1.5 w-[78%] rounded bg-slate-200" />
                  <div className="h-1.5 w-[85%] rounded bg-slate-200" />
                </div>
                <div className="pt-1">
                  <div className="text-[9px] uppercase font-bold text-slate-400 mb-1">Platební údaje</div>
                  <div className="text-[10px] text-slate-700">Účet: 2400123456 / 2010</div>
                  <div className="text-[10px] text-slate-700">VS: 4821004821</div>
                </div>
              </div>

              {phase === "scanning" && !prefersReducedMotion() ? (
                <div
                  className="absolute left-0 right-0 h-20 bg-gradient-to-b from-transparent via-indigo-400/30 to-transparent pointer-events-none"
                  style={{ animation: "aidv-scan 1.4s ease-in-out infinite", top: 0 }}
                  aria-hidden
                />
              ) : null}

              {phase === "result" ? (
                <div className="absolute inset-0 bg-emerald-500/5 ring-2 ring-emerald-400/40 rounded-2xl pointer-events-none" aria-hidden />
              ) : null}
            </div>

            <style>{`
              @keyframes aidv-scan {
                0% { transform: translateY(0); opacity: 0.2; }
                50% { opacity: 0.9; }
                100% { transform: translateY(440px); opacity: 0.2; }
              }
              @media (prefers-reduced-motion: reduce) {
                [style*="aidv-scan"] { animation: none !important; }
              }
            `}</style>
          </div>

          {/* Extraction panel */}
          <div className="p-5 md:p-6 flex flex-col min-h-[480px]">
            {phase !== "result" ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                  {phase === "scanning" ? (
                    <Loader2 size={22} className="text-indigo-300 animate-spin" />
                  ) : (
                    <Sparkles size={22} className="text-slate-400" />
                  )}
                </div>
                <p className="text-sm font-semibold text-white mb-1">
                  {phase === "scanning" ? "Čtu dokument a vytahuji pole…" : "AI review připravená"}
                </p>
                <p className="text-xs text-slate-400 max-w-[240px] leading-relaxed">
                  {phase === "scanning"
                    ? "Rozpoznávám klienta, produkt, částky a platební údaje."
                    : "Demo se spustí automaticky, jakmile se sekce objeví v zobrazení."}
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-3 animate-in fade-in duration-300">
                <FieldRow icon={User} label="Klient" value="Jana Nováková" />
                <FieldRow icon={FileText} label="Typ produktu" value="Životní pojištění (IŽP)" />
                <FieldRow icon={Wallet} label="Pojistné" value="1 850 Kč měsíčně" />
                <FieldRow icon={Building2} label="Instituce" value="Pojišťovna A (ukázka)" />
                <FieldRow icon={CreditCard} label="Platební údaje" value="2400123456 / 2010 · VS 4821004821" />

                <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-300 mb-1.5">
                    <Sparkles size={12} /> Návrh akcí
                  </div>
                  <ul className="space-y-1 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      Založit klienta · přiřadit ke kontaktu
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      Propsat smlouvu do karty klienta
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                      Vytvořit úkol: ověřit krytí invalidity
                    </li>
                  </ul>
                </div>

                <div className="mt-auto pt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={reset}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Spustit znovu
                  </button>
                  <button
                    type="button"
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-[11px] font-bold hover:bg-emerald-500/25 transition-colors"
                  >
                    <CheckCircle2 size={14} /> Schválit a propsat
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DemoFrame>
    </div>
  );
}

function FieldRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
        <Icon size={14} className="text-slate-300" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-0.5">{label}</div>
        <div className="text-sm text-white font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

export default AiReviewDemo;
