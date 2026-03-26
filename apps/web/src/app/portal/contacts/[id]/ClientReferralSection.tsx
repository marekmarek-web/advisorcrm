"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  UserPlus,
  Edit2,
  Calendar,
  ListTodo,
  ChevronRight,
  Users,
  Info,
  Handshake,
} from "lucide-react";
import {
  getReferralSummaryForContact,
  getReferralRequestSignals,
} from "@/app/actions/referral";
import { createTask } from "@/app/actions/tasks";
import type { ReferralSummary, ReferralRequestSignalsResult } from "@/lib/referral/types";

export function ClientReferralSection({ contactId }: { contactId: string }) {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [signalsResult, setSignalsResult] = useState<ReferralRequestSignalsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      getReferralSummaryForContact(contactId),
      getReferralRequestSignals(contactId),
    ])
      .then(([s, sig]) => {
        setSummary(s ?? null);
        setSignalsResult(sig ?? null);
      })
      .catch(() => setError("Nepodařilo načíst doporučení."))
      .finally(() => setLoading(false));
  }, [contactId]);

  const handleCreateReferralTask = async () => {
    setCreatingTask(true);
    try {
      const id = await createTask({
        title: "Požádat o doporučení",
        contactId,
      });
      if (id) {
        setSignalsResult((prev) =>
          prev ? { ...prev, suppressReason: "Úkol o doporučení už existuje.", signals: [] } : null
        );
      }
    } finally {
      setCreatingTask(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Handshake className="text-slate-400" size={20} />
            Doporučení
          </h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-500">Načítám…</p>
        </div>
      </div>
    );
  }

  if (error || (summary === null && signalsResult === null)) {
    return (
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Handshake className="text-slate-400" size={20} />
            Doporučení
          </h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-600">{error ?? "Chyba načtení."}</p>
        </div>
      </div>
    );
  }

  const hasReferredBy =
    (summary?.referredByContactId || summary?.referredBySourceText) ?? false;
  const hasReferredByLink = Boolean(summary?.referredByContactId);
  const givenCount = summary?.givenCount ?? 0;
  const referredContacts = summary?.referredContacts ?? [];
  const lastReferralAt = summary?.lastReferralAt;
  const valueCzk = summary?.valueCzk;
  const convertedCount = summary?.convertedCount ?? 0;
  const primarySignal = signalsResult?.signals?.[0] ?? null;
  const suppressReason = signalsResult?.suppressReason ?? null;

  return (
    <div id="doporučení" className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-50">
        <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Handshake className="text-slate-400" size={20} />
          Doporučení
        </h2>
      </div>
      <div className="p-6 space-y-6">
        {/* Kdo klienta doporučil */}
        {!hasReferredBy && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 flex flex-col gap-3">
            <p className="text-sm text-slate-600 flex items-start gap-2">
              <Info size={18} className="text-slate-400 shrink-0 mt-0.5" />
              Zdroj doporučení není vyplněn.
            </p>
            <Link
              href={`/portal/contacts/${contactId}/edit`}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors w-fit"
            >
              <Edit2 size={16} />
              Upravit kontakt
            </Link>
          </div>
        )}
        {hasReferredBy && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">Doporučil(a):</span>
            {hasReferredByLink && summary?.referredByContactId ? (
              <Link
                href={`/portal/contacts/${summary.referredByContactId}`}
                className="text-sm font-semibold text-[var(--brand-main)] hover:underline"
              >
                {summary.referredByContactName ?? "Kontakt"}
              </Link>
            ) : (
              <span className="text-sm font-medium text-slate-800">
                {summary?.referredBySourceText ?? summary?.referredByContactName ?? "—"}
              </span>
            )}
            {hasReferredByLink && (
              <Link
                href={`/portal/contacts/${contactId}/edit`}
                className="text-xs text-slate-500 hover:text-slate-700 ml-1"
              >
                (propojit s kontaktem)
              </Link>
            )}
          </div>
        )}

        {/* Koho klient doporučil – počet a hodnota */}
        {givenCount === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Tento klient zatím nikoho nedoporučil.
            </p>
            {primarySignal && !suppressReason && (
              <>
                <p className="text-sm font-medium text-slate-800">{primarySignal.description}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCreateReferralTask}
                    disabled={creatingTask}
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-aidv-create text-white text-sm font-bold shadow-sm hover:bg-aidv-create-hover transition-colors disabled:opacity-60"
                  >
                    <ListTodo size={16} />
                    {creatingTask ? "Vytvářím…" : "Vytvořit úkol: Požádat o doporučení"}
                  </button>
                  <Link
                    href={`/portal/calendar?contactId=${contactId}&newEvent=1`}
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors"
                  >
                    <Calendar size={16} />
                    Naplánovat schůzku
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {givenCount > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-800">
                <Users size={14} />
                {givenCount} doporučení
              </span>
              {convertedCount > 0 && (
                <span className="text-sm text-slate-600">
                  {convertedCount} konvertováno
                </span>
              )}
              {valueCzk != null && valueCzk > 0 && (
                <span className="text-sm font-semibold text-slate-800">
                  Hodnota: {Number(valueCzk).toLocaleString("cs-CZ")} Kč
                </span>
              )}
              {lastReferralAt && (
                <span className="text-sm text-slate-500">
                  Poslední: {new Date(lastReferralAt).toLocaleDateString("cs-CZ")}
                </span>
              )}
            </div>

            {/* Referral historie – seznam */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-2">Historie doporučení</h3>
              <ul className="space-y-2">
                {referredContacts.map((ref) => (
                  <li key={ref.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                    <Link
                      href={`/portal/contacts/${ref.id}`}
                      className="text-sm font-medium text-slate-800 hover:text-[var(--brand-main)] truncate"
                    >
                      {ref.name}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      {ref.converted ? (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                          Klient
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          Lead
                        </span>
                      )}
                      {ref.valueCzk != null && ref.valueCzk > 0 && (
                        <span className="text-xs text-slate-500">
                          {Number(ref.valueCzk).toLocaleString("cs-CZ")} Kč
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA: Přidat doporučeného */}
            <Link
              href={`/portal/contacts/new?referralContactId=${contactId}`}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors w-fit"
            >
              <UserPlus size={16} />
              Přidat doporučeného
            </Link>

            {/* Vhodný moment požádat o další referral */}
            {primarySignal && !suppressReason && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 flex flex-col gap-3">
                <p className="text-sm font-medium text-slate-800">{primarySignal.description}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCreateReferralTask}
                    disabled={creatingTask}
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-aidv-create text-white text-sm font-bold shadow-sm hover:bg-aidv-create-hover transition-colors disabled:opacity-60"
                  >
                    <ListTodo size={16} />
                    {creatingTask ? "Vytvářím…" : "Vytvořit úkol"}
                  </button>
                  <Link
                    href={`/portal/calendar?contactId=${contactId}&newEvent=1`}
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 transition-colors"
                  >
                    <Calendar size={16} />
                    Naplánovat schůzku
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
