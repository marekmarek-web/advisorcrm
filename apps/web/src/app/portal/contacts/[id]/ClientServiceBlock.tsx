"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wrench,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Users,
  Info,
} from "lucide-react";
import {
  getServiceRecommendationsForContact,
} from "@/app/actions/service-engine";
import type { ServiceRecommendation, ServiceStatus } from "@/lib/service-engine/types";
import { SERVICE_STATUS_LABELS } from "@/lib/service-engine/types";
import { getServiceCtaHref } from "@/lib/service-engine/cta";

function statusBadgeClass(status: ServiceStatus["status"]): string {
  switch (status) {
    case "overdue":
      return "bg-red-100 text-red-800 border-red-200";
    case "due_soon":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "pending_followup":
    case "pending_review":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "current":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "missing":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function urgencyBorderClass(urgency: string): string {
  switch (urgency) {
    case "overdue":
      return "border-l-red-500";
    case "due_soon":
      return "border-l-amber-500";
    case "upcoming":
      return "border-l-blue-400";
    default:
      return "border-l-slate-300";
  }
}

export function ClientServiceBlock({ contactId }: { contactId: string }) {
  const [data, setData] = useState<{
    recommendations: ServiceRecommendation[];
    status: ServiceStatus;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getServiceRecommendationsForContact(contactId)
      .then(setData)
      .catch(() => setError("Nepodařilo načíst servisní doporučení."))
      .finally(() => setLoading(false));
  }, [contactId]);

  if (loading) {
    return (
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Wrench className="text-slate-400" size={20} />
            Servis a doporučení
          </h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-500">Načítám…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Wrench className="text-slate-400" size={20} />
            Servis a doporučení
          </h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-600">{error ?? "Chyba načtení."}</p>
        </div>
      </div>
    );
  }

  const { recommendations, status } = data;
  const activeRecs = recommendations.filter((r) => r.status === "active");
  const hasNoData = status.status === "no_data";
  const hasNoSignals = activeRecs.length === 0 && !hasNoData;

  return (
    <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-50">
        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Wrench className="text-slate-400" size={20} />
          Servis a doporučení
        </h2>
      </div>
      <div className="p-6 space-y-6">
        {/* Status badge + last/next service */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-bold ${statusBadgeClass(status.status)}`}
          >
            {status.status === "current" && <CheckCircle2 size={14} />}
            {(status.status === "overdue" || status.status === "due_soon") && (
              <AlertCircle size={14} />
            )}
            {status.label ?? SERVICE_STATUS_LABELS[status.status]}
          </span>
          {status.lastServiceDate && (
            <span className="text-sm text-slate-500">
              Poslední servis: {new Date(status.lastServiceDate).toLocaleDateString("cs-CZ")}
            </span>
          )}
          {status.nextServiceDue && (
            <span className="text-sm text-slate-500">
              Příští servis: {new Date(status.nextServiceDue).toLocaleDateString("cs-CZ")}
            </span>
          )}
        </div>

        {/* Empty / no data */}
        {hasNoData && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 flex flex-col gap-3">
            <p className="text-sm text-slate-600 flex items-start gap-2">
              <Info size={18} className="text-slate-400 shrink-0 mt-0.5" />
              Nemáme dost údajů pro servisní doporučení. Doplněním servisního cyklu nebo
              naplánováním první schůzky pomůžete engine lépe vyhodnocovat.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/portal/contacts/${contactId}/edit`}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
              >
                Doplnit servisní cyklus
              </Link>
              <Link
                href={`/portal/calendar?contactId=${contactId}&newEvent=1`}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold shadow-sm hover:bg-indigo-100 transition-colors"
              >
                <Calendar size={16} />
                Naplánovat první schůzku
              </Link>
            </div>
          </div>
        )}

        {/* No active signals but has data */}
        {hasNoSignals && !hasNoData && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-5">
            <p className="text-sm text-slate-700">
              Servis v pořádku.
              {status.nextServiceDue && (
                <> Příští doporučený servis: {new Date(status.nextServiceDue).toLocaleDateString("cs-CZ")}.</>
              )}
            </p>
            {status.nextServiceDue && (
              <Link
                href={`/portal/calendar?contactId=${contactId}&newEvent=1`}
                className="mt-3 min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 bg-white text-emerald-800 text-sm font-semibold shadow-sm hover:bg-emerald-50 transition-colors"
              >
                <Calendar size={16} />
                Naplánovat schůzku
              </Link>
            )}
          </div>
        )}

        {/* Missing next service date hint */}
        {!hasNoData && status.status === "missing" && activeRecs.length === 0 && status.lastServiceDate && (
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-5 flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              Doporučujeme doplnit datum příštího servisu.
            </p>
            <Link
              href={`/portal/contacts/${contactId}/edit`}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 bg-white text-amber-800 text-sm font-semibold shadow-sm hover:bg-amber-50 transition-colors w-fit"
            >
              Upravit kontakt
            </Link>
          </div>
        )}

        {/* List of recommendations */}
        {activeRecs.length > 0 && (
          <ul className="space-y-3">
            {activeRecs.map((rec) => {
              const cta = getServiceCtaHref(rec, contactId);
              return (
                <li
                  key={rec.id}
                  className={`rounded-xl border border-slate-100 bg-slate-50/30 pl-4 border-l-4 ${urgencyBorderClass(rec.urgency)} overflow-hidden`}
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">{rec.title}</h3>
                        {rec.isHouseholdLevel && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-xs font-semibold">
                            <Users size={12} />
                            Domácnost
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{rec.explanation}</p>
                      {rec.dueDate && (
                        <p className="text-xs text-slate-500 mt-1">
                          Termín: {new Date(rec.dueDate).toLocaleDateString("cs-CZ")}
                        </p>
                      )}
                    </div>
                    <Link
                      href={cta.href}
                      className="shrink-0 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-aidv-create text-white text-sm font-bold shadow-sm hover:bg-aidv-create-hover transition-colors"
                    >
                      {cta.label}
                      <ChevronRight size={16} />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
