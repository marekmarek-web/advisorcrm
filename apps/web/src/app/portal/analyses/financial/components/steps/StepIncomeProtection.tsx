"use client";

import { useEffect, useMemo, useState } from "react";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { computeInsurance } from "@/lib/analyses/financial/report";
import { formatCzk } from "@/lib/analyses/financial/formatters";
import {
  getDerivedIncomeProtectionPersons,
  getRiskTypesForPerson,
  getRiskLabel,
  getDefaultInsuredRisks,
  getInsuranceCompanies,
  showBenefitOptimization,
} from "@/lib/analyses/financial/incomeProtection";
import type {
  IncomeProtectionPlan,
  InsuredRiskEntry,
  InsuranceFundingSource,
  InsuredRiskType,
  FinancialAnalysisData,
} from "@/lib/analyses/financial/types";
import { Shield, Plus, Trash2, Calculator } from "lucide-react";
import { ProvenanceBadge } from "../ProvenanceBadge";

const FUNDING_LABELS: Record<InsuranceFundingSource, string> = {
  company: "Firma",
  personal: "Osobně",
  osvc: "OSVČ",
};

const PLAN_TYPE_OPTIONS = [
  { value: "full" as const, label: "Plné pojištění" },
  { value: "urazovka" as const, label: "Pouze úrazové pojištění" },
];

export function StepIncomeProtection() {
  const data = useFinancialAnalysisStore((s) => s.data);
  const incomeProtection = data.incomeProtection ?? { persons: [] };
  const setIncomeProtection = useFinancialAnalysisStore((s) => s.setIncomeProtection);
  const setIncomeProtectionPerson = useFinancialAnalysisStore((s) => s.setIncomeProtectionPerson);
  const addIncomeProtectionPlan = useFinancialAnalysisStore((s) => s.addIncomeProtectionPlan);
  const updateIncomeProtectionPlan = useFinancialAnalysisStore((s) => s.updateIncomeProtectionPlan);
  const removeIncomeProtectionPlan = useFinancialAnalysisStore((s) => s.removeIncomeProtectionPlan);
  const setIncomeProtectionPlanRisks = useFinancialAnalysisStore((s) => s.setIncomeProtectionPlanRisks);
  const setIncomeProtectionPersonFunding = useFinancialAnalysisStore((s) => s.setIncomeProtectionPersonFunding);
  const recalcBenefitVsSalary = useFinancialAnalysisStore((s) => s.recalcBenefitVsSalary);
  const setInsurance = useFinancialAnalysisStore((s) => s.setInsurance);

  const ins = useMemo(() => computeInsurance(data), [data]);
  const companies = useMemo(() => getInsuranceCompanies(), []);
  const invalidity50Plus = data.insurance?.invalidity50Plus ?? false;

  const persons = useMemo(() => {
    const derived = getDerivedIncomeProtectionPersons(data, incomeProtection.persons);
    if (
      derived.length !== incomeProtection.persons.length ||
      derived.some((d, i) => d.personKey !== incomeProtection.persons[i]?.personKey)
    ) {
      return derived;
    }
    return incomeProtection.persons.map((p) => {
      const d = derived.find((x) => x.personKey === p.personKey);
      return d ? { ...d, displayName: d.displayName, role: d.role } : p;
    });
  }, [data, incomeProtection.persons]);

  useEffect(() => {
    const derived = getDerivedIncomeProtectionPersons(data, incomeProtection.persons);
    const keys = derived.map((p) => p.personKey).join(",");
    const currentKeys = (incomeProtection.persons ?? []).map((p) => p.personKey).join(",");
    if (keys !== currentKeys || derived.length !== (incomeProtection.persons ?? []).length) {
      setIncomeProtection({ persons: derived });
    }
  }, [data.client?.hasPartner, data.partner, data.children?.length, setIncomeProtection, incomeProtection.persons, data]);

  const addPlan = (personKey: string) => {
    addIncomeProtectionPlan(personKey, {
      provider: companies[0] ?? "",
      insuredRisks: getDefaultInsuredRisks(),
    });
  };

  /** Copy plan from another person (insuredRisks merged for target person's allowed risk types). */
  const addPlanCopyFrom = (targetPersonKey: string, sourcePersonKey: string) => {
    const sourcePerson = persons.find((p) => p.personKey === sourcePersonKey);
    const sourcePlan = sourcePerson?.insurancePlans?.[0];
    if (!sourcePlan) return;
    const planType = sourcePlan.planType ?? "full";
    const riskTypes = getRiskTypesForPerson(targetPersonKey, data, planType);
    const sourceRisks = sourcePlan.insuredRisks ?? [];
    const insuredRisks: InsuredRiskEntry[] = riskTypes.map((riskType) => {
      const from = sourceRisks.find((r) => r.riskType === riskType);
      if (from) return { ...from };
      return { riskType, enabled: false };
    });
    addIncomeProtectionPlan(targetPersonKey, {
      provider: sourcePlan.provider,
      policyType: sourcePlan.policyType,
      planType: sourcePlan.planType,
      annualContribution: sourcePlan.annualContribution,
      monthlyPremium: sourcePlan.monthlyPremium,
      fundingSource: sourcePlan.fundingSource,
      insuredRisks,
      notes: sourcePlan.notes,
    });
  };

  const [addBlockChoice, setAddBlockChoice] = useState<Record<string, string>>({});
  const onAddBlockChange = (personKey: string, value: string) => {
    if (!value) return;
    if (value === "__empty__") addPlan(personKey);
    else if (value.startsWith("copy:")) addPlanCopyFrom(personKey, value.slice(5));
    setAddBlockChoice((prev) => ({ ...prev, [personKey]: "" }));
  };

  const planMonthly = (p: IncomeProtectionPlan) =>
    p.monthlyPremium != null ? p.monthlyPremium : (p.annualContribution ?? 0) / 12;

  const riskPriceTotal = (p: IncomeProtectionPlan) =>
    (p.insuredRisks ?? []).reduce((s, r) => s + (r.enabled && r.finalPrice ? r.finalPrice : 0), 0);

  const planTotalMonthly = (p: IncomeProtectionPlan) => planMonthly(p) + riskPriceTotal(p);

  const totalMonthlyPerPerson = (plans: IncomeProtectionPlan[]) =>
    plans.reduce((sum, p) => sum + planTotalMonthly(p), 0);

  const grandTotalMonthly = persons.reduce(
    (sum, p) => sum + totalMonthlyPerPerson(p.insurancePlans ?? []),
    0
  );
  const companyTotalMonthly = persons.reduce((sum, p) => {
    const fromCompany = (p.insurancePlans ?? []).filter((pl) => pl.fundingSource === "company");
    return sum + fromCompany.reduce((s, pl) => s + planTotalMonthly(pl), 0);
  }, 0);
  const personalOsvcTotalMonthly = Math.max(0, grandTotalMonthly - companyTotalMonthly);

  const companyMonthlyFromPlansForPerson = (plans: IncomeProtectionPlan[]) =>
    plans.filter((pl) => pl.fundingSource === "company").reduce((s, pl) => s + planTotalMonthly(pl), 0);
  const personalOsvcMonthlyForPerson = (plans: IncomeProtectionPlan[]) =>
    Math.max(0, totalMonthlyPerPerson(plans) - companyMonthlyFromPlansForPerson(plans));

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
          <Shield className="w-8 h-8 text-indigo-600" />
          Zajištění
        </h2>
        <p className="text-slate-500 mt-1">
          Doporučené krytí a navržené řešení pojištění pro každého člena analýzy.
        </p>
      </div>

      {/* 50% invalidity checkbox (moved from Strategy) */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={invalidity50Plus}
            onChange={(e) => setInsurance({ invalidity50Plus: e.target.checked })}
            className="w-5 h-5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
          />
          <span className="text-sm font-semibold text-slate-700">
            Použít poloviční doporučení na invaliditu (volba poradce)
          </span>
        </label>
      </div>

      <div className="space-y-8">
        {persons.map((person) => (
          <section
            key={person.personKey}
            className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
          >
            <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">
                {person.displayName}
                <span className="text-slate-500 font-normal ml-2">({person.role})</span>
              </h3>
              {(person.roleType === "client" || person.roleType === "partner") && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <select
                    value={person.roleType ?? "client"}
                    onChange={(e) => {
                      const roleType = e.target.value as "client" | "partner" | "director" | "owner" | "partner_company";
                      setIncomeProtectionPerson(person.personKey, { roleType });
                      if (person.funding?.companyContributionMonthly && (roleType === "director" || roleType === "owner" || roleType === "partner_company")) {
                        setTimeout(() => recalcBenefitVsSalary(person.personKey), 0);
                      }
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium"
                  >
                    <option value="client">Klient</option>
                    <option value="partner">Partner</option>
                    <option value="director">Jednatel / jednatelka</option>
                    <option value="owner">Majitel</option>
                    <option value="partner_company">Společník</option>
                  </select>
                  <select
                    value={person.employmentType ?? "employee"}
                    onChange={(e) =>
                      setIncomeProtectionPerson(person.personKey, {
                        employmentType: e.target.value as "employee" | "osvc" | "mixed" | "invalidni_duchod" | "starobni_duchod",
                      })
                    }
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium"
                  >
                    <option value="employee">Zaměstnanec</option>
                    <option value="osvc">OSVČ</option>
                    <option value="mixed">Kombinace</option>
                    <option value="invalidni_duchod">Invalidní důchod</option>
                    <option value="starobni_duchod">Starobní důchod</option>
                  </select>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {/* Doporučené zajištění (read-only) – ordered: Smrt, Invalidita, TN, PN */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Doporučené krytí</h4>
                {person.personKey === "client" && ins.netIncome > 0 && (
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>Smrt: {ins.death.individual ? "individuálně" : formatCzk(ins.death.coverage)}</li>
                    <li>Invalidita: {formatCzk(ins.invalidity.capital)}</li>
                    <li>TN: {formatCzk(ins.tn.base)} (progrese {ins.tn.progress}×)</li>
                    <li>PN: {Math.round(ins.sickness.dailyBenefit).toLocaleString("cs-CZ")} Kč/den</li>
                  </ul>
                )}
                {person.personKey === "partner" && ins.partnerInsurance && (
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>Smrt: {formatCzk(ins.partnerInsurance.death.coverage)}</li>
                    <li>Invalidita: {formatCzk(ins.partnerInsurance.invalidity.capital)}</li>
                    <li>PN: {Math.round(ins.partnerInsurance.sickness.dailyBenefit).toLocaleString("cs-CZ")} Kč/den</li>
                  </ul>
                )}
                {person.personKey.startsWith("child_") && ins.childInsurance.length > 0 && (() => {
                  const idx = parseInt(person.personKey.replace("child_", ""), 10);
                  const c = ins.childInsurance[idx];
                  if (!c) return null;
                  return (
                    <ul className="text-sm text-slate-600 space-y-1">
                      <li>Invalidita: {formatCzk(c.invalidity)}</li>
                      <li>TN: {formatCzk(c.tn)}</li>
                      <li>Denní odškodné: {formatCzk(c.dailyComp)}/den</li>
                    </ul>
                  );
                })()}
                {((person.personKey === "client" && ins.netIncome === 0) ||
                  (person.personKey === "partner" && !ins.partnerInsurance) ||
                  (person.personKey.startsWith("child_") && ins.childInsurance.length === 0)) && (
                  <p className="text-sm text-slate-500">Zadejte příjmy v kroku Cashflow pro doporučení.</p>
                )}
              </div>

              {/* Optimalizace příspěvku (pro jednatele/majitele) */}
              {showBenefitOptimization(person) && (
                <div className="bg-indigo-50 rounded-xl p-4 sm:p-6 border border-indigo-100">
                  <h4 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    Optimalizace příspěvku a zajištění
                  </h4>
                  {(() => {
                    const fromPlans = companyMonthlyFromPlansForPerson(person.insurancePlans ?? []);
                    const personalPart = personalOsvcMonthlyForPerson(person.insurancePlans ?? []);
                  return (
                  <>
                  {fromPlans > 0 && (
                    <p className="text-sm text-slate-600 mb-3">
                      Z pojistných bloků (zdroj firma): <strong>{formatCzk(fromPlans)}</strong> Kč/měs.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700 flex flex-wrap items-center gap-2">
                        Měsíční příspěvek firmy (Kč)
                        <ProvenanceBadge path="incomeProtection.persons" data={data as unknown as Record<string, unknown>} />
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={person.funding?.companyContributionMonthly ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          setIncomeProtectionPersonFunding(person.personKey, {
                            companyContributionMonthly: v,
                            companyContributionAnnual: v != null ? v * 12 : undefined,
                          });
                        }}
                        onBlur={() => recalcBenefitVsSalary(person.personKey)}
                        className="mt-1 block w-full min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-slate-800"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <span className="text-xs font-bold text-slate-500 uppercase">Firma platí</span>
                      <p className="text-lg font-semibold text-slate-800">{formatCzk(person.funding?.companyContributionMonthly ?? fromPlans)} / měs.</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <span className="text-xs font-bold text-slate-500 uppercase">Osobně / OSVČ doplácí</span>
                      <p className="text-lg font-semibold text-slate-800">{formatCzk(personalPart)} / měs.</p>
                    </div>
                  </div>
                  </>
                  ); })()}
                  {person.funding?.benefitVsSalaryComparison && person.funding.companyContributionMonthly != null && person.funding.companyContributionMonthly > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div className="bg-white rounded-lg p-4 border border-slate-200">
                        <div className="text-xs font-bold text-slate-500 uppercase mb-2">Varianta A – Navýšení mzdy</div>
                        <p className="text-sm text-slate-700">
                          Hrubá mzda ekvivalent: {formatCzk(person.funding.benefitVsSalaryComparison.salaryIncreaseGrossEquivalent ?? 0)}
                        </p>
                        <p className="text-sm text-slate-700">
                          Náklad firmy: {formatCzk(person.funding.benefitVsSalaryComparison.salaryVariantCompanyCost ?? 0)}/měs.
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-slate-200">
                        <div className="text-xs font-bold text-slate-500 uppercase mb-2">Varianta B – Firemní příspěvek</div>
                        <p className="text-sm text-slate-700">
                          Náklad firmy: {formatCzk(person.funding.benefitVsSalaryComparison.benefitVariantCompanyCost ?? 0)}/měs.
                        </p>
                        <p className="text-sm text-slate-700">
                          Do pojištění: {formatCzk(person.funding.benefitVsSalaryComparison.benefitVariantNetToInsurance ?? 0)}/měs.
                        </p>
                      </div>
                    </div>
                  )}
                  {person.funding?.benefitVsSalaryComparison?.estimatedSavings != null && person.funding.benefitVsSalaryComparison.estimatedSavings > 0 && (
                    <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-100">
                      <span className="font-bold text-green-800">Úspora firmy ročně: </span>
                      <span className="text-green-700">{formatCzk(person.funding.benefitVsSalaryComparison.estimatedSavings)}</span>
                    </div>
                  )}
                  {person.funding?.benefitVsSalaryComparison?.ownerTaxSavingsAnnual != null && person.funding.benefitVsSalaryComparison.ownerTaxSavingsAnnual > 0 && (
                    <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <span className="font-bold text-amber-800">Daňová úspora majitelů: </span>
                      <span className="text-amber-700">{formatCzk(person.funding.benefitVsSalaryComparison.ownerTaxSavingsAnnual)} ročně</span>
                      <p className="text-xs text-amber-700 mt-1">Efektivní vytažení zisku (DIP/IŽP)</p>
                    </div>
                  )}
                  {person.funding?.benefitVsSalaryComparison?.explanation && (
                    <p className="text-sm text-slate-600 mt-3">{person.funding.benefitVsSalaryComparison.explanation}</p>
                  )}
                  <div className="mt-4 p-3 bg-slate-100 rounded-lg border border-slate-200 text-sm text-slate-700">
                    <strong>Co se stane s 1000 Kč nákladu firmy?</strong> Při navýšení mzdy: část jde na odvody (stát), část dostane zaměstnanec čistě. Při firemním příspěvku (benefit): 100&nbsp;% jde do pojištění bez odvodů.
                  </div>
                </div>
              )}
              {!showBenefitOptimization(person) && (person.roleType === "client" || person.roleType === "partner") && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={person.funding?.benefitOptimizationEnabled ?? false}
                    onChange={(e) =>
                      setIncomeProtectionPersonFunding(person.personKey, { benefitOptimizationEnabled: e.target.checked })
                    }
                    className="w-5 h-5 rounded border-slate-300 text-indigo-500"
                  />
                  <span className="text-sm font-medium text-slate-700">Optimalizace příspěvku (jednatel / majitel)</span>
                </label>
              )}

              {/* Navržené řešení – plány */}
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3">Navržené řešení</h4>
                <div className="space-y-4">
                  {(person.insurancePlans ?? []).map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      personKey={person.personKey}
                      data={data}
                      companies={companies}
                      onUpdate={(partial) => updateIncomeProtectionPlan(person.personKey, plan.id, partial)}
                      onRemove={() => removeIncomeProtectionPlan(person.personKey, plan.id)}
                      onRisksChange={(risks) => setIncomeProtectionPlanRisks(person.personKey, plan.id, risks)}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <select
                    value={addBlockChoice[person.personKey] ?? ""}
                    onChange={(e) => onAddBlockChange(person.personKey, e.target.value)}
                    className="min-h-[44px] px-4 py-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 font-medium bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                    aria-label="Přidat pojistný blok"
                  >
                    <option value="">Přidat pojistný blok...</option>
                    <option value="__empty__">Nový prázdný blok</option>
                    {persons
                      .filter(
                        (p) =>
                          p.personKey !== person.personKey &&
                          (p.insurancePlans?.length ?? 0) > 0
                      )
                      .map((p) => (
                        <option key={p.personKey} value={`copy:${p.personKey}`}>
                          Okopírovat z: {p.displayName}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="text-sm font-semibold text-slate-700 pt-2 border-t border-slate-100">
                Celkem za {person.displayName}: {formatCzk(totalMonthlyPerPerson(person.insurancePlans ?? []))} / měsíc
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Side summary */}
      <div className="mt-8 p-4 sm:p-6 bg-slate-50 rounded-2xl border border-slate-200 sticky bottom-4 sm:bottom-0">
        <h4 className="font-bold text-slate-800 mb-2">Souhrn</h4>
        <p className="text-slate-700">
          Celková měsíční cena: <strong>{formatCzk(grandTotalMonthly)}</strong>
        </p>
        {companyTotalMonthly > 0 && (
          <p className="text-slate-600 text-sm mt-1">
            Z toho firma: {formatCzk(companyTotalMonthly)} / měsíc
          </p>
        )}
        {personalOsvcTotalMonthly > 0 && (
          <p className="text-slate-600 text-sm mt-1">
            Osobně / OSVČ doplácí: {formatCzk(personalOsvcTotalMonthly)} / měsíc
          </p>
        )}
      </div>
    </>
  );
}

function PlanCard({
  plan,
  personKey,
  data,
  companies,
  onUpdate,
  onRemove,
  onRisksChange,
}: {
  plan: IncomeProtectionPlan;
  personKey: string;
  data: FinancialAnalysisData;
  companies: string[];
  onUpdate: (partial: Partial<IncomeProtectionPlan>) => void;
  onRemove: () => void;
  onRisksChange: (risks: InsuredRiskEntry[]) => void;
}) {
  const planType = plan.planType ?? "full";
  const riskTypes = getRiskTypesForPerson(personKey, data, planType);
  const risks = plan.insuredRisks?.length ? plan.insuredRisks : getDefaultInsuredRisks();

  const ensureRisks = (): InsuredRiskEntry[] => {
    const current = plan.insuredRisks ?? [];
    const allTypes = getRiskTypesForPerson(personKey, data);
    return allTypes.map((rt) => current.find((r) => r.riskType === rt) ?? { riskType: rt, enabled: false });
  };

  const toggleRisk = (riskType: string, enabled: boolean) => {
    const next = ensureRisks().map((r) => (r.riskType === riskType ? { ...r, enabled } : r));
    onRisksChange(next);
  };

  const updateRisk = (riskType: string, patch: Partial<InsuredRiskEntry>) => {
    const next = ensureRisks().map((r) => (r.riskType === riskType ? { ...r, ...patch } : r));
    onRisksChange(next);
  };

  const riskPriceSum = riskTypes.reduce((sum, rt) => {
    const entry = risks.find((r) => r.riskType === rt);
    return sum + (entry?.enabled && entry?.finalPrice ? entry.finalPrice : 0);
  }, 0);

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <select
          value={plan.provider}
          onChange={(e) => onUpdate({ provider: e.target.value })}
          className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 text-slate-800 font-medium flex-1 min-w-[180px]"
        >
          {companies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={plan.fundingSource ?? "personal"}
          onChange={(e) => onUpdate({ fundingSource: e.target.value as InsuranceFundingSource })}
          className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm"
        >
          {(Object.entries(FUNDING_LABELS) as [InsuranceFundingSource, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={planType}
          onChange={(e) => onUpdate({ planType: e.target.value as "full" | "urazovka" })}
          className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm"
        >
          {PLAN_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="min-h-[44px] min-w-[44px] p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 flex items-center justify-center"
          aria-label="Odebrat blok"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <label className="block">
          <span className="text-xs text-slate-500">Měsíční příspěvek (Kč)</span>
          <input
            type="number"
            min={0}
            step={100}
            value={plan.monthlyPremium ?? ""}
            onChange={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              onUpdate({ monthlyPremium: v, annualContribution: v != null ? v * 12 : undefined });
            }}
            className="mt-1 block w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Roční příspěvek (Kč)</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={plan.annualContribution ?? ""}
            onChange={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              onUpdate({ annualContribution: v, monthlyPremium: v != null ? v / 12 : undefined });
            }}
            className="mt-1 block w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {/* Risk pills – spread, aligned grid */}
      <div>
        <span className="text-xs font-bold text-slate-600 mb-2 block">Rizika</span>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {riskTypes.map((rt) => {
            const entry = risks.find((r) => r.riskType === rt) ?? { riskType: rt, enabled: false };
            return (
              <div
                key={rt}
                className={`rounded-xl border p-3 transition-colors ${
                  entry.enabled
                    ? "border-indigo-300 bg-indigo-50/50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <label className="flex items-center gap-2 min-h-[36px] cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={(e) => toggleRisk(rt, e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-500"
                  />
                  <span className="text-sm font-semibold text-slate-700">{getRiskLabel(rt as InsuredRiskType)}</span>
                </label>
                {entry.enabled && (
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="number"
                      placeholder="Krytí (Kč)"
                      value={entry.coverageAmount ?? ""}
                      onChange={(e) => updateRisk(rt, { coverageAmount: e.target.value === "" ? undefined : Number(e.target.value) })}
                      className="w-full min-h-[36px] rounded-lg border border-slate-200 px-2 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Cena (Kč/měs)"
                      value={entry.finalPrice ?? ""}
                      onChange={(e) => updateRisk(rt, { finalPrice: e.target.value === "" ? undefined : Number(e.target.value) })}
                      className="w-full min-h-[36px] rounded-lg border border-slate-200 px-2 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {riskPriceSum > 0 && (
          <div className="mt-3 text-sm font-semibold text-indigo-700">
            Celkem z rizik: {formatCzk(riskPriceSum)} / měsíc
          </div>
        )}
      </div>
    </div>
  );
}
