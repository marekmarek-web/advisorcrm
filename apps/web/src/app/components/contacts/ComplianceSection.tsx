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
      <p className="text-monday-text-muted text-sm">
        Načítám compliance data…
      </p>
    );

  return (
    <div className="rounded-xl border border-monday-border bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-monday-text mb-3 text-sm">
        Compliance
      </h2>

      {/* ── Tab bar ────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 border-b border-monday-border">
        <button
          type="button"
          onClick={() => setTab("aml")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            tab === "aml"
              ? "border-monday-blue text-monday-blue"
              : "border-transparent text-monday-text-muted hover:text-monday-text"
          }`}
        >
          AML
        </button>
        <button
          type="button"
          onClick={() => setTab("consents")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            tab === "consents"
              ? "border-monday-blue text-monday-blue"
              : "border-transparent text-monday-text-muted hover:text-monday-text"
          }`}
        >
          Souhlasy
        </button>
      </div>

      {/* ── AML Tab ────────────────────────────────────── */}
      {tab === "aml" && (
        <div>
          {amlList.length === 0 && !showAmlForm && (
            <p className="text-sm text-monday-text-muted mb-3">
              Zatím žádné AML kontroly.
            </p>
          )}

          <ul className="space-y-2 mb-4">
            {amlList.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 text-sm border-b border-monday-border/50 pb-2"
              >
                <span className="text-monday-text">
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
                  <span className="text-monday-text-muted truncate max-w-xs">
                    {row.notes}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {showAmlForm ? (
            <form onSubmit={handleAmlSubmit} className="space-y-2 max-w-md">
              <div>
                <label className="block text-xs font-medium text-monday-text-muted">
                  Datum kontroly
                </label>
                <input
                  type="date"
                  value={amlForm.checkDate}
                  onChange={(e) =>
                    setAmlForm((f) => ({ ...f, checkDate: e.target.value }))
                  }
                  required
                  className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-monday-text-muted">
                  Úroveň rizika
                </label>
                <select
                  value={amlForm.riskLevel}
                  onChange={(e) =>
                    setAmlForm((f) => ({ ...f, riskLevel: e.target.value }))
                  }
                  className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-monday-text-muted">
                  Poznámky
                </label>
                <textarea
                  value={amlForm.notes}
                  onChange={(e) =>
                    setAmlForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={3}
                  className="w-full rounded border border-monday-border px-2 py-1.5 text-sm resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={amlSubmitting}
                  className="rounded px-3 py-1.5 text-sm font-semibold text-white bg-monday-blue disabled:opacity-50"
                >
                  {amlSubmitting ? "Ukládám…" : "Uložit"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAmlForm(false)}
                  className="rounded px-3 py-1.5 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover"
                >
                  Zrušit
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAmlForm(true)}
              className="rounded-lg px-3 py-2 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover"
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
            <p className="text-sm text-monday-text-muted mb-3">
              Zatím žádné souhlasy.
            </p>
          )}

          <ul className="space-y-2 mb-4">
            {consentList.map((row) => {
              const isActive = !row.revokedAt;
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between text-sm border-b border-monday-border/50 pb-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-monday-text font-medium truncate">
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
                    <span className="text-monday-text-muted shrink-0">
                      {new Date(row.grantedAt).toLocaleDateString("cs-CZ")}
                    </span>
                    {row.revokedAt && (
                      <span className="text-monday-text-muted shrink-0">
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
                <label className="block text-xs font-medium text-monday-text-muted">
                  Účel zpracování
                </label>
                <select
                  value={consentForm.purposeId}
                  onChange={(e) =>
                    setConsentForm((f) => ({
                      ...f,
                      purposeId: e.target.value,
                    }))
                  }
                  required
                  className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
                >
                  <option value="">— vyberte —</option>
                  {purposes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-monday-text-muted">
                  Zdroj
                </label>
                <input
                  type="text"
                  value={consentForm.source}
                  onChange={(e) =>
                    setConsentForm((f) => ({ ...f, source: e.target.value }))
                  }
                  placeholder="např. e-mail, formulář"
                  className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={consentSubmitting}
                  className="rounded px-3 py-1.5 text-sm font-semibold text-white bg-monday-blue disabled:opacity-50"
                >
                  {consentSubmitting ? "Ukládám…" : "Udělit souhlas"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConsentForm(false)}
                  className="rounded px-3 py-1.5 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover"
                >
                  Zrušit
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowConsentForm(true)}
              className="rounded-lg px-3 py-2 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover"
            >
              + Udělit souhlas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
