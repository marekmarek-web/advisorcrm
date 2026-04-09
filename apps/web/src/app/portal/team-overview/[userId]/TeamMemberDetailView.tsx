"use client";

import Link from "next/link";
import {
  TrendingUp,
  Calendar,
  CheckSquare,
  Briefcase,
  Activity,
  AlertTriangle,
  ChevronRight,
  Check,
  X,
} from "lucide-react";
import type { TeamMemberDetail } from "@/app/actions/team-overview";
import { formatCareerProgramLabel, formatCareerTrackLabel } from "@/lib/career/evaluate-career-progress";
import type { EvaluationCompleteness, ProgressEvaluation } from "@/lib/career/types";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("cs-CZ");
}

function progressEvaluationLabel(pe: ProgressEvaluation): string {
  switch (pe) {
    case "not_configured":
      return "Kariéra nenastavena";
    case "data_missing":
      return "Chybí data nebo konfigurace";
    case "unknown":
      return "Nejasná specifikace / neznámá hodnota";
    case "on_track":
      return "Na dobré cestě (ověření BJ/BJS vždy ručně)";
    case "close_to_promotion":
      return "Blízko postupu (nutné potvrzení)";
    case "blocked":
      return "Blokováno / nesoulad s konfigurací";
    case "promoted_ready":
      return "Připraveno k postupu (nutné potvrzení vedením)";
    default:
      return pe;
  }
}

function evaluationCompletenessLabel(ec: EvaluationCompleteness): string {
  switch (ec) {
    case "full":
      return "Evaluace kompletní (automatická část)";
    case "partial":
      return "Částečně vyhodnoceno";
    case "low_confidence":
      return "Nízká jistota (chybí údaje nebo legacy)";
    case "manual_required":
      return "Nutné manuální ověření (PDF / HR)";
    default:
      return ec;
  }
}

function progressBadgeClass(pe: ProgressEvaluation): string {
  if (pe === "on_track" || pe === "close_to_promotion" || pe === "promoted_ready") {
    return "bg-emerald-100 text-emerald-800";
  }
  return "bg-amber-100 text-amber-800";
}

function buildCoachingSummary(detail: TeamMemberDetail): string[] {
  const bullets: string[] = [];
  const m = detail.metrics;
  const critical = detail.alerts.filter((a) => a.severity === "critical");
  const warning = detail.alerts.filter((a) => a.severity === "warning");
  if (critical.length > 0) {
    bullets.push(`Rizika: ${critical.map((a) => a.title).join("; ")}.`);
  }
  if (warning.length > 0 && critical.length === 0) {
    bullets.push(`Pozor: ${warning.map((a) => a.title).join("; ")}.`);
  }
  if (m) {
    if (m.daysWithoutActivity >= 7 && !detail.alerts.some((a) => a.type === "no_activity")) {
      bullets.push(`${m.daysWithoutActivity} dní bez aktivity – interní tip: zvažte pravidelný záznam v CRM.`);
    }
    if (m.meetingsThisPeriod === 0 && m.unitsThisPeriod === 0) {
      bullets.push("Zatím žádné schůzky ani jednotky v tomto období – oblast k ověření vedením: naplánovat schůzky a follow-up.");
    }
    if (m.tasksOpen > 10) {
      bullets.push("Vysoký počet otevřených úkolů – interní upozornění: zvažte priorizaci a uzavření starých položek.");
    }
  }
  if (detail.adaptation) {
    if (detail.adaptation.adaptationStatus === "Rizikový") {
      bullets.push(`Nováček v riziku (${detail.adaptation.adaptationScore} % adaptace) – interní tip: zvažte intenzivnější podporu a check-in.`);
    } else if (detail.adaptation.adaptationStatus === "V adaptaci" && detail.adaptation.warnings.length > 0) {
      bullets.push(`Adaptace: ${detail.adaptation.warnings.join("; ")}.`);
    }
  }
  if (bullets.length === 0 && m) {
    bullets.push("Žádná zásadní rizika. Pokračovat v pravidelném vedení a zpětné vazbě.");
  }
  return bullets;
}

export function TeamMemberDetailView({ detail }: { detail: TeamMemberDetail }) {
  const name = detail.displayName || "Člen týmu";
  const m = detail.metrics;
  const coachingBullets = buildCoachingSummary(detail);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[color:var(--wp-text)]">{name}</h1>
        <p className="text-[color:var(--wp-text-secondary)] mt-1">
          {detail.roleName}
          {detail.email ? ` · ${detail.email}` : ""}
          {" · v týmu od "}
          {new Date(detail.joinedAt).toLocaleDateString("cs-CZ")}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-[color:var(--wp-text)] mb-3 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-violet-500" />
          Kariéra
        </h2>
        <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm space-y-3">
          <p className="text-xs text-[color:var(--wp-text-secondary)]">
            <span className="text-[color:var(--wp-text-tertiary)]">Aplikační role (CRM):</span>{" "}
            <strong className="text-[color:var(--wp-text)]">{detail.roleName}</strong>
            <span className="text-[color:var(--wp-text-tertiary)]"> — odděleně od kariérního programu a větve</span>
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">
              Program: {formatCareerProgramLabel(detail.careerEvaluation.careerProgramId)}
            </span>
            <span className="rounded-full bg-[color:var(--wp-surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--wp-text-secondary)]">
              Větev: {formatCareerTrackLabel(detail.careerEvaluation.careerTrackId)}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${progressBadgeClass(detail.careerEvaluation.progressEvaluation)}`}>
              Stav: {progressEvaluationLabel(detail.careerEvaluation.progressEvaluation)}
            </span>
            <span className="rounded-full border border-[color:var(--wp-surface-card-border)] px-2.5 py-0.5 text-xs text-[color:var(--wp-text-secondary)]">
              {evaluationCompletenessLabel(detail.careerEvaluation.evaluationCompleteness)}
            </span>
          </div>
          {detail.careerEvaluation.progressionOrder !== null ? (
            <p className="text-xs text-[color:var(--wp-text-tertiary)]">
              Krok ve větvi: <strong>{detail.careerEvaluation.progressionOrder + 1}</strong>. (pořadí z interní konfigurace)
            </p>
          ) : null}
          {detail.careerEvaluation.careerPositionLabel ? (
            <p className="text-sm text-[color:var(--wp-text)]">
              <strong>Aktuální pozice:</strong> {detail.careerEvaluation.careerPositionLabel}
              {detail.careerEvaluation.rawCareerPositionCode ? (
                <span className="text-[color:var(--wp-text-tertiary)]"> ({detail.careerEvaluation.rawCareerPositionCode})</span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Kód kariérní pozice není vyplněn nebo neodpovídá kombinaci program + větev v konfiguraci.</p>
          )}
          {detail.careerEvaluation.nextCareerPositionLabel ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">
              <strong>Další krok (ve stejné větvi):</strong> {detail.careerEvaluation.nextCareerPositionLabel}
              {detail.careerEvaluation.nextCareerPositionCode ? (
                <span className="text-[color:var(--wp-text-tertiary)]"> ({detail.careerEvaluation.nextCareerPositionCode})</span>
              ) : null}
            </p>
          ) : null}
          <p className="text-xs text-[color:var(--wp-text-secondary)]">
            Metriky níže jsou z CRM — <strong>nejsou</strong> oficiální BJ/BJS z kariérních řádů. Postup dle PDF vždy ověřte ručně.
          </p>
          {detail.careerEvaluation.missingRequirements.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[color:var(--wp-text-secondary)] mb-1">Položky k doplnění / ručnímu ověření</p>
              <ul className="list-disc list-inside text-xs text-[color:var(--wp-text-secondary)] space-y-1">
                {detail.careerEvaluation.missingRequirements.map((r) => (
                  <li key={r.id}>{r.labelCs}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {coachingBullets.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-[color:var(--wp-text)] mb-3">Shrnutí pro coaching</h2>
          <ul className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-indigo-50/30 p-5 space-y-2 list-disc list-inside text-sm text-[color:var(--wp-text-secondary)]">
            {coachingBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      )}

      {detail.alerts.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-[color:var(--wp-text)] mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Upozornění
          </h2>
          <ul className="space-y-2">
            {detail.alerts.map((a, i) => (
              <li
                key={i}
                className={`rounded-xl border px-4 py-3 ${
                  a.severity === "critical" ? "border-rose-200 bg-rose-50/50" : "border-amber-200 bg-amber-50/50"
                }`}
              >
                <p className="font-medium text-[color:var(--wp-text)]">{a.title}</p>
                <p className="text-sm text-[color:var(--wp-text-secondary)]">{a.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m && (
        <section>
          <h2 className="text-lg font-semibold text-[color:var(--wp-text)] mb-3">Metriky (tento měsíc)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
              <p className="text-2xl font-bold text-[color:var(--wp-text)]">{m.unitsThisPeriod}</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)]">Jednotky</p>
            </div>
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
              <p className="text-2xl font-bold text-[color:var(--wp-text)]">{formatNumber(m.productionThisPeriod)}</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)]">Produkce</p>
            </div>
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
              <p className="text-2xl font-bold text-[color:var(--wp-text)]">{m.meetingsThisPeriod}</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)]">Schůzky</p>
            </div>
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
              <p className="text-2xl font-bold text-[color:var(--wp-text)]">{m.activityCount}</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)]">Aktivity</p>
            </div>
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
              <p className="text-2xl font-bold text-[color:var(--wp-text)]">{m.callsThisPeriod}</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)]">Hovory</p>
            </div>
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
              <p className="text-2xl font-bold text-[color:var(--wp-text)]">{m.followUpsThisPeriod}</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)]">Follow-upy</p>
            </div>
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
              <p className="text-2xl font-bold text-[color:var(--wp-text)]">{Math.round(m.conversionRate * 100)}%</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)]">Conversion</p>
            </div>
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm">
              <p className="text-2xl font-bold text-[color:var(--wp-text)]">{formatNumber(m.pipelineValue)}</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)]">Hodnota obchodů</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <p className="text-[color:var(--wp-text-secondary)]">Otevřené úkoly: <strong>{m.tasksOpen}</strong></p>
            <p className="text-[color:var(--wp-text-secondary)]">Splněné úkoly: <strong>{m.tasksCompleted}</strong></p>
            <p className="text-[color:var(--wp-text-secondary)]">Otevřené případy: <strong>{m.opportunitiesOpen}</strong></p>
            <p className="text-[color:var(--wp-text-secondary)]">Poslední aktivita: {m.lastActivityAt ? new Date(m.lastActivityAt).toLocaleDateString("cs-CZ") : "—"}</p>
            <p className="text-[color:var(--wp-text-secondary)]">Dnů bez aktivity: <strong>{m.daysWithoutActivity}</strong></p>
          </div>
        </section>
      )}

      {detail.performanceOverTime.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-[color:var(--wp-text)] mb-3">Výkon v čase</h2>
          <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
            <div className="flex gap-2 items-end justify-between h-28">
              {detail.performanceOverTime.map((p, i) => {
                const maxUnits = Math.max(...detail.performanceOverTime.map((x) => x.units), 1);
                const heightPct = maxUnits > 0 ? (p.units / maxUnits) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full flex flex-col justify-end h-16 rounded-t bg-[color:var(--wp-surface-muted)] overflow-hidden">
                      <div
                        className="w-full bg-indigo-500 rounded-t"
                        style={{ height: `${heightPct}%`, minHeight: p.units > 0 ? "4px" : 0 }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-[color:var(--wp-text-secondary)] truncate w-full text-center" title={p.label}>{p.label}</span>
                    <span className="text-xs font-semibold text-[color:var(--wp-text-secondary)]">{p.units}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {detail.adaptation && (
        <section>
          <h2 className="text-lg font-semibold text-[color:var(--wp-text)] mb-3">Adaptace nováčka</h2>
          <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-4">
              <span className="text-[color:var(--wp-text-secondary)]">{detail.adaptation.daysInTeam} dní v týmu</span>
              <span className="rounded-full bg-[color:var(--wp-surface-muted)] px-3 py-1 text-sm font-bold text-[color:var(--wp-text-secondary)]">{detail.adaptation.adaptationScore} %</span>
            </div>
            <p className="text-sm text-[color:var(--wp-text-secondary)] mb-3">Stav: <strong>{detail.adaptation.adaptationStatus}</strong></p>
            <ul className="space-y-2">
              {detail.adaptation.checklist.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  {s.completed ? <Check className="w-4 h-4 text-emerald-500" /> : <X className="w-4 h-4 text-[color:var(--wp-text-tertiary)]" />}
                  <span className={s.completed ? "text-[color:var(--wp-text-secondary)]" : "text-[color:var(--wp-text-secondary)]"}>{s.label}</span>
                </li>
              ))}
            </ul>
            {detail.adaptation.warnings.length > 0 && (
              <p className="mt-3 text-sm text-amber-600">{detail.adaptation.warnings.join(" · ")}</p>
            )}
          </div>
        </section>
      )}

      <div className="pt-4">
        <Link
          href="/portal/team-overview"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          ← Zpět na Týmový přehled
        </Link>
      </div>
    </div>
  );
}
