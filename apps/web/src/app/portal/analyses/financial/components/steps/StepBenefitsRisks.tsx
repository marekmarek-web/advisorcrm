"use client";

import { useState } from "react";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import type { CompanyRisks, CompanyRiskDetails } from "@/lib/analyses/financial/types";
import { formatCzk } from "@/lib/analyses/financial/formatters";
import {
  benefitGrossEquiv,
  benefitEmployerCost,
  benefitNetForEmployee,
  benefitSavingsEmployees,
  benefitDirectorsTaxSavings,
} from "@/lib/analyses/financial/calculations";
import {
  Gift,
  Shield,
  PiggyBank,
  TrendingUp,
  Umbrella,
  Calculator,
  Check,
  Building,
  PauseCircle,
  Gavel,
  UserCircle,
  Truck,
  ShieldAlert,
  Info,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

const BENEFIT_OPTIONS: { key: "dps" | "dip" | "izp"; label: string; subtitle: string; Icon: typeof PiggyBank; iconBg: string }[] = [
  { key: "dps", label: "DPS", subtitle: "Penzijní připojištění", Icon: PiggyBank, iconBg: "bg-blue-100 text-blue-600" },
  { key: "dip", label: "DIP", subtitle: "Dlouhodobé investice", Icon: TrendingUp, iconBg: "bg-emerald-100 text-emerald-600" },
  { key: "izp", label: "IŽP", subtitle: "Životní pojištění", Icon: Umbrella, iconBg: "bg-violet-100 text-violet-600" },
];

const RISK_OPTIONS: {
  key: keyof CompanyRisks;
  label: string;
  subtitle: string;
  Icon: typeof Building;
  iconBg: string;
  hasDetail: boolean;
  tooltip?: string;
}[] = [
  { key: "property", label: "Majetek", subtitle: "Máme sjednáno", Icon: Building, iconBg: "bg-blue-100 text-blue-600", hasDetail: true },
  { key: "interruption", label: "Přerušení provozu", subtitle: "Máme sjednáno", Icon: PauseCircle, iconBg: "bg-orange-100 text-orange-600", hasDetail: true },
  { key: "liability", label: "Odpovědnost", subtitle: "Máme sjednáno", Icon: Gavel, iconBg: "bg-red-100 text-red-600", hasDetail: true },
  { key: "director", label: "D&O", subtitle: "Odpovědnost statutárů", Icon: UserCircle, iconBg: "bg-violet-100 text-violet-600", hasDetail: false, tooltip: "Pojištění odpovědnosti statutárních orgánů. Chrání váš osobní majetek, pokud způsobíte firmě škodu." },
  { key: "fleet", label: "Flotila", subtitle: "", Icon: Truck, iconBg: "bg-emerald-100 text-emerald-600", hasDetail: false },
  { key: "cyber", label: "Kyber", subtitle: "Únik dat, ransomware", Icon: ShieldAlert, iconBg: "bg-cyan-100 text-cyan-600", hasDetail: false, tooltip: "Krytí pro případ úniku dat, GDPR pokut nebo hackerského útoku (ransomware)." },
];

export function StepBenefitsRisks() {
  const [activeTab, setActiveTab] = useState<"benefits" | "risks">("benefits");
  const data = useStore((s) => s.data);
  const setData = useStore((s) => s.setData);
  const benefits = data.companyBenefits ?? {};
  const risks = data.companyRisks ?? {};
  const riskDetails = data.companyRiskDetails ?? {};

  const setBenefits = (patch: Partial<typeof benefits>) => {
    const next = { ...benefits, ...patch };
    const amountPerPerson = next.amountPerPerson ?? 0;
    const employeeCount = next.employeeCount ?? 0;
    const directorsAmount = next.directorsAmount ?? 0;
    next.annualCost = (amountPerPerson * employeeCount + directorsAmount) * 12;
    setData({ companyBenefits: next });
  };

  const setRisks = (patch: Partial<CompanyRisks>) => {
    setData({ companyRisks: { ...risks, ...patch } });
  };

  const setRiskDetail = (risk: "property" | "interruption" | "liability", patch: { limit?: number; contractYears?: number }) => {
    const next: CompanyRiskDetails = { ...riskDetails };
    next[risk] = { ...(next[risk] ?? {}), ...patch };
    setData({ companyRiskDetails: next });
  };

  const amountPerPerson = benefits.amountPerPerson ?? 0;
  const employeeCount = benefits.employeeCount ?? 0;
  const directorsAmount = benefits.directorsAmount ?? 0;
  const yearlyEmployees = amountPerPerson * employeeCount * 12;
  const yearlyDirectors = directorsAmount * 12;

  const grossEquiv = benefitGrossEquiv(amountPerPerson);
  const employerCost = benefitEmployerCost(grossEquiv);
  const netForEmployee = benefitNetForEmployee(grossEquiv);
  const savingsEmployees = benefitSavingsEmployees(employerCost, amountPerPerson, employeeCount);
  const directorsTaxSavings = benefitDirectorsTaxSavings(directorsAmount);

  const riskCount = RISK_OPTIONS.filter((r) => risks[r.key]).length;
  const gaps: string[] = [];
  if (!risks.property) gaps.push("Majetek");
  if (!risks.liability) gaps.push("Odpovědnost");
  if (!risks.director) gaps.push("D&O");

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Benefity & Rizika</h2>
        <p className="text-slate-500 mt-1">Co máte a co chybí (1 minuta).</p>
      </div>

      <div className="flex gap-3 mb-8 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab("benefits")}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
            activeTab === "benefits" ? "bg-indigo-500 text-white shadow" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Gift className="w-4 h-4" />
          Benefity
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("risks")}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
            activeTab === "risks" ? "bg-indigo-500 text-white shadow" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Shield className="w-4 h-4" />
          Pojištění firmy
        </button>
      </div>

      {activeTab === "benefits" && (
        <div className="space-y-6">
          <section className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Přispíváte zaměstnancům?</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {BENEFIT_OPTIONS.map(({ key, label, subtitle, Icon, iconBg }) => (
                <label
                  key={key}
                  className={`flex items-center gap-3 cursor-pointer rounded-xl border-2 bg-white p-4 min-h-[44px] transition-all ${
                    benefits[key] ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!benefits[key]}
                    onChange={(e) => setBenefits({ [key]: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900">{label}</div>
                    <div className="text-xs text-slate-500">{subtitle}</div>
                  </div>
                  {benefits[key] && <Check className="w-5 h-5 text-indigo-500 flex-shrink-0" />}
                </label>
              ))}
            </div>

            <div className="mt-6 bg-white p-4 rounded-xl border border-slate-200">
              <h4 className="font-bold text-slate-800 mb-3">Detail příspěvků – Zaměstnanci</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Příspěvek na osobu/měs (zaměstnanci)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={benefits.amountPerPerson ?? ""}
                      onChange={(e) => setBenefits({ amountPerPerson: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-4 pr-12 py-2 border border-slate-200 rounded-xl text-sm min-h-[44px]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Kč</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Kolika zaměstnancům</label>
                  <input
                    type="number"
                    min={0}
                    value={benefits.employeeCount ?? ""}
                    onChange={(e) => setBenefits({ employeeCount: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Roční náklad firmy (zaměstnanci)</label>
                  <div className="w-full px-4 py-2 bg-slate-50 rounded-xl text-sm font-bold text-slate-900 text-center min-h-[44px] flex items-center justify-center">
                    {yearlyEmployees > 0 ? formatCzk(yearlyEmployees) : "—"}
                  </div>
                </div>
              </div>
              <h4 className="font-bold text-slate-800 mb-3">Příspěvky jednatelům (majitelé)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Kolik přispíváte jednatelům měsíčně? (celkem)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={benefits.directorsAmount ?? ""}
                      onChange={(e) => setBenefits({ directorsAmount: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-4 pr-12 py-2 border border-slate-200 rounded-xl text-sm min-h-[44px]"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Kč</span>
                  </div>
                </div>
                <div className="flex items-end">
                  <div className="text-sm text-slate-600">Roční náklad: {yearlyDirectors > 0 ? formatCzk(yearlyDirectors) : "—"}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6">
            <h3 className="text-emerald-800 font-bold mb-4 flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Kalkulačka benefitů
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-3">Varianta A: Navýšení mzdy</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Hrubá mzda navíc:</span>
                    <span className="font-bold">{amountPerPerson > 0 && employeeCount > 0 ? formatCzk(grossEquiv * employeeCount) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Odvody (33,8 %):</span>
                    <span className="font-bold text-red-500">{amountPerPerson > 0 && employeeCount > 0 ? formatCzk((employerCost - grossEquiv) * employeeCount) : "—"}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-2">
                    <span className="font-bold">Náklad firmy:</span>
                    <span className="font-bold text-red-600">{amountPerPerson > 0 && employeeCount > 0 ? formatCzk(employerCost * employeeCount) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Zaměstnanec čistého:</span>
                    <span className="font-bold">{amountPerPerson > 0 && employeeCount > 0 ? formatCzk(netForEmployee * employeeCount) : "—"}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-emerald-300 ring-2 ring-emerald-200">
                <h4 className="font-bold text-emerald-700 mb-3 flex items-center gap-1">
                  <span className="text-amber-500">★</span> Varianta B: Benefit
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Příspěvek:</span>
                    <span className="font-bold">{amountPerPerson > 0 && employeeCount > 0 ? formatCzk(amountPerPerson * employeeCount) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Odvody:</span>
                    <span className="font-bold text-emerald-600">0 Kč</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-2">
                    <span className="font-bold">Náklad firmy:</span>
                    <span className="font-bold text-emerald-600">{amountPerPerson > 0 && employeeCount > 0 ? formatCzk(amountPerPerson * employeeCount) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Zaměstnanec dostane:</span>
                    <span className="font-bold text-emerald-600">{amountPerPerson > 0 && employeeCount > 0 ? formatCzk(amountPerPerson * employeeCount) : "—"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-emerald-100 rounded-xl text-center min-h-[44px] flex flex-col justify-center">
                <div className="text-emerald-800 font-bold text-lg">
                  Úspora (zaměstnanci): <span className="text-2xl">{savingsEmployees > 0 ? formatCzk(savingsEmployees) : "—"}</span> ročně
                </div>
              </div>
              <div className="p-4 bg-amber-100 rounded-xl text-center min-h-[44px] flex flex-col justify-center">
                <div className="text-amber-800 font-bold text-lg">
                  Daňová úspora majitelů: <span className="text-2xl">{directorsTaxSavings > 0 ? formatCzk(Math.round(directorsTaxSavings)) : "—"}</span> ročně
                </div>
                <div className="text-amber-700 text-sm mt-1">Efektivní vytažení zisku (DIP/IŽP)</div>
              </div>
            </div>
            <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200">
              <p className="font-bold text-slate-800 mb-2 text-sm">Co se stane s 1000 Kč nákladu firmy?</p>
              <p className="text-sm text-slate-600">U mzdy jde zaměstnanci čistě cca 550 Kč, stát bere odvody. U benefitů jde 100 % zaměstnanci / vám.</p>
            </div>
          </section>
        </div>
      )}

      {activeTab === "risks" && (
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Jaká pojištění má firma?</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {RISK_OPTIONS.map(({ key, label, subtitle, Icon, iconBg, hasDetail, tooltip }) => (
              <div
                key={key}
                className={`bg-white border-2 rounded-xl p-4 transition-all ${
                  risks[key] ? "border-indigo-500" : "border-slate-200"
                } ${hasDetail ? "" : ""}`}
              >
                <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={!!risks[key]}
                    onChange={(e) => setRisks({ [key]: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900">{label}</div>
                    {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
                  </div>
                  {tooltip && (
                    <span title={tooltip} className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                      <Info className="w-4 h-4" />
                    </span>
                  )}
                  {risks[key] && <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                </label>
                {hasDetail && risks[key] && (key === "property" || key === "interruption" || key === "liability") && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-0.5">Pojistný limit (cca) Kč</label>
                      <input
                        type="number"
                        min={0}
                        value={riskDetails[key]?.limit ?? ""}
                        onChange={(e) => setRiskDetail(key, { limit: parseFloat(e.target.value) || undefined })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[40px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-0.5">Stáří smlouvy (roky)</label>
                      <input
                        type="number"
                        min={0}
                        value={riskDetails[key]?.contractYears ?? ""}
                        onChange={(e) => setRiskDetail(key, { contractYears: parseInt(e.target.value, 10) || undefined })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[40px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800">Skóre rizik</span>
              <span className="text-2xl font-bold text-indigo-600">{riskCount}/6</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 mb-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${(riskCount / 6) * 100}%` }}
              />
            </div>
            <div className="text-sm flex items-center gap-1">
              {gaps.length > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span className="text-red-600">Chybí: {gaps.join(", ")}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-emerald-600">OK</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
