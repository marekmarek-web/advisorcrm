"use client";

import type { CompanyFaStrategy } from "@/lib/analyses/company-fa/types";
import { useCompanyFaStore } from "@/lib/analyses/company-fa/store";
import {
  benefitCalc,
  riskScore,
  getRiskAuditTips,
  directorInsuranceRec,
  recalcStrategy,
} from "@/lib/analyses/company-fa/calculations";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";

function num(v: unknown, def: number): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") return parseInt(v, 10) || def;
  return def;
}

function defaultRiskDetail(has = false) {
  return { has, limit: 0, contractYears: 0 };
}

function fmt(n: number): string {
  return n.toLocaleString("cs-CZ");
}

export function StepCompanyBenefitsRisks() {
  const payload = useCompanyFaStore((s) => s.payload);
  const setBenefits = useCompanyFaStore((s) => s.setBenefits);
  const setRisks = useCompanyFaStore((s) => s.setRisks);
  const setDirectorIns = useCompanyFaStore((s) => s.setDirectorIns);
  const setStrategy = useCompanyFaStore((s) => s.setStrategy);
  const setInvestment = useCompanyFaStore((s) => s.setInvestment);
  const benefits = payload.benefits ?? {};
  const risks = payload.risks ?? {};
  const directorIns = payload.directorIns ?? {};
  const strategy = payload.strategy ?? {};
  const benefitSummary = benefitCalc(payload);
  const riskSummary = riskScore(payload);
  const auditTips = getRiskAuditTips(payload);
  const insRec = directorInsuranceRec(payload);
  const { investments: investmentsWithFv, totalFV, totalLump, totalMonthly } = recalcStrategy(payload);

  return (
    <div className="space-y-6">
      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Benefity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 min-h-[44px]">
            <input
              type="checkbox"
              checked={benefits.dps ?? false}
              onChange={(e) => setBenefits({ dps: e.target.checked })}
              className="rounded border-[color:var(--wp-border-strong)]"
            />
            <span className="text-sm text-[color:var(--wp-text-secondary)]">DPS</span>
          </label>
          <label className="flex items-center gap-2 min-h-[44px]">
            <input
              type="checkbox"
              checked={benefits.dip ?? false}
              onChange={(e) => setBenefits({ dip: e.target.checked })}
              className="rounded border-[color:var(--wp-border-strong)]"
            />
            <span className="text-sm text-[color:var(--wp-text-secondary)]">DIP</span>
          </label>
          <label className="flex items-center gap-2 min-h-[44px]">
            <input
              type="checkbox"
              checked={benefits.izp ?? false}
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
              value={benefits.amount ?? 0}
              onChange={(e) => setBenefits({ amount: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Počet zaměstnanců (benefity)</span>
            <input
              type="number"
              min={0}
              value={benefits.count ?? 0}
              onChange={(e) => setBenefits({ count: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Jednatelé celkem/měs (Kč)</span>
            <input
              type="number"
              min={0}
              value={benefits.directorsAmount ?? 0}
              onChange={(e) => setBenefits({ directorsAmount: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
        </div>
        <div className="mt-4 p-3 bg-[color:var(--wp-surface-muted)] rounded-lg border border-[color:var(--wp-surface-card-border)] space-y-1 text-sm text-[color:var(--wp-text-secondary)]">
          <p><strong>Roční náklad (benefity zaměstnancům):</strong> {fmt(benefitSummary.yearlyCost)} Kč</p>
          <p><strong>Úspora oproti mzdě (hrubá ekv.):</strong> {fmt(benefitSummary.savings)} Kč/rok</p>
          <p><strong>Roční náklad jednatelé:</strong> {fmt(benefitSummary.directorsYearly)} Kč</p>
          <p><strong>Daňová úspora majitelů (21 %):</strong> {fmt(benefitSummary.taxSavingsOwners)} Kč/rok</p>
          {benefitSummary.totalFromOwn > 0 && (
            <p><strong>Převod ze svého → úspora celkem:</strong> cca {fmt(Math.round(benefitSummary.totalTransferSavings))} Kč/rok</p>
          )}
        </div>
      </section>

      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Pojištění firmy</h3>
        <div className="space-y-3">
          {(["property", "interruption", "liability"] as const).map((key) => (
            <div key={key} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 min-h-[44px]">
                <input
                  type="checkbox"
                  checked={risks[key]?.has ?? false}
                  onChange={(e) =>
                    setRisks({
                      [key]: {
                        ...(risks[key] ?? defaultRiskDetail()),
                        has: e.target.checked,
                      },
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
                value={risks[key]?.limit ?? 0}
                onChange={(e) =>
                  setRisks({
                    [key]: {
                      ...(risks[key] ?? defaultRiskDetail(true)),
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
                value={risks[key]?.contractYears ?? 0}
                onChange={(e) =>
                  setRisks({
                    [key]: {
                      ...(risks[key] ?? defaultRiskDetail(true)),
                      contractYears: num(e.target.value, 0),
                    },
                  })
                }
                className="w-28 rounded-lg border border-[color:var(--wp-border-strong)] px-2 py-1 text-[color:var(--wp-text)] text-sm"
              />
            </div>
          ))}
          {(["director", "fleet", "cyber"] as const).map((key) => (
            <label key={key} className="flex items-center gap-2 min-h-[44px]">
              <input
                type="checkbox"
                checked={risks[key] ?? false}
                onChange={(e) => setRisks({ [key]: e.target.checked })}
                className="rounded border-[color:var(--wp-border-strong)]"
              />
              <span className="text-sm text-[color:var(--wp-text-secondary)] capitalize">{key}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 p-3 bg-[color:var(--wp-surface-muted)] rounded-lg border border-[color:var(--wp-surface-card-border)] flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
            Pokrytí rizik: {riskSummary.covered}/{riskSummary.total}
          </span>
          {riskSummary.gaps.length > 0 ? (
            <span className="text-sm text-amber-700">
              Chybí: {riskSummary.gaps.join(", ")}
            </span>
          ) : (
            <span className="text-sm text-green-700">Všechna rizika pokryta</span>
          )}
        </div>
        {auditTips.length > 0 && (
          <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
            <strong>Tip na audit:</strong> {auditTips.join("; ")}
          </div>
        )}
      </section>

      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Pojištění jednatele</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Smrt (Kč)</span>
            <input
              type="number"
              min={0}
              value={directorIns.death ?? 0}
              onChange={(e) => setDirectorIns({ death: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Invalidita (Kč)</span>
            <input
              type="number"
              min={0}
              value={directorIns.invalidity ?? 0}
              onChange={(e) => setDirectorIns({ invalidity: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label>
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">PN/den (Kč)</span>
            <input
              type="number"
              min={0}
              value={directorIns.sick ?? 0}
              onChange={(e) => setDirectorIns({ sick: num(e.target.value, 0) })}
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
          <label className="block w-full">
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Stupeň invalidity (1–3)</span>
            <CustomDropdown
              value={String(directorIns.invalidityDegree ?? 1)}
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
              value={directorIns.statePensionMonthly ?? 0}
              onChange={(e) =>
                setDirectorIns({ statePensionMonthly: num(e.target.value, 0) })
              }
              className="w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-[color:var(--wp-text)]"
            />
          </label>
        </div>
        <div className="mt-4 p-3 bg-[color:var(--wp-surface-muted)] rounded-lg border border-[color:var(--wp-surface-card-border)] space-y-1 text-sm">
          <p className="text-[color:var(--wp-text-secondary)]"><strong>Modelované zajištění (orientační):</strong> smrt {fmt(Math.round(insRec.recDeath))} Kč, invalidita {fmt(Math.round(insRec.recInv))} Kč, PN {insRec.recSickPerDay} Kč/den</p>
          {insRec.invGap.gap > 0 && (
            <p className="text-amber-700">Gap invalidita: {fmt(Math.round(insRec.invGap.gap))} Kč</p>
          )}
          {insRec.isOsvc && (
            <p className="text-amber-700">OSVČ: zvažte nemocenské pojištění.</p>
          )}
          <p className="text-[color:var(--wp-text-secondary)]">
            {(insRec.belowDeath || insRec.belowInv || insRec.belowSick) && "Aktuální hodnoty pod modelem — oblast k ověření poradcem."}
          </p>
        </div>
      </section>

      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Investiční strategie</h3>
        <div className="flex flex-wrap gap-4">
          <label className="block w-full min-w-[200px]">
            <span className="block text-sm font-medium text-[color:var(--wp-text-secondary)] mb-1">Profil</span>
            <CustomDropdown
              value={strategy.profile ?? "balanced"}
              onChange={(id) => setStrategy({ profile: id as CompanyFaStrategy["profile"] })}
              options={[
                { id: "conservative", label: "Konzervativní" },
                { id: "balanced", label: "Vyvážený" },
                { id: "dynamic", label: "Dynamický" },
              ]}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 min-h-[44px]">
            <input
              type="checkbox"
              checked={strategy.conservativeMode ?? false}
              onChange={(e) => setStrategy({ conservativeMode: e.target.checked })}
              className="rounded border-[color:var(--wp-border-strong)]"
            />
            <span className="text-sm text-[color:var(--wp-text-secondary)]">Konzervativní režim</span>
          </label>
        </div>
      </section>

      <section className="p-4 md:p-6 bg-[color:var(--wp-surface-card)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
        <h3 className="text-lg font-medium text-[color:var(--wp-text)] mb-4">Investice</h3>
        <div className="space-y-3 overflow-x-auto">
          {investmentsWithFv.map((inv, i) => (
            <div
              key={i}
              className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end text-sm"
            >
              <span className="font-medium text-[color:var(--wp-text-secondary)] truncate">
                {inv.productKey}
              </span>
              <label className="block min-w-0">
                <span className="block text-xs text-[color:var(--wp-text-secondary)]">Typ</span>
                <CustomDropdown
                  value={inv.type}
                  onChange={(id) =>
                    setInvestment(i, {
                      type: id as "lump" | "monthly" | "pension",
                    })
                  }
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
                  onChange={(e) =>
                    setInvestment(i, { amount: num(e.target.value, 0) })
                  }
                  className="w-full rounded border border-[color:var(--wp-border-strong)] px-2 py-1 text-[color:var(--wp-text)]"
                />
              </label>
              <label>
                <span className="block text-xs text-[color:var(--wp-text-secondary)]">Roky</span>
                <input
                  type="number"
                  min={0}
                  value={inv.years ?? 0}
                  onChange={(e) =>
                    setInvestment(i, { years: num(e.target.value, 0) })
                  }
                  className="w-full rounded border border-[color:var(--wp-border-strong)] px-2 py-1 text-[color:var(--wp-text)]"
                />
              </label>
              <label>
                <span className="block text-xs text-[color:var(--wp-text-secondary)]">Výnos %</span>
                <input
                  type="number"
                  step={0.01}
                  value={inv.annualRate ?? 0}
                  onChange={(e) =>
                    setInvestment(i, {
                      annualRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded border border-[color:var(--wp-border-strong)] px-2 py-1 text-[color:var(--wp-text)]"
                />
              </label>
              <span className="text-xs text-[color:var(--wp-text-secondary)] self-center">
                FV: {fmt(inv.computed?.fv ?? 0)} Kč
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-[color:var(--wp-surface-muted)] rounded-lg border border-[color:var(--wp-surface-card-border)] flex flex-wrap gap-4 text-sm text-[color:var(--wp-text-secondary)]">
          <span><strong>Jednorázově celkem:</strong> {fmt(totalLump)} Kč</span>
          <span><strong>Měsíčně celkem:</strong> {fmt(totalMonthly)} Kč</span>
          <span><strong>Očekávaná FV celkem:</strong> {fmt(Math.round(totalFV))} Kč</span>
        </div>
      </section>
    </div>
  );
}
