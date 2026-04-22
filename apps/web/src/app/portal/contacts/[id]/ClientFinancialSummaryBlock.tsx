"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Target,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Users,
} from "lucide-react";
import {
  getClientFinancialSummaryForContact,
  type ClientFinancialSummaryView,
} from "@/app/actions/client-financial-summary";
import { getAnalysisStatusLabel } from "@/lib/analyses/financial/constants";

const RECENCY_MONTHS = 12;

function fmtCZK(value: number): string {
  if (value === 0) return "—";
  return (
    value.toLocaleString("cs-CZ", { maximumFractionDigits: 0, minimumFractionDigits: 0 }) +
    " Kč"
  );
}

function isStale(updatedAt: Date | null): boolean {
  if (!updatedAt) return true;
  const limit = new Date();
  limit.setMonth(limit.getMonth() - RECENCY_MONTHS);
  return new Date(updatedAt) < limit;
}

function getCtaHref(
  view: ClientFinancialSummaryView,
  contactId: string
): { href: string; label: string } {
  if (view.status === "missing") {
    return {
      href: `/portal/analyses/financial?clientId=${contactId}`,
      label: "Založit analýzu",
    };
  }
  if (view.primaryAnalysisId) {
    const label =
      view.status === "draft" ? "Dokončit analýzu" : "Otevřít analýzu";
    return {
      href: `/portal/analyses/financial?id=${view.primaryAnalysisId}`,
      label,
    };
  }
  return {
    href: `/portal/analyses/financial?clientId=${contactId}`,
    label: "Založit analýzu",
  };
}

export function ClientFinancialSummaryBlock({
  contactId,
}: {
  contactId: string;
}) {
  const [view, setView] = useState<ClientFinancialSummaryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getClientFinancialSummaryForContact(contactId)
      .then(setView)
      .catch(() => setError("Nepodařilo se načíst finanční souhrn."))
      .finally(() => setLoading(false));
  }, [contactId]);

  if (loading) {
    return (
      <div className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
          <h2 className="text-lg font-black text-[color:var(--wp-text)]">Finanční souhrn</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám…</p>
        </div>
      </div>
    );
  }

  if (error || !view) {
    return (
      <div className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
          <h2 className="text-lg font-black text-[color:var(--wp-text)]">Finanční souhrn</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-red-600">{error ?? "Žádná data."}</p>
        </div>
      </div>
    );
  }

  const cta = getCtaHref(view, contactId);
  const stale = isStale(view.updatedAt);

  if (view.status === "missing") {
    return (
      <div className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
          <h2 className="text-lg font-black text-[color:var(--wp-text)]">Finanční souhrn</h2>
        </div>
        <div className="p-8 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-[color:var(--wp-surface-muted)] flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-[color:var(--wp-text-tertiary)]" aria-hidden />
          </div>
          <p className="text-[color:var(--wp-text-secondary)] font-semibold mb-1">Žádná finanční analýza</p>
          <p className="text-sm text-[color:var(--wp-text-secondary)] mb-6 max-w-sm">
            Založte finanční analýzu a mějte přehled o cílech, příjmech, výdajích a majetku klienta.
          </p>
          <Link
            href={cta.href}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-white px-5 py-3 text-sm font-semibold hover:bg-amber-600 transition-colors min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            {cta.label}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[color:var(--wp-text)]">Finanční souhrn</h2>
          {view.scope === "household" && view.householdName && (
            <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] mt-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              Údaje z analýzy domácnosti: {view.householdName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-[color:var(--wp-text-secondary)] px-2.5 py-1 rounded-lg bg-[color:var(--wp-surface-muted)]">
            {getAnalysisStatusLabel(view.status)}
          </span>
          {view.updatedAt && (
            <span className="text-xs text-[color:var(--wp-text-tertiary)]">
              {new Date(view.updatedAt).toLocaleDateString("cs-CZ")}
              {stale && (
                <span className="ml-1 text-amber-600 font-semibold">
                  · Zastaralé
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Cíle */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Cíle
          </h3>
          {view.goalsCount === 0 ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">—</p>
          ) : (
            <ul className="text-sm font-semibold text-[color:var(--wp-text)] space-y-1">
              {view.goals.map((g, i) => (
                <li key={i}>{g.name}</li>
              ))}
              {view.goalsCount > view.goals.length && (
                <li className="text-[color:var(--wp-text-secondary)] font-normal">
                  +{view.goalsCount - view.goals.length} dalších
                </li>
              )}
            </ul>
          )}
        </section>

        {/* Příjmy a výdaje */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
              Příjmy
            </h3>
            <p className="text-lg font-black text-[color:var(--wp-text)]">
              {fmtCZK(view.income)}
            </p>
          </div>
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
              Výdaje
            </h3>
            <p className="text-lg font-black text-[color:var(--wp-text)]">
              {fmtCZK(view.expenses)}
            </p>
          </div>
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
              Bilance
            </h3>
            <p
              className={`text-lg font-black ${
                view.surplus >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {view.surplus >= 0 ? (
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  {fmtCZK(view.surplus)}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <TrendingDown className="w-4 h-4" />
                  {fmtCZK(view.surplus)}
                </span>
              )}
            </p>
          </div>
        </section>

        {/* Majetek a závazky */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" />
              Majetek
            </h3>
            <p className="text-lg font-black text-[color:var(--wp-text)]">
              {fmtCZK(view.assets)}
            </p>
          </div>
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
              Závazky
            </h3>
            <p className="text-lg font-black text-[color:var(--wp-text)]">
              {fmtCZK(view.liabilities)}
            </p>
          </div>
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
              Čisté jmění
            </h3>
            <p className="text-lg font-black text-[color:var(--wp-text)]">
              {fmtCZK(view.netWorth)}
            </p>
          </div>
        </section>

        {/* Rezerva */}
        <section>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
            Rezerva
          </h3>
          {view.reserveOk ? (
            <p className="text-sm font-semibold text-emerald-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Splněno
            </p>
          ) : view.reserveGap > 0 ? (
            <p className="text-sm font-semibold text-amber-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Chybí {fmtCZK(view.reserveGap)}
            </p>
          ) : (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">—</p>
          )}
        </section>

        {/* Priority */}
        {view.priorities.length > 0 && (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
              Priority
            </h3>
            <ul className="text-sm font-semibold text-[color:var(--wp-text)] space-y-1">
              {view.priorities.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Mezery */}
        {view.gaps.length > 0 && (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
              Mezery
            </h3>
            <ul className="text-sm text-amber-700 space-y-1">
              {view.gaps.map((g, i) => (
                <li key={i} className="flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {g}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CTA */}
        <div className="pt-4 border-t border-[color:var(--wp-surface-card-border)]">
          <Link
            href={cta.href}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-white px-5 py-3 text-sm font-semibold hover:bg-amber-600 transition-colors min-h-[44px]"
          >
            {cta.label}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
