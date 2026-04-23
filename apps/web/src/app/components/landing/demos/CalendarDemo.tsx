"use client";

import React from "react";
import { Phone, Coffee, CheckSquare, Mail, Users, X } from "lucide-react";
import { DemoFrame } from "./DemoFrame";
import {
  DEMO_ACTIVITY_TYPES,
  DEMO_CALENDAR_CLIENTS,
  DEMO_MEETINGS,
  type DemoActivityType,
  type DemoMeeting,
} from "./demo-data";

const TYPE_ICON: Record<DemoActivityType, React.ComponentType<{ size?: number; className?: string }>> = {
  schuzka: Users,
  telefonat: Phone,
  kafe: Coffee,
  ukol: CheckSquare,
  email: Mail,
};

const TYPE_COLOR: Record<DemoActivityType, { bg: string; text: string; border: string; dot: string }> = {
  schuzka: { bg: "bg-indigo-500/15", text: "text-indigo-200", border: "border-indigo-500/40", dot: "bg-indigo-400" },
  telefonat: { bg: "bg-emerald-500/15", text: "text-emerald-200", border: "border-emerald-500/40", dot: "bg-emerald-400" },
  kafe: { bg: "bg-amber-500/15", text: "text-amber-200", border: "border-amber-500/40", dot: "bg-amber-400" },
  ukol: { bg: "bg-purple-500/15", text: "text-purple-200", border: "border-purple-500/40", dot: "bg-purple-400" },
  email: { bg: "bg-rose-500/15", text: "text-rose-200", border: "border-rose-500/40", dot: "bg-rose-400" },
};

const DAYS = ["Po", "Út", "St", "Čt", "Pá"];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

/**
 * Mini týdenní kalendář s demo schůzkami. Kliknutí na event otevře modal
 * „Nová aktivita" inspirovaný skutečným `EventFormModal` v produktu —
 * typ aktivity jde přepnout, klient jde vybrat. Neposílá nic na backend.
 */
export function CalendarDemo() {
  const [modal, setModal] = React.useState<
    | { kind: "edit"; meeting: DemoMeeting }
    | { kind: "new"; day?: number; hour?: number }
    | null
  >(null);

  return (
    <DemoFrame label="Kalendář · Týdenní přehled" status="pracovní týden" statusTone="indigo">
      <div className="relative p-4 md:p-5 bg-[#0a0f29]/40">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-white font-jakarta">Tento týden</h4>
          <button
            type="button"
            onClick={() => setModal({ kind: "new" })}
            className="text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5"
          >
            + Nová aktivita
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#060918]/60 overflow-hidden">
          <div className="grid grid-cols-[48px_repeat(5,1fr)] border-b border-white/10 bg-white/[0.02]">
            <div />
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="relative grid grid-cols-[48px_repeat(5,1fr)]">
            {/* Hours column */}
            <div>
              {HOURS.map((h) => (
                <div key={h} className="h-10 text-[10px] text-slate-500 pr-1 text-right pt-0.5 border-b border-white/5">
                  {h}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {DAYS.map((_, dayIdx) => (
              <div
                key={dayIdx}
                className="relative border-l border-white/5"
                onClick={() => setModal({ kind: "new", day: dayIdx })}
              >
                {HOURS.map((h) => (
                  <div key={h} className="h-10 border-b border-white/5 hover:bg-white/[0.02] transition-colors" />
                ))}

                {DEMO_MEETINGS.filter((m) => m.day === dayIdx).map((m) => {
                  const top = (m.startHour - HOURS[0]) * 40;
                  const height = m.durationHours * 40 - 4;
                  const color = TYPE_COLOR[m.type];
                  const Icon = TYPE_ICON[m.type];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModal({ kind: "edit", meeting: m });
                      }}
                      className={`absolute left-1 right-1 rounded-lg border ${color.bg} ${color.border} ${color.text} text-left p-1.5 hover:brightness-125 transition-all`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <Icon size={10} />
                        <span className="text-[9px] font-bold uppercase tracking-wider truncate">
                          {m.startHour}:00
                        </span>
                      </div>
                      <div className="text-[10px] font-bold leading-tight line-clamp-2 text-white/95">{m.title}</div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {DEMO_ACTIVITY_TYPES.map((t) => {
            const color = TYPE_COLOR[t.id];
            const Icon = TYPE_ICON[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setModal({ kind: "new" })}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border px-2.5 py-1 ${color.bg} ${color.border} text-slate-200 hover:brightness-125 transition-all`}
              >
                <Icon size={12} /> {t.label}
              </button>
            );
          })}
        </div>

        {modal ? (
          <NewActivityModal
            initial={
              modal.kind === "edit"
                ? { type: modal.meeting.type, clientId: modal.meeting.clientId, title: modal.meeting.title }
                : undefined
            }
            onClose={() => setModal(null)}
          />
        ) : null}
      </div>
    </DemoFrame>
  );
}

function NewActivityModal({
  initial,
  onClose,
}: {
  initial?: { type: DemoActivityType; clientId: string; title: string };
  onClose: () => void;
}) {
  const [type, setType] = React.useState<DemoActivityType>(initial?.type ?? "schuzka");
  const [clientId, setClientId] = React.useState(initial?.clientId ?? DEMO_CALENDAR_CLIENTS[0].id);
  const [title, setTitle] = React.useState(initial?.title ?? "");

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a0f29] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-bold text-white font-jakarta">Nová aktivita v kalendáři</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Zavřít"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Typ</div>
            <div className="grid grid-cols-5 gap-1.5">
              {DEMO_ACTIVITY_TYPES.map((t) => {
                const Icon = TYPE_ICON[t.id];
                const color = TYPE_COLOR[t.id];
                const active = type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] font-semibold transition-all ${
                      active
                        ? `${color.bg} ${color.border} text-white`
                        : "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.06]"
                    }`}
                    title={t.hint}
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Klient</div>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_CALENDAR_CLIENTS.map((c) => {
                const active = c.id === clientId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setClientId(c.id)}
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-[11px] font-semibold transition-all ${
                      active
                        ? "bg-indigo-500/15 border-indigo-500/40 text-white"
                        : "bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white/10 text-[9px] font-bold flex items-center justify-center">
                      {c.initials}
                    </span>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Název</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Např. Revize portfolia"
              className="w-full text-sm text-white bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Datum</div>
              <div className="text-xs text-slate-300 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                Pá · 14:00–15:00
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Připomenutí</div>
              <div className="text-xs text-slate-300 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2">
                30 min předem
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-semibold text-slate-400 hover:text-white px-3 py-1.5"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5"
          >
            Uložit do kalendáře
          </button>
        </div>
      </div>
    </div>
  );
}

export default CalendarDemo;
