"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarDays,
  CircleDollarSign,
  Plus,
  User,
} from "lucide-react";
import { listEvents } from "@/app/actions/events";
import { getTasksByOpportunityId } from "@/app/actions/tasks";
import type { OpportunityDetail } from "@/app/actions/pipeline";

function formatCurrencyCzk(val: number) {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(val);
}

function parseExpectedValue(s: string | null): number {
  if (s == null || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function OpportunitySidebar({ opportunity }: { opportunity: OpportunityDetail }) {
  const [nextActivity, setNextActivity] = useState<string | null>(null);
  const [hoursSpent, setHoursSpent] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(2000);

  const dealReward = useMemo(
    () => parseExpectedValue(opportunity.expectedValue),
    [opportunity.expectedValue],
  );

  const financialData = useMemo(() => {
    const costs = hoursSpent * hourlyRate;
    const profit = dealReward - costs;
    return { costs, profit };
  }, [hoursSpent, hourlyRate, dealReward]);

  useEffect(() => {
    const now = new Date();
    const nowStr = now.toISOString();
    Promise.all([
      listEvents({ opportunityId: opportunity.id, start: nowStr }),
      getTasksByOpportunityId(opportunity.id),
    ])
      .then(([upcomingEvents, tasks]) => {
        const nextEvent = upcomingEvents[0];
        if (nextEvent) {
          setNextActivity(
            `${nextEvent.title} – ${new Date(nextEvent.startAt).toLocaleString("cs-CZ")}`,
          );
        } else {
          const nextTask = tasks.filter(
            (t) => !t.completedAt && t.dueDate && t.dueDate >= nowStr.slice(0, 10),
          )[0];
          setNextActivity(
            nextTask ? `${nextTask.title} (${nextTask.dueDate})` : null,
          );
        }
      })
      .catch(() => {});
  }, [opportunity.id]);

  const closeDateStr = (() => {
    const raw = opportunity.expectedCloseDate;
    if (raw == null || raw === "") return "—";
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString("cs-CZ");
  })();

  return (
    <div className="space-y-6 w-full xl:max-w-none">
      {/* Kontext obchodu */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 sm:p-8">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 border-b border-slate-50 pb-3">
          Kontext obchodu
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors gap-3 min-h-[44px]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <User size={14} aria-hidden />
              </div>
              <span className="text-xs font-bold text-slate-500">Klient</span>
            </div>
            {opportunity.contactId ? (
              <Link
                href={`/portal/contacts/${opportunity.contactId}`}
                className="text-sm font-black text-indigo-600 hover:underline shrink-0 text-right"
              >
                {opportunity.contactName || "—"}
              </Link>
            ) : (
              <span className="text-sm font-bold text-slate-700">—</span>
            )}
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors gap-3 min-h-[44px]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <User size={14} aria-hidden />
              </div>
              <span className="text-xs font-bold text-slate-500">Vlastník</span>
            </div>
            <span className="text-sm font-bold text-slate-700 text-right">
              {opportunity.assignedTo || "Nepřiřazeno"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors gap-3 min-h-[44px]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <CalendarDays size={14} aria-hidden />
              </div>
              <span className="text-xs font-bold text-slate-500">
                Odhad uzavření
              </span>
            </div>
            <span className="text-sm font-black text-slate-900 text-right">
              {closeDateStr}
            </span>
          </div>
        </div>
      </div>

      {/* Finanční shrnutí */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 sm:p-8 relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-3xl pointer-events-none"
          aria-hidden
        />
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 border-b border-slate-50 pb-3 flex items-center gap-2 relative z-10">
          <CircleDollarSign size={14} className="text-emerald-500" aria-hidden />
          Finanční shrnutí
        </h3>
        <div className="space-y-4 relative z-10">
          <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100 mb-2 gap-3">
            <span className="text-sm font-bold text-slate-500">
              Konečná odměna / Provize
            </span>
            <span className="text-lg sm:text-xl font-black text-slate-900 shrink-0">
              {formatCurrencyCzk(dealReward)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-50">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                Odpracováno
              </label>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-3 py-2 min-h-[44px] focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={hoursSpent}
                  onChange={(e) => setHoursSpent(Number(e.target.value))}
                  className="w-full bg-transparent text-sm font-black text-slate-800 outline-none min-h-[40px]"
                  aria-label="Odpracované hodiny"
                />
                <span className="text-xs font-bold text-slate-400 shrink-0">
                  hod
                </span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                Sazba (Náklad)
              </label>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-3 py-2 min-h-[44px] focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="w-full bg-transparent text-sm font-black text-slate-800 outline-none min-h-[40px]"
                  aria-label="Hodinová sazba v Kč"
                />
                <span className="text-xs font-bold text-slate-400 shrink-0">
                  /h
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center px-1 pt-2 gap-2">
            <span className="text-xs font-bold text-rose-600">
              Celkové náklady
            </span>
            <span className="text-sm font-black text-rose-600 shrink-0">
              −{formatCurrencyCzk(financialData.costs)}
            </span>
          </div>

          <div className="flex justify-between items-center px-1 pt-2 border-t border-slate-100 gap-2">
            <span className="text-sm font-black text-slate-900 uppercase tracking-widest">
              Čistý zisk
            </span>
            <span
              className={`text-xl sm:text-2xl font-black shrink-0 ${
                financialData.profit >= 0 ? "text-emerald-500" : "text-rose-500"
              }`}
            >
              {financialData.profit >= 0 ? "+" : ""}
              {formatCurrencyCzk(financialData.profit)}
            </span>
          </div>
        </div>
      </div>

      {/* Plánování */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 sm:p-8">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 border-b border-slate-50 pb-3 flex items-center gap-2">
          <Activity size={14} className="text-blue-500" aria-hidden />
          Plánování
        </h3>
        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              Nejbližší naplánovaná
            </p>
            <p className="text-sm font-bold text-slate-900 bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[44px] flex items-center">
              {nextActivity ?? "Žádná budoucí aktivita"}
            </p>
          </div>
          <Link
            href="/portal/calendar"
            className="w-full min-h-[44px] py-3 bg-white border-2 border-dashed border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 touch-manipulation"
          >
            <Plus size={16} aria-hidden />
            Naplánovat aktivitu
          </Link>
        </div>
      </div>
    </div>
  );
}
