"use client";

import type {
  CompanyFaPayload,
  CompanyFaCompany,
  CompanyFaDirector,
  CompanyFaFinance,
  CompanyFaBenefits,
  CompanyFaRisks,
  CompanyFaDirectorIns,
  CompanyFaStrategy,
  CompanyFaInvestmentItem,
  DirectorBenefits,
  RiskDetail,
} from "@/lib/analyses/company-fa/types";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";

const INDUSTRIES = [
  "office",
  "services",
  "light-manufacturing",
  "heavy-manufacturing",
  "construction",
  "transport",
] as const;

function defaultDirectorBenefits(): DirectorBenefits {
  return { dps: false, dip: false, izp: false, amountMonthly: 0 };
}

function defaultDirector(overrides: Partial<CompanyFaDirector> = {}): CompanyFaDirector {
  return {
    name: "",
    age: null,
    share: 100,
    hasSpouse: false,
    childrenCount: 0,
    incomeType: "employee",
    netIncome: 0,
    savings: 0,
    goal: "tax",
    benefits: defaultDirectorBenefits(),
    paysFromOwn: false,
    paysFromOwnAmount: 0,
    hasOldPension: false,
    ...overrides,
  };
}

function defaultRiskDetail(has = false): RiskDetail {
  return { has, limit: 0, contractYears: 0 };
}

export interface CompanyAnalysisShellProps {
  payload: CompanyFaPayload;
  onPayloadChange: (next: CompanyFaPayload) => void;
  analysisId: string | null;
  onSave: () => Promise<void>;
  saving?: boolean;
  saveError?: string | null;
}

export function CompanyAnalysisShell({
  payload,
  onPayloadChange,
  analysisId,
  onSave,
  saving = false,
  saveError = null,
}: CompanyAnalysisShellProps) {
  const setCompany = (partial: Partial<CompanyFaCompany>) => {
    onPayloadChange({ ...payload, company: { ...payload.company, ...partial } });
  };
  const setFinance = (partial: Partial<CompanyFaFinance>) => {
    onPayloadChange({ ...payload, finance: { ...payload.finance, ...partial } });
  };
  const setBenefits = (partial: Partial<CompanyFaBenefits>) => {
    onPayloadChange({ ...payload, benefits: { ...payload.benefits, ...partial } });
  };
  const setRisks = (partial: Partial<CompanyFaRisks>) => {
    onPayloadChange({ ...payload, risks: { ...payload.risks, ...partial } });
  };
  const setDirectorIns = (partial: Partial<CompanyFaDirectorIns>) => {
    onPayloadChange({ ...payload, directorIns: { ...payload.directorIns, ...partial } });
  };
  const setStrategy = (partial: Partial<CompanyFaStrategy>) => {
    onPayloadChange({ ...payload, strategy: { ...payload.strategy, ...partial } });
  };
  const setDirector = (index: number, partial: Partial<CompanyFaDirector>) => {
    const next = [...payload.directors];
    next[index] = { ...next[index], ...partial };
    onPayloadChange({ ...payload, directors: next });
  };
  const addDirector = () => {
    onPayloadChange({ ...payload, directors: [...payload.directors, defaultDirector()] });
  };
  const removeDirector = (index: number) => {
    const next = payload.directors.filter((_, i) => i !== index);
    onPayloadChange({ ...payload, directors: next });
  };
  const setInvestment = (index: number, partial: Partial<CompanyFaInvestmentItem>) => {
    const next = [...payload.investments];
    next[index] = { ...next[index], ...partial };
    onPayloadChange({ ...payload, investments: next });
  };

  const num = (v: unknown, def: number) =>
    typeof v === "number" && !Number.isNaN(v) ? v : typeof v === "string" ? parseInt(v, 10) || def : def;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-[color:var(--wp-text)]">
          {payload.company?.name || "Firemní analýza"}
        </h2>
        <div className="flex items-center gap-3">
          {saveError && (
            <span className="text-sm text-red-600">{saveError}</span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-h-[44px] px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Ukládám…" : analysisId ? "Uložit do Aidvisory" : "Uložit do Aidvisory (vytvořit analýzu)"}
          </button>
        </div>
      </div>

      {/* Company */}
      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Firma</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="sm:col-span-2">
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Název</span>
            <input
              type="text"
              value={payload.company?.name ?? ""}
              onChange={(e) => setCompany({ name: e.target.value })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">IČO</span>
            <input
              type="text"
              value={payload.company?.ico ?? ""}
              onChange={(e) => setCompany({ ico: e.target.value })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Obor</span>
            <CustomDropdown
              value={payload.company?.industry ?? ""}
              onChange={(id) => setCompany({ industry: id })}
              placeholder="Obor"
              options={[
                { id: "", label: "— Vyberte obor —" },
                ...INDUSTRIES.map((ind) => ({ id: ind, label: ind })),
              ]}
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Zaměstnanci</span>
            <input
              type="number"
              min={0}
              value={payload.company?.employees ?? 0}
              onChange={(e) => setCompany({ employees: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Průměrná mzda (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.company?.avgWage ?? 0}
              onChange={(e) => setCompany({ avgWage: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">3. kategorie</span>
            <input
              type="number"
              min={0}
              value={payload.company?.cat3 ?? 0}
              onChange={(e) => setCompany({ cat3: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">TOP klient (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={payload.company?.topClient ?? 0}
              onChange={(e) => setCompany({ topClient: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
        </div>
      </section>

      {/* Directors */}
      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-[color:var(--wp-text)]">Jednatelé</h3>
          <button
            type="button"
            onClick={addDirector}
            className="min-h-[44px] px-4 py-2 bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] font-medium rounded-lg hover:bg-[color:var(--wp-surface-card-border)]"
          >
            Přidat jednatele
          </button>
        </div>
        <div className="space-y-4">
          {payload.directors?.map((d, i) => (
            <div key={i} className="p-4 border border-[color:var(--wp-surface-card-border)] rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-medium text-[color:var(--wp-text-secondary)]">Jednatel {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeDirector(i)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Odebrat
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label>
                  <span className="block text-sm text-[color:var(--wp-text-secondary)] mb-1">Jméno</span>
                  <input
                    type="text"
                    value={d.name ?? ""}
                    onChange={(e) => setDirector(i, { name: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
                  />
                </label>
                <label>
                  <span className="block text-sm text-[color:var(--wp-text-secondary)] mb-1">Věk</span>
                  <input
                    type="number"
                    min={0}
                    value={d.age ?? ""}
                    onChange={(e) => setDirector(i, { age: e.target.value === "" ? null : num(e.target.value, 0) })}
                    className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
                  />
                </label>
                <label>
                  <span className="block text-sm text-[color:var(--wp-text-secondary)] mb-1">Podíl (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={d.share ?? 100}
                    onChange={(e) => setDirector(i, { share: num(e.target.value, 100) })}
                    className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
                  />
                </label>
                <label>
                  <span className="block text-sm text-[color:var(--wp-text-secondary)] mb-1">Čistý měsíční příjem (Kč)</span>
                  <input
                    type="number"
                    min={0}
                    value={d.netIncome ?? 0}
                    onChange={(e) => setDirector(i, { netIncome: num(e.target.value, 0) })}
                    className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
                  />
                </label>
                <label className="sm:col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.hasSpouse ?? false}
                    onChange={(e) => setDirector(i, { hasSpouse: e.target.checked })}
                    className="rounded border-[color:var(--wp-border-strong)]"
                  />
                  <span className="text-sm text-[color:var(--wp-text-secondary)]">Manžel/ka</span>
                </label>
                <label>
                  <span className="block text-sm text-[color:var(--wp-text-secondary)] mb-1">Počet dětí</span>
                  <input
                    type="number"
                    min={0}
                    value={d.childrenCount ?? 0}
                    onChange={(e) => setDirector(i, { childrenCount: num(e.target.value, 0) })}
                    className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
                  />
                </label>
                <label className="block w-full">
                  <span className="block text-sm text-[color:var(--wp-text-secondary)] mb-1">Typ příjmu</span>
                  <CustomDropdown
                    value={d.incomeType ?? "employee"}
                    onChange={(id) => setDirector(i, { incomeType: id as "employee" | "osvc" })}
                    options={[
                      { id: "employee", label: "Zaměstnanec" },
                      { id: "osvc", label: "OSVČ" },
                    ]}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Finance */}
      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Finance</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Roční tržby (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.finance?.revenue ?? 0}
              onChange={(e) => setFinance({ revenue: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Roční zisk / EBITDA (Kč)</span>
            <input
              type="number"
              value={payload.finance?.profit ?? 0}
              onChange={(e) => setFinance({ profit: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Rezerva (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.finance?.reserve ?? 0}
              onChange={(e) => setFinance({ reserve: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Měsíční splátka úvěrů (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.finance?.loanPayment ?? 0}
              onChange={(e) => setFinance({ loanPayment: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
        </div>
      </section>

      {/* Benefits */}
      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Benefity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={payload.benefits?.dps ?? false}
              onChange={(e) => setBenefits({ dps: e.target.checked })}
              className="rounded border-[color:var(--wp-border-strong)]"
            />
            <span className="text-sm text-[color:var(--wp-text-secondary)]">DPS</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={payload.benefits?.dip ?? false}
              onChange={(e) => setBenefits({ dip: e.target.checked })}
              className="rounded border-[color:var(--wp-border-strong)]"
            />
            <span className="text-sm text-[color:var(--wp-text-secondary)]">DIP</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={payload.benefits?.izp ?? false}
              onChange={(e) => setBenefits({ izp: e.target.checked })}
              className="rounded border-[color:var(--wp-border-strong)]"
            />
            <span className="text-sm text-[color:var(--wp-text-secondary)]">IŽP</span>
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Příspěvek na osobu/měs (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.benefits?.amount ?? 0}
              onChange={(e) => setBenefits({ amount: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Počet zaměstnanců (benefity)</span>
            <input
              type="number"
              min={0}
              value={payload.benefits?.count ?? 0}
              onChange={(e) => setBenefits({ count: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Jednatelé celkem/měs (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.benefits?.directorsAmount ?? 0}
              onChange={(e) => setBenefits({ directorsAmount: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
        </div>
      </section>

      {/* Risks */}
      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Pojištění firmy</h3>
        <div className="space-y-3">
          {(["property", "interruption", "liability"] as const).map((key) => (
            <div key={key} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={payload.risks?.[key]?.has ?? false}
                  onChange={(e) =>
                    setRisks({
                      [key]: { ...(payload.risks?.[key] ?? defaultRiskDetail()), has: e.target.checked },
                    })
                  }
                  className="rounded border-[color:var(--wp-border-strong)]"
                />
                <span className="text-sm text-[color:var(--wp-text-secondary)] capitalize">{key}</span>
              </label>
              <input
                type="number"
                min={0}
                placeholder="Limit"
                value={payload.risks?.[key]?.limit ?? 0}
                onChange={(e) =>
                  setRisks({
                    [key]: {
                      ...(payload.risks?.[key] ?? defaultRiskDetail(true)),
                      limit: num(e.target.value, 0),
                    },
                  })
                }
                className="w-28 rounded-lg border border-[color:var(--wp-border-strong)] px-2 py-1 text-[color:var(--wp-text)] text-sm"
              />
              <input
                type="number"
                min={0}
                placeholder="Roky smlouvy"
                value={payload.risks?.[key]?.contractYears ?? 0}
                onChange={(e) =>
                  setRisks({
                    [key]: {
                      ...(payload.risks?.[key] ?? defaultRiskDetail(true)),
                      contractYears: num(e.target.value, 0),
                    },
                  })
                }
                className="w-28 rounded-lg border border-[color:var(--wp-border-strong)] px-2 py-1 text-[color:var(--wp-text)] text-sm"
              />
            </div>
          ))}
          {(["director", "fleet", "cyber"] as const).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={payload.risks?.[key] ?? false}
                onChange={(e) => setRisks({ [key]: e.target.checked })}
                className="rounded border-[color:var(--wp-border-strong)]"
              />
              <span className="text-sm text-[color:var(--wp-text-secondary)] capitalize">{key}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Director insurance */}
      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Pojištění jednatele</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Smrt (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.directorIns?.death ?? 0}
              onChange={(e) => setDirectorIns({ death: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Invalidita (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.directorIns?.invalidity ?? 0}
              onChange={(e) => setDirectorIns({ invalidity: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">PN/den (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.directorIns?.sick ?? 0}
              onChange={(e) => setDirectorIns({ sick: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label className="block w-full">
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Stupeň invalidity (1–3)</span>
            <CustomDropdown
              value={String(payload.directorIns?.invalidityDegree ?? 1)}
              onChange={(id) => setDirectorIns({ invalidityDegree: Number(id) as 1 | 2 | 3 })}
              options={[
                { id: "1", label: "1" },
                { id: "2", label: "2" },
                { id: "3", label: "3" },
              ]}
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Státní invalidní důchod/měs (Kč)</span>
            <input
              type="number"
              min={0}
              value={payload.directorIns?.statePensionMonthly ?? 0}
              onChange={(e) => setDirectorIns({ statePensionMonthly: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
        </div>
      </section>

      {/* Strategy */}
      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Investiční strategie</h3>
        <div className="flex flex-wrap gap-4">
          <label className="block w-full min-w-[200px]">
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Profil</span>
            <CustomDropdown
              value={payload.strategy?.profile ?? "balanced"}
              onChange={(id) => setStrategy({ profile: id as CompanyFaStrategy["profile"] })}
              options={[
                { id: "conservative", label: "Konzervativní" },
                { id: "balanced", label: "Vyvážený" },
                { id: "dynamic", label: "Dynamický" },
              ]}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              checked={payload.strategy?.conservativeMode ?? false}
              onChange={(e) => setStrategy({ conservativeMode: e.target.checked })}
              className="rounded border-[color:var(--wp-border-strong)]"
            />
            <span className="text-sm text-[color:var(--wp-text-secondary)]">Konzervativní režim</span>
          </label>
        </div>
      </section>

      {/* Investments list */}
      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Investice</h3>
        <div className="space-y-3 overflow-x-auto">
          {payload.investments?.map((inv, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end text-sm">
              <span className="font-medium text-[color:var(--wp-text-secondary)] truncate">{inv.productKey}</span>
              <label className="block min-w-0">
                <span className="block text-xs text-[color:var(--wp-text-secondary)]">Typ</span>
                <CustomDropdown
                  value={inv.type}
                  onChange={(id) => setInvestment(i, { type: id as "lump" | "monthly" | "pension" })}
                  options={[
                    { id: "lump", label: "Jednorázově" },
                    { id: "monthly", label: "Pravidelně" },
                    { id: "pension", label: "Penzijní" },
                  ]}
                />
              </label>
              <label>
                <span className="block text-xs text-[color:var(--wp-text-secondary)]">Částka (Kč)</span>
                <input
                  type="number"
                  min={0}
                  value={inv.amount ?? 0}
                  onChange={(e) => setInvestment(i, { amount: num(e.target.value, 0) })}
                  className="w-full rounded border border-[color:var(--wp-border-strong)] px-2 py-1 text-[color:var(--wp-text)]"
                />
              </label>
              <label>
                <span className="block text-xs text-[color:var(--wp-text-secondary)]">Roky</span>
                <input
                  type="number"
                  min={0}
                  value={inv.years ?? 0}
                  onChange={(e) => setInvestment(i, { years: num(e.target.value, 0) })}
                  className="w-full rounded border border-[color:var(--wp-border-strong)] px-2 py-1 text-[color:var(--wp-text)]"
                />
              </label>
              <label>
                <span className="block text-xs text-[color:var(--wp-text-secondary)]">Výnos %</span>
                <input
                  type="number"
                  step={0.01}
                  value={inv.annualRate ?? 0}
                  onChange={(e) => setInvestment(i, { annualRate: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded border border-[color:var(--wp-border-strong)] px-2 py-1 text-[color:var(--wp-text)]"
                />
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
