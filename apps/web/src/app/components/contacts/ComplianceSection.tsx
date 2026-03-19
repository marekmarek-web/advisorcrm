"use client";

import { useState, useEffect } from "react";
import {
  getAmlChecklists,
  createAmlChecklist,
  getConsents,
  grantConsent,
  revokeConsent,
  getProcessingPurposes,
} from "@/app/actions/compliance";
import type {
  AmlChecklistRow,
  ConsentRow,
  PurposeRow,
} from "@/app/actions/compliance";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { Shield, FileCheck } from "lucide-react";

const RISK_BADGE: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

export function ComplianceSection({ contactId }: { contactId: string }) {
  const [tab, setTab] = useState<"aml" | "consents">("aml");
  const [amlList, setAmlList] = useState<AmlChecklistRow[]>([]);
  const [consentList, setConsentList] = useState<ConsentRow[]>([]);
  const [purposes, setPurposes] = useState<PurposeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAmlForm, setShowAmlForm] = useState(false);
  const [amlForm, setAmlForm] = useState({
    checkDate: "",
    riskLevel: "low",
    notes: "",
  });
  const [amlSubmitting, setAmlSubmitting] = useState(false);

  const [showConsentForm, setShowConsentForm] = useState(false);
  const [consentForm, setConsentForm] = useState({
    purposeId: "",
    source: "",
  });
  const [consentSubmitting, setConsentSubmitting] = useState(false);

  function loadData() {
    setLoading(true);
    Promise.all([
      getAmlChecklists(contactId),
      getConsents(contactId),
      getProcessingPurposes(),
    ])
      .then(([aml, cons, purps]) => {
        setAmlList(aml);
        setConsentList(cons);
        setPurposes(purps);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => loadData(), [contactId]);

  async function handleAmlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amlForm.checkDate) return;
    setAmlSubmitting(true);
    try {
      await createAmlChecklist(contactId, {
        checkDate: amlForm.checkDate,
        riskLevel: amlForm.riskLevel,
        notes: amlForm.notes || undefined,
      });
      setAmlForm({ checkDate: "", riskLevel: "low", notes: "" });
      setShowAmlForm(false);
      loadData();
    } finally {
      setAmlSubmitting(false);
    }
  }

  async function handleGrantConsent(e: React.FormEvent) {
    e.preventDefault();
    if (!consentForm.purposeId) return;
    setConsentSubmitting(true);
    try {
      await grantConsent(
        contactId,
        consentForm.purposeId,
        consentForm.source || undefined,
      );
      setConsentForm({ purposeId: "", source: "" });
      setShowConsentForm(false);
      loadData();
    } finally {
      setConsentSubmitting(false);
    }
  }

  async function handleRevoke(consentId: string) {
    if (!confirm("Opravdu odvolat tento souhlas?")) return;
    await revokeConsent(consentId);
    loadData();
  }

  if (loading)
    return (
      <p className="text-slate-500 text-sm">Načítám KYC & AML data…</p>
    );

  return (
    <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-slate-800 mb-4 text-sm">
        KYC & AML
      </h2>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("aml")}
          className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors min-h-[44px] ${
            tab === "aml"
              ? "border-[var(--wp-accent)] text-[var(--wp-accent)]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          AML
        </button>
        <button
          type="button"
          onClick={() => setTab("consents")}
          className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors min-h-[44px] ${
            tab === "consents"
              ? "border-[var(--wp-accent)] text-[var(--wp-accent)]"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Souhlasy
        </button>
      </div>

      {/* ── AML Tab ────────────────────────────────────── */}
      {tab === "aml" && (
        <div>
          {amlList.length === 0 && !showAmlForm && (
            <p className="text-sm text-slate-500 mb-3">Zatím žádné AML kontroly.</p>
          )}

          <ul className="space-y-2 mb-4">
            {amlList.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 text-sm border-b border-slate-100 pb-2 min-h-[44px]"
              >
                <span className="text-slate-800">
                  {new Date(row.checkDate).toLocaleDateString("cs-CZ")}
                </span>
                {row.riskLevel && (
                  <span
                    className={`inline-block rounded-lg px-2.5 py-0.5 text-xs font-medium ${
                      RISK_BADGE[row.riskLevel] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {row.riskLevel}
                  </span>
                )}
                {row.notes && (
                  <span className="text-slate-500 truncate max-w-xs">{row.notes}</span>
                )}
              </li>
            ))}
          </ul>

          {showAmlForm ? (
            <form onSubmit={handleAmlSubmit} className="space-y-3 max-w-md">
              <div>
                <label className="block text-xs font-medium text-slate-500">Datum kontroly</label>
                <input
                  type="date"
                  value={amlForm.checkDate}
                  onChange={(e) => setAmlForm((f) => ({ ...f, checkDate: e.target.value }))}
                  required
                  className="w-full rounded-[var(--wp-radius)] border border-slate-200 px-2 py-2 text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Úroveň rizika</label>
                <CustomDropdown
                  value={amlForm.riskLevel}
                  onChange={(id) => setAmlForm((f) => ({ ...f, riskLevel: id }))}
                  options={[
                    { id: "low", label: "Low" },
                    { id: "medium", label: "Medium" },
                    { id: "high", label: "High" },
                  ]}
                  placeholder="Úroveň"
                  icon={Shield}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Poznámky</label>
                <textarea
                  value={amlForm.notes}
                  onChange={(e) => setAmlForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-[var(--wp-radius)] border border-slate-200 px-2 py-1.5 text-sm resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={amlSubmitting}
                  className="rounded-[var(--wp-radius)] px-4 py-2.5 text-sm font-semibold text-white bg-[var(--wp-accent)] disabled:opacity-50 min-h-[44px]"
                >
                  {amlSubmitting ? "Ukládám…" : "Uložit"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAmlForm(false)}
                  className="rounded-[var(--wp-radius)] px-4 py-2.5 text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 min-h-[44px]"
                >
                  Zrušit
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAmlForm(true)}
              className="rounded-[var(--wp-radius)] px-4 py-2.5 text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 min-h-[44px]"
            >
              + Nová kontrola
            </button>
          )}
        </div>
      )}

      {/* ── Consents Tab ───────────────────────────────── */}
      {tab === "consents" && (
        <div>
          {consentList.length === 0 && !showConsentForm && (
            <p className="text-sm text-slate-500 mb-3">
              Zatím žádné souhlasy.
            </p>
          )}

          <ul className="space-y-2 mb-4">
            {consentList.map((row) => {
              const isActive = !row.revokedAt;
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between text-sm border-b border-slate-100 pb-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-800 font-medium truncate">
                      {row.purposeName}
                    </span>
                    <span
                      className={`shrink-0 inline-block rounded-lg px-2.5 py-0.5 text-xs font-medium ${
                        isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {isActive ? "Aktivní" : "Odvolán"}
                    </span>
                    <span className="text-slate-500 shrink-0">
                      {new Date(row.grantedAt).toLocaleDateString("cs-CZ")}
                    </span>
                    {row.revokedAt && (
                      <span className="text-slate-500 shrink-0">
                        →{" "}
                        {new Date(row.revokedAt).toLocaleDateString("cs-CZ")}
                      </span>
                    )}
                  </div>
                  {isActive && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(row.id)}
                      className="shrink-0 ml-2 text-red-600 font-medium text-sm hover:text-red-800"
                    >
                      Odvolat
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {showConsentForm ? (
            <form
              onSubmit={handleGrantConsent}
              className="space-y-2 max-w-md"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  Účel zpracování
                </label>
                <CustomDropdown
                  value={consentForm.purposeId}
                  onChange={(id) =>
                    setConsentForm((f) => ({
                      ...f,
                      purposeId: id,
                    }))
                  }
                  options={[{ id: "", label: "— vyberte —" }, ...purposes.map((p) => ({ id: p.id, label: p.name }))]}
                  placeholder="— vyberte —"
                  icon={FileCheck}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  Zdroj
                </label>
                <input
                  type="text"
                  value={consentForm.source}
                  onChange={(e) =>
                    setConsentForm((f) => ({ ...f, source: e.target.value }))
                  }
                  placeholder="např. e-mail, formulář"
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={consentSubmitting}
                  className="rounded px-3 py-1.5 text-sm font-semibold text-white bg-[var(--wp-accent)] disabled:opacity-50"
                >
                  {consentSubmitting ? "Ukládám…" : "Udělit souhlas"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConsentForm(false)}
                  className="rounded px-3 py-1.5 text-sm font-semibold border border-slate-200 text-slate-800 hover:bg-slate-50"
                >
                  Zrušit
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowConsentForm(true)}
              className="rounded-lg px-3 py-2 text-sm font-semibold border border-slate-200 text-slate-800 hover:bg-slate-50"
            >
              + Udělit souhlas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
