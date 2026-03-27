"use client";

import { useState } from "react";
import Link from "next/link";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { saveFinancialAnalysisDraft } from "@/app/actions/financial-analyses";
import { createContact } from "@/app/actions/contacts";
import { mapFaClientToContactForm, splitFullName } from "../faClientMapper";
import { User, PlusCircle, UserPlus, ExternalLink, CheckCircle, Users } from "lucide-react";
import { FaSyncDialog } from "../FaSyncDialog";

function ageFromBirthYear(birthDate: string): number | null {
  if (!birthDate?.trim()) return null;
  const yearOnly = birthDate.match(/^\d{4}$/);
  if (yearOnly) return new Date().getFullYear() - parseInt(yearOnly[0], 10);
  const m = birthDate.match(/(\d{4})-(\d{2})-(\d{2})/) || birthDate.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const year = m[3] ? parseInt(m[3], 10) : parseInt(m[1], 10);
  return new Date().getFullYear() - year;
}

/** Z řetězce číslic sestaví d.m.yyyy (den 1-31, měsíc 1-12, rok 1-4 číslice). Čistý rok 1900–2100 ponechá. */
function formatBirthDateFromDigits(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length <= 2) return d;
  if (d.length === 3) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length === 4) {
    const y = parseInt(d, 10);
    if (y >= 1900 && y <= 2100) return d;
    return `${d.slice(0, 2)}.${d.slice(2, 3)}.${d.slice(3)}`;
  }
  const day2 = d.length >= 2 ? parseInt(d.slice(0, 2), 10) : 0;
  const dayLen = day2 >= 1 && day2 <= 31 ? 2 : 1;
  const day = d.slice(0, dayLen);
  let i = dayLen;
  if (i >= d.length) return `${parseInt(day, 10)}`;
  const month2 = d.length >= i + 2 ? parseInt(d.slice(i, i + 2), 10) : 0;
  const monthLen = month2 >= 1 && month2 <= 12 ? 2 : 1;
  const month = d.slice(i, i + monthLen);
  i += monthLen;
  const year = d.slice(i);
  if (!year) return `${parseInt(day, 10)}.${parseInt(month, 10)}`;
  return `${parseInt(day, 10)}.${parseInt(month, 10)}.${year}`;
}

function handleBirthDateChange(
  raw: string,
  setValue: (formatted: string) => void
): string {
  const digits = raw.replace(/\D/g, "");
  const formatted = formatBirthDateFromDigits(digits);
  setValue(formatted);
  return formatted;
}

export function StepClientInfo() {
  const data = useFinancialAnalysisStore((s) => s.data);
  const setClient = useFinancialAnalysisStore((s) => s.setClient);
  const setData = useFinancialAnalysisStore((s) => s.setData);
  const setPartner = useFinancialAnalysisStore((s) => s.setPartner);
  const addChild = useFinancialAnalysisStore((s) => s.addChild);
  const updateChild = useFinancialAnalysisStore((s) => s.updateChild);
  const removeChild = useFinancialAnalysisStore((s) => s.removeChild);
  const analysisId = useFinancialAnalysisStore((s) => s.analysisId);
  const currentStep = useFinancialAnalysisStore((s) => s.currentStep);
  const saveToStorage = useFinancialAnalysisStore((s) => s.saveToStorage);

  const [creatingClient, setCreatingClient] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);

  const client = data.client;
  const partner = data.partner;
  const children = data.children;
  const includeCompany = data.includeCompany ?? false;
  const age = ageFromBirthYear(client.birthDate);
  const partnerAge = ageFromBirthYear(partner.birthDate);
  const clientId = data.clientId;

  const handleCreateClient = async () => {
    setCreateError(null);
    const { firstName, lastName } = splitFullName(client.name);
    if (!firstName && !lastName) {
      setCreateError("Doplňte jméno klienta.");
      return;
    }
    if (!lastName) {
      setCreateError('Doplňte jméno ve tvaru „Jméno Příjmení".');
      return;
    }
    setCreatingClient(true);
    try {
      const form = mapFaClientToContactForm(client);
      const newId = await createContact(form);
      if (!newId) throw new Error("Nepodařilo se vytvořit kontakt.");
      setData({ clientId: newId });
      saveToStorage();
      if (analysisId) {
        await saveFinancialAnalysisDraft({
          id: analysisId,
          contactId: newId,
          payload: { data: { ...data, clientId: newId } as unknown as Record<string, unknown>, currentStep },
        });
      }
      setJustCreated(true);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Nepodařilo se vytvořit kontakt.");
    } finally {
      setCreatingClient(false);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-[color:var(--wp-text)]">Osobní údaje</h2>
          <p className="text-[color:var(--wp-text-secondary)] mt-1">Základní údaje pro výpočet finančního plánu.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 dark:bg-blue-950/45 dark:text-blue-100">
          <User className="w-4 h-4" />
          Klient & Rodina
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
          <h3 className="text-lg font-bold text-[color:var(--wp-text)] border-b border-[color:var(--wp-surface-card-border)] pb-2 mb-4">Hlavní klient</h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Jméno a příjmení</label>
              <input
                type="text"
                value={client.name}
                onChange={(e) => setClient({ name: e.target.value })}
                className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Datum narození</label>
              <input
                type="text"
                inputMode="numeric"
                value={client.birthDate || ""}
                onChange={(e) => handleBirthDateChange(e.target.value, (v) => setClient({ birthDate: v }))}
                placeholder="dd.mm.rrrr"
                className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Věk</label>
              <div className="w-full rounded-xl bg-[color:var(--wp-surface-muted)] px-2 py-3 text-center text-sm font-bold text-blue-800 dark:text-blue-200">
                {age != null ? `${age} let` : "—"}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Rodné číslo <span className="text-[color:var(--wp-text-tertiary)] font-normal">(volitelné)</span></label>
              <input
                type="text"
                value={client.birthNumber ?? ""}
                onChange={(e) => setClient({ birthNumber: e.target.value })}
                placeholder="Rodné číslo"
                className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Email <span className="text-[color:var(--wp-text-tertiary)] font-normal">(volitelné)</span></label>
              <input
                type="email"
                value={client.email}
                onChange={(e) => setClient({ email: e.target.value })}
                className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Telefon <span className="text-[color:var(--wp-text-tertiary)] font-normal">(volitelné)</span></label>
              <input
                type="tel"
                value={client.phone}
                onChange={(e) => setClient({ phone: e.target.value })}
                className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Povolání <span className="text-[color:var(--wp-text-tertiary)] font-normal">(volitelné)</span></label>
              <input
                type="text"
                value={client.occupation}
                onChange={(e) => setClient({ occupation: e.target.value })}
                className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Sporty <span className="text-[color:var(--wp-text-tertiary)] font-normal">(volitelné)</span></label>
              <input
                type="text"
                value={client.sports}
                onChange={(e) => setClient({ sports: e.target.value })}
                className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        </div>

        {clientId ? (
          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5 sm:mt-0" />
            <span className="text-sm text-emerald-800 font-semibold">Klient je propojen s CRM</span>
            <Link
              href={`/portal/contacts/${clientId}`}
              className="text-sm text-indigo-600 hover:text-indigo-800 underline flex items-center gap-1"
            >
              Otevřít profil <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={creatingClient}
              onClick={handleCreateClient}
              className="min-h-[44px] px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              {creatingClient ? "Vytvářím…" : "Přidat klienta do CRM"}
            </button>
            {justCreated && (
              <span className="text-sm text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Klient vytvořen
              </span>
            )}
            {createError && (
              <span className="text-sm text-red-600">{createError}</span>
            )}
          </div>
        )}

        {analysisId && (client.hasPartner || (children?.length ?? 0) > 0) && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowSyncDialog(true)}
              className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[color:var(--wp-button-bg)] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[color:var(--wp-primary-hover)]"
            >
              <Users className="w-4 h-4" />
              Synchronizovat celou rodinu do CRM
            </button>
            <p className="text-xs text-[color:var(--wp-text-secondary)]">Vytvoří kontakty pro partnera, děti a domácnost.</p>
          </div>
        )}

        {showSyncDialog && analysisId && (
          <FaSyncDialog
            analysisId={analysisId}
            onClose={() => setShowSyncDialog(false)}
            onDone={() => {
              setShowSyncDialog(false);
              setJustCreated(true);
            }}
          />
        )}

        <div className="bg-[color:var(--wp-surface-card)] p-4 rounded-xl border border-[color:var(--wp-surface-card-border)] flex items-center gap-3">
          <input
            type="checkbox"
            id="has-partner"
            checked={client.hasPartner}
            onChange={(e) => setClient({ hasPartner: e.target.checked })}
            className="w-5 h-5 text-indigo-500 rounded border-[color:var(--wp-border-strong)] focus:ring-indigo-400"
          />
          <label htmlFor="has-partner" className="text-[color:var(--wp-text-secondary)] font-bold cursor-pointer select-none">Přidat partnera / partnerku</label>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/30 dark:bg-amber-950/40">
          <input
            type="checkbox"
            id="include-company"
            checked={includeCompany}
            onChange={(e) => setData({ includeCompany: e.target.checked })}
            className="min-w-[20px] w-5 h-5 text-indigo-500 rounded border-[color:var(--wp-border-strong)] focus:ring-indigo-400"
          />
          <label htmlFor="include-company" className="text-[color:var(--wp-text-secondary)] font-bold cursor-pointer select-none">
            Tato analýza zahrnuje i firmu (s.r.o.)
          </label>
        </div>

        {client.hasPartner && (
          <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-indigo-800 dark:text-indigo-200">Partner</h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Jméno partnera</label>
                <input
                  type="text"
                  value={partner.name}
                  onChange={(e) => setPartner({ name: e.target.value })}
                  className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Datum narození</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={partner.birthDate || ""}
                  onChange={(e) => handleBirthDateChange(e.target.value, (v) => setPartner({ birthDate: v }))}
                  placeholder="dd.mm.rrrr"
                  className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Věk</label>
                <div className="w-full rounded-xl bg-[color:var(--wp-surface-muted)] px-2 py-3 text-center text-sm font-bold text-blue-800 dark:text-blue-200">
                  {partnerAge != null ? `${partnerAge} let` : "—"}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Rodné číslo <span className="text-[color:var(--wp-text-tertiary)] font-normal">(volitelné)</span></label>
                <input
                  type="text"
                  value={partner.birthNumber ?? ""}
                  onChange={(e) => setPartner({ birthNumber: e.target.value })}
                  placeholder="Rodné číslo"
                  className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Email <span className="text-[color:var(--wp-text-tertiary)] font-normal">(volitelné)</span></label>
                <input
                  type="email"
                  value={partner.email ?? ""}
                  onChange={(e) => setPartner({ email: e.target.value })}
                  className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Telefon <span className="text-[color:var(--wp-text-tertiary)] font-normal">(volitelné)</span></label>
                <input
                  type="tel"
                  value={partner.phone ?? ""}
                  onChange={(e) => setPartner({ phone: e.target.value })}
                  className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Povolání partnera</label>
                <input
                  type="text"
                  value={partner.occupation ?? ""}
                  onChange={(e) => setPartner({ occupation: e.target.value })}
                  className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Sporty</label>
                <input
                  type="text"
                  value={partner.sports ?? ""}
                  onChange={(e) => setPartner({ sports: e.target.value })}
                  className="w-full px-4 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>
          </div>
        )}

        <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h3 className="text-lg font-bold text-[color:var(--wp-text)]">Děti</h3>
            <button
              type="button"
              onClick={() => addChild()}
              className="flex min-h-[44px] items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-600 transition-colors hover:text-indigo-800 dark:border-indigo-500/35 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:text-indigo-100"
            >
              <PlusCircle className="w-4 h-4" />
              Přidat dítě
            </button>
          </div>
          <div className="space-y-3">
            {children.length === 0 ? (
              <div className="text-center py-6 text-[color:var(--wp-text-tertiary)] bg-[color:var(--wp-surface-card)] rounded-xl border border-dashed border-[color:var(--wp-surface-card-border)] text-sm italic">
                Žádné děti zatím nepřidány.
              </div>
            ) : (
              children.map((child) => (
                <div key={child.id} className="bg-[color:var(--wp-surface-card)] p-4 rounded-xl border border-[color:var(--wp-surface-card-border)] flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <input
                    type="text"
                    value={child.name}
                    onChange={(e) => updateChild(child.id, "name", e.target.value)}
                    placeholder="Jméno"
                    className="flex-1 px-3 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={child.birthDate || ""}
                    onChange={(e) => handleBirthDateChange(e.target.value, (v) => updateChild(child.id, "birthDate", v))}
                    placeholder="Datum narození"
                    className="w-28 min-w-[100px] px-3 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg"
                  />
                  <div className="text-sm text-[color:var(--wp-text-secondary)] flex items-center min-w-[60px]">
                    {ageFromBirthYear(child.birthDate) != null ? `${ageFromBirthYear(child.birthDate)} let` : ""}
                  </div>
                  <input
                    type="text"
                    value={child.birthNumber ?? ""}
                    onChange={(e) => updateChild(child.id, "birthNumber", e.target.value)}
                    placeholder="Rodné číslo"
                    className="w-28 min-w-[100px] px-3 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg"
                  />
                  <input
                    type="text"
                    value={child.sports ?? ""}
                    onChange={(e) => updateChild(child.id, "sports", e.target.value)}
                    placeholder="Sporty"
                    className="flex-1 min-w-0 px-3 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeChild(child.id)}
                    className="min-h-[44px] rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                  >
                    Odebrat
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
