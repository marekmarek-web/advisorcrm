"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  CheckSquare,
  Briefcase,
  Package,
  BarChart3,
  CalendarClock,
  Target,
  HelpCircle,
  AlertTriangle,
  Sparkles,
  ArrowUpRight,
  Users,
} from "lucide-react";
import { getPreMeetingBrief } from "@/app/actions/pre-meeting-brief";
import type { PreMeetingBrief } from "@/lib/meeting-briefing/types";

type Props = {
  contactId: string;
  eventId?: string | null;
  /** If true, show compact version (e.g. in calendar side panel). */
  compact?: boolean;
};

export function PreMeetingBriefPanel({ contactId, eventId, compact = false }: Props) {
  const [brief, setBrief] = useState<PreMeetingBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    getPreMeetingBrief(contactId, eventId ?? undefined)
      .then((b) => setBrief(b ?? null))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [contactId, eventId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <Sparkles size={18} className="animate-pulse" />
          <span className="text-sm font-medium">Načítám briefing…</span>
        </div>
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600 mb-4">
          Nepodařilo se načíst přípravu na schůzku.
        </p>
        <Link
          href={`/portal/contacts/${contactId}`}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Otevřít profil klienta <ArrowUpRight size={14} />
        </Link>
      </div>
    );
  }

  const hasLittleData =
    !brief.lastMeetingSummary &&
    brief.openTasks.length === 0 &&
    brief.openOpportunities.length === 0 &&
    brief.productsSummary.length === 0 &&
    brief.analysisStatus === "missing";

  const block = (title: string, icon: React.ReactNode, children: React.ReactNode, badge?: "doporučení" | "návrh") => (
    <section className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-600">
          {icon}
        </div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {badge && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
            {badge}
          </span>
        )}
      </div>
      <div className="text-sm text-slate-700">{children}</div>
    </section>
  );

  if (compact) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-500" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Příprava na schůzku</span>
        </div>
        <p className="text-sm text-slate-800">{brief.executiveSummary}</p>
        {brief.suggestedMainGoal && (
          <p className="text-sm font-medium text-indigo-700">
            <Target size={14} className="inline mr-1 align-middle" />
            {brief.suggestedMainGoal}
          </p>
        )}
        {brief.warnings.length > 0 && (
          <div className="flex items-center gap-2 text-amber-700 text-xs">
            <AlertTriangle size={14} />
            {brief.warnings[0]}
          </div>
        )}
        <Link
          href={`/portal/contacts/${contactId}#briefing`}
          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700"
        >
          Celý briefing <ArrowUpRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-black text-slate-900">Příprava na schůzku</h2>
        {brief.householdName && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
            <Users size={12} /> {brief.householdName}
          </span>
        )}
      </div>

      {hasLittleData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-sm text-amber-900 mb-3">
            Pro lepší briefing doplňte údaje o klientovi (analýza, produkty, zápisky).
          </p>
          <Link
            href={`/portal/contacts/${contactId}`}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200"
          >
            Otevřít profil klienta <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      {block("Shrnutí", <FileText size={16} />, <p>{brief.executiveSummary}</p>)}

      {brief.lastMeetingSummary ? (
        block("Co se řešilo minule", <FileText size={16} />, <p className="whitespace-pre-wrap">{brief.lastMeetingSummary}</p>)
      ) : (
        <section className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Co se řešilo minule</h3>
          </div>
          <p className="text-sm text-slate-500 mb-2">Zatím žádné zápisky ze schůzek.</p>
          <Link href={`/portal/notes?contactId=${contactId}`} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            Přidat zápisek →
          </Link>
        </section>
      )}

      {brief.openTasks.length > 0
        ? block(
            "Otevřené úkoly",
            <CheckSquare size={16} />,
            <ul className="list-disc pl-4 space-y-1">
              {brief.openTasks.slice(0, 5).map((t) => (
                <li key={t.id}>
                  {t.title}
                  {t.dueDate && <span className="text-slate-500 ml-1">({t.dueDate})</span>}
                </li>
              ))}
              {brief.openTasks.length > 5 && <li className="text-slate-500">+{brief.openTasks.length - 5} dalších</li>}
            </ul>
          )
        : block("Otevřené úkoly", <CheckSquare size={16} />, <p className="text-slate-500">Žádné otevřené úkoly.</p>)}

      {brief.openOpportunities.length > 0
        ? block(
            "Rozpracované obchody",
            <Briefcase size={16} />,
            <ul className="list-disc pl-4 space-y-1">
              {brief.openOpportunities.slice(0, 5).map((o) => (
                <li key={o.id}>
                  {o.title} <span className="text-slate-500">({o.stageName})</span>
                </li>
              ))}
            </ul>
          )
        : block("Rozpracované obchody", <Briefcase size={16} />, <p className="text-slate-500">Žádné otevřené obchody.</p>)}

      {brief.productsSummary.length > 0
        ? block("Produkty", <Package size={16} />, <p>{brief.productsSummary.join(", ")}</p>)
        : block("Produkty", <Package size={16} />, <p className="text-slate-500">Žádné evidované produkty.</p>)}

      {block(
        "Stav analýzy",
        <BarChart3 size={16} />,
        brief.analysisStatus === "missing" ? (
          <p className="text-slate-500">Chybí finanční analýza. <Link href={`/portal/analyses/financial?clientId=${contactId}`} className="text-indigo-600 font-semibold">Vytvořit analýzu</Link></p>
        ) : (
          <p>
            {brief.analysisStatus === "draft" && "Rozpracovaná analýza."}
            {brief.analysisStatus === "completed" && "Analýza dokončena."}
            {brief.analysisStatus === "exported" && "Analýza exportována."}
            {brief.analysisGaps.length > 0 && ` Mezery: ${brief.analysisGaps.join(", ")}`}
          </p>
        )
      )}

      {brief.serviceSignals
        ? block("Servis", <CalendarClock size={16} />, <p>{brief.serviceSignals.label}</p>)
        : block(
            "Servis",
            <CalendarClock size={16} />,
            <p className="text-slate-500">Není vyplněno. <Link href={`/portal/contacts/${contactId}/edit`} className="text-indigo-600 font-semibold">Doplnit servisní termín</Link></p>
          )}

      {brief.topAiOpportunities.length > 0 &&
        block(
          "Doporučené příležitosti",
          <Sparkles size={16} />,
          <ul className="list-disc pl-4 space-y-1">
            {brief.topAiOpportunities.map((o, i) => (
              <li key={i}>
                <span className="font-medium">{o.title}</span>: {o.recommendation}
              </li>
            ))}
          </ul>,
          "doporučení"
        )}

      {brief.suggestedAgenda.length > 0 && (
        block(
          "Doporučená agenda",
          <Target size={16} />,
          <ol className="list-decimal pl-4 space-y-1">
            {brief.suggestedAgenda.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>,
          "návrh"
        )
      )}

      {brief.suggestedMainGoal &&
        block("Hlavní cíl schůzky", <Target size={16} />, <p className="font-medium text-indigo-800">{brief.suggestedMainGoal}</p>, "návrh")}

      {brief.questionsToOpen.length > 0 &&
        block(
          "Otázky k otevření",
          <HelpCircle size={16} />,
          <ul className="list-disc pl-4 space-y-1">
            {brief.questionsToOpen.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>,
          "návrh"
        )}

      {brief.warnings.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <h3 className="text-sm font-bold text-amber-900">Upozornění</h3>
          </div>
          <ul className="list-disc pl-4 text-sm text-amber-800">
            {brief.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {brief.sourceSignals.length > 0 && (
        <p className="text-xs text-slate-400">
          Zdroj: {brief.sourceSignals.map((s) => s.label).join(", ")}
        </p>
      )}
    </div>
  );
}
