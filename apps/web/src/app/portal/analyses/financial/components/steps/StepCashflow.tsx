"use client";

import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectTotalIncome, selectTotalExpense, selectSurplus, selectReserveTarget, selectReserveGap, selectIsReserveMet } from "@/lib/analyses/financial/selectors";
import { GROSS_FROM_NET_FACTOR, INSURANCE_COMPANIES_CS } from "@/lib/analyses/financial/constants";
import type { InsuranceItemType } from "@/lib/analyses/financial/types";
import { companyRunway } from "@/lib/analyses/financial/calculations";
import { ArrowDown, ArrowUp, Plus, Shield, Trash2, Building2 } from "lucide-react";
import { formatCzk } from "@/lib/analyses/financial/formatters";
import { ProvenanceBadge } from "../ProvenanceBadge";

const INSURANCE_TYPES: { value: InsuranceItemType; label: string }[] = [
  { value: "majetkové", label: "Majetkové" },
  { value: "odpovědnost", label: "Odpovědnost" },
  { value: "životní", label: "Životní" },
];

function InputAmount({
  label,
  value,
  onChange,
  id,
}: { label: string; value: number; onChange: (v: number) => void; id: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type="number"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full pl-4 pr-12 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">Kč</span>
      </div>
    </div>
  );
}

export function StepCashflow() {
  const data = useStore((s) => s.data);
  const setData = useStore((s) => s.setData);
  const setCashflowField = useStore((s) => s.setCashflowField);
  const addIncomeOther = useStore((s) => s.addIncomeOther);
  const updateIncomeOther = useStore((s) => s.updateIncomeOther);
  const removeIncomeOther = useStore((s) => s.removeIncomeOther);
  const addExpenseOther = useStore((s) => s.addExpenseOther);
  const updateExpenseOther = useStore((s) => s.updateExpenseOther);
  const removeExpenseOther = useStore((s) => s.removeExpenseOther);
  const addExpenseInsuranceItem = useStore((s) => s.addExpenseInsuranceItem);
  const updateExpenseInsuranceItem = useStore((s) => s.updateExpenseInsuranceItem);
  const removeExpenseInsuranceItem = useStore((s) => s.removeExpenseInsuranceItem);

  const totalInc = selectTotalIncome(data);
  const totalExp = selectTotalExpense(data);
  const surplusVal = selectSurplus(data);
  const reserveTargetVal = selectReserveTarget(data);
  const reserveGapVal = selectReserveGap(data);
  const isReserveMet = selectIsReserveMet(data);

  const inc = data.cashflow.incomes;
  const exp = data.cashflow.expenses;
  const incomeOther = inc.otherDetails || [];
  const expenseOther = exp.otherDetails || [];
  const insuranceItems = exp.insuranceItems || [];
  const includeCompany = data.includeCompany ?? false;
  const cf = data.companyFinance ?? {};

  const personOptions = [
    { key: "client", label: data.client?.name || "Klient" },
    ...(data.client?.hasPartner && data.partner ? [{ key: "partner", label: data.partner.name || "Partner" }] : []),
    ...(data.children ?? []).map((c, i) => ({ key: `child_${i}`, label: c.name || `Dítě ${i + 1}` })),
  ];
  const runway = companyRunway(data.companyFinance);
  const setCompanyFinance = (patch: Partial<typeof cf>) => {
    setData({ companyFinance: { ...cf, ...patch } });
  };

  const handleMainIncomeNet = (v: number) => {
    setCashflowField("incomes.main", v);
    setCashflowField("incomeGross", Math.round(v / GROSS_FROM_NET_FACTOR));
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Cashflow</h2>
          <p className="text-slate-500 mt-1">Měsíční bilance domácnosti.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Příjmy</span>
            <span className="text-lg font-bold text-green-600">{formatCzk(totalInc)}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Výdaje</span>
            <span className="text-lg font-bold text-red-600">{formatCzk(totalExp)}</span>
          </div>
          <div className={`px-4 py-2 rounded-lg text-sm font-bold ${surplusVal >= 0 ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700"}`}>
            Bilance: {formatCzk(surplusVal)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-blue-800 font-bold mb-6 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-800"><ArrowDown className="w-4 h-4" /></div>
            Příjmy (měsíčně)
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="client-income-type">Klient – typ příjmu</label>
              <select
                id="client-income-type"
                value={data.cashflow.incomeType ?? "zamestnanec"}
                onChange={(e) => setCashflowField("incomeType", e.target.value)}
                className="w-full min-h-[44px] px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
              >
                <option value="zamestnanec">Zaměstnanec</option>
                <option value="osvc">OSVČ</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0">
              <InputAmount label="Čistá mzda (hlavní příjem)" value={inc.main ?? 0} onChange={handleMainIncomeNet} id="income-main" />
            </div>
            <ProvenanceBadge path="cashflow.incomes.main" data={data as unknown as Record<string, unknown>} />
          </div>
            {data.cashflow.incomeType === "zamestnanec" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Hrubá mzda (pro pojištění)</label>
                <div className="w-full pl-4 pr-12 py-2 min-h-[44px] border border-slate-200 rounded-xl bg-slate-50 text-slate-800 flex items-center">
                  {formatCzk(data.cashflow.incomeGross ?? 0)}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Vypočteno z čisté mzdy</p>
              </div>
            )}
            {data.client?.hasPartner && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="partner-income-type">Partner – typ příjmu</label>
                  <select
                    id="partner-income-type"
                    value={data.cashflow.partnerIncomeType ?? "zamestnanec"}
                    onChange={(e) => setCashflowField("partnerIncomeType", e.target.value)}
                    className="w-full min-h-[44px] px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="zamestnanec">Zaměstnanec</option>
                    <option value="osvc">OSVČ</option>
                    <option value="invalidni_duchod">Invalidní důchod</option>
                    <option value="starobni_duchod">Starobní důchod</option>
                  </select>
                </div>
                {data.cashflow.partnerIncomeType === "zamestnanec" ? (
                  <>
                    <InputAmount
                      label="Čistá mzda partnera"
                      value={inc.partner ?? 0}
                      onChange={(v) => {
                        setCashflowField("incomes.partner", v);
                        setCashflowField("partnerGross", Math.round(v / GROSS_FROM_NET_FACTOR));
                      }}
                      id="income-partner-net"
                    />
                    <div className="text-sm text-slate-600">
                      Hrubá mzda (pro pojištění): <strong>{formatCzk(data.cashflow.partnerGross ?? Math.round((inc.partner ?? 0) / GROSS_FROM_NET_FACTOR))}</strong>
                    </div>
                  </>
                ) : (
                  <InputAmount
                    label="Příjem partnera (čistého)"
                    value={inc.partner ?? 0}
                    onChange={(v) => setCashflowField("incomes.partner", v)}
                    id="income-partner"
                  />
                )}
              </>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1 flex flex-wrap items-center gap-2">
                Ostatní (nájem, dávky…)
                <ProvenanceBadge path="cashflow.incomes.otherDetails" data={data as unknown as Record<string, unknown>} />
              </label>
              <div className="space-y-2 mb-2">
                {incomeOther.map((item) => (
                  <div key={item.id} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <input
                      type="text"
                      value={item.desc}
                      onChange={(e) => updateIncomeOther(item.id, { desc: e.target.value })}
                      placeholder="Popis"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      value={item.amount || ""}
                      onChange={(e) => updateIncomeOther(item.id, { amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <span className="text-slate-500 text-sm">Kč</span>
                    <button type="button" onClick={() => removeIncomeOther(item.id)} className="min-h-[44px] text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-semibold">Odebrat</button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addIncomeOther("Ostatní", 0)}
                className="text-sm text-blue-600 font-bold flex items-center gap-1 hover:underline"
              >
                <Plus className="w-4 h-4" /> Přidat příjem
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-red-600 font-bold mb-6 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600"><ArrowUp className="w-4 h-4" /></div>
            Výdaje (měsíčně)
          </h3>
          <div className="space-y-4">
            <InputAmount label="Bydlení (nájem, hypotéka)" value={exp.housing ?? 0} onChange={(v) => setCashflowField("expenses.housing", v)} id="exp-housing" />
            <InputAmount label="Energie a služby" value={exp.energy ?? 0} onChange={(v) => setCashflowField("expenses.energy", v)} id="exp-energy" />
            <InputAmount label="Jídlo a drogerie" value={exp.food ?? 0} onChange={(v) => setCashflowField("expenses.food", v)} id="exp-food" />
            <InputAmount label="Doprava" value={exp.transport ?? 0} onChange={(v) => setCashflowField("expenses.transport", v)} id="exp-transport" />
            <InputAmount label="Děti (školka, kroužky)" value={exp.children ?? 0} onChange={(v) => setCashflowField("expenses.children", v)} id="exp-children" />
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Pojištění</label>
              <div className="space-y-2 mb-2">
                {insuranceItems.map((item) => (
                  <div key={item.id} className="flex flex-wrap gap-2 items-center bg-white rounded-lg p-3 border border-slate-100">
                    <select
                      value={item.type}
                      onChange={(e) => updateExpenseInsuranceItem(item.id, { type: e.target.value as InsuranceItemType })}
                      className="min-w-[120px] px-2 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      {INSURANCE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <select
                      value={item.insurer ?? ""}
                      onChange={(e) => updateExpenseInsuranceItem(item.id, { insurer: e.target.value || undefined })}
                      className="min-w-[140px] px-2 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      {INSURANCE_COMPANIES_CS.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={item.forPersonKey ?? ""}
                      onChange={(e) => updateExpenseInsuranceItem(item.id, { forPersonKey: e.target.value || undefined })}
                      className="min-w-[120px] px-2 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="">Pro koho?</option>
                      {personOptions.map((p) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={item.amount || ""}
                      onChange={(e) => updateExpenseInsuranceItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-24 px-2 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <span className="text-slate-500 text-sm">Kč</span>
                    <button type="button" onClick={() => removeExpenseInsuranceItem(item.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addExpenseInsuranceItem({ type: "životní", amount: 0 })}
                className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline"
              >
                <Plus className="w-4 h-4" /> Přidat pojištění
              </button>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Ostatní</label>
              <div className="space-y-2 mb-2">
                {expenseOther.map((item) => (
                  <div key={item.id} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <input
                      type="text"
                      value={item.desc}
                      onChange={(e) => updateExpenseOther(item.id, { desc: e.target.value })}
                      placeholder="Popis"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      value={item.amount || ""}
                      onChange={(e) => updateExpenseOther(item.id, { amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <span className="text-slate-500 text-sm">Kč</span>
                    <button type="button" onClick={() => removeExpenseOther(item.id)} className="min-h-[44px] text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-semibold">Odebrat</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addExpenseOther("Ostatní", 0)} className="text-sm text-red-600 font-bold flex items-center gap-1 hover:underline">
                <Plus className="w-4 h-4" /> Přidat výdaj
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
        <div className="flex gap-8 text-center md:text-left">
          <div>
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Příjmy</span>
            <div className="text-lg font-bold text-slate-900">{formatCzk(totalInc)}</div>
          </div>
          <div>
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Výdaje</span>
            <div className="text-lg font-bold text-slate-900">{formatCzk(totalExp)}</div>
          </div>
        </div>
        <div className="text-center md:text-right border-t md:border-t-0 border-slate-100 pt-4 md:pt-0">
          <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Volné cashflow (Surplus)</span>
          <div className="text-2xl font-bold text-blue-800">{formatCzk(surplusVal)}</div>
        </div>
      </div>

      {includeCompany && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center"><Building2 className="w-4 h-4 text-amber-700" /></div>
            <h3 className="text-xl font-bold text-slate-900">Finance firmy</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <InputAmount label="Roční tržby (Kč)" value={cf.revenue ?? 0} onChange={(v) => setCompanyFinance({ revenue: v })} id="cf-revenue" />
            <InputAmount label="Roční zisk / EBITDA (Kč)" value={cf.profit ?? 0} onChange={(v) => setCompanyFinance({ profit: v })} id="cf-profit" />
            <InputAmount label="Hotovostní rezerva firmy (Kč)" value={cf.reserve ?? 0} onChange={(v) => setCompanyFinance({ reserve: v })} id="cf-reserve" />
            <InputAmount label="Úvěry / Leasingy – měsíční splátka (Kč)" value={cf.loanPayment ?? 0} onChange={(v) => setCompanyFinance({ loanPayment: v })} id="cf-loan" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-4 border border-amber-100">
              <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Roční tržby</span>
              <span className="text-lg font-bold text-slate-900">{formatCzk(cf.revenue ?? 0)}</span>
            </div>
            <div className="bg-white rounded-xl p-4 border border-amber-100">
              <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Roční zisk</span>
              <span className="text-lg font-bold text-slate-900">{formatCzk(cf.profit ?? 0)}</span>
            </div>
            <div className="bg-white rounded-xl p-4 border border-amber-100">
              <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Cash runway</span>
              <span className="text-lg font-bold text-slate-900">{runway != null ? `${runway.toFixed(1)} měs.` : "—"}</span>
            </div>
            <div className="bg-white rounded-xl p-4 border border-amber-100">
              <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Dluhová služba</span>
              <span className="text-lg font-bold text-slate-900">{formatCzk(cf.loanPayment ?? 0)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center"><Shield className="w-4 h-4 text-indigo-500" /></div>
          <h3 className="text-xl font-bold text-slate-900">Finanční rezerva</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <InputAmount
              label="Aktuální hotovost (spořící účet)"
              value={data.cashflow.reserveCash}
              onChange={(v) => setCashflowField("reserveCash", v)}
              id="asset-cash-quick"
            />
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Cílová rezerva (počet měsíců výdajů)</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={3}
                  max={12}
                  step={1}
                  value={data.cashflow.reserveTargetMonths}
                  onChange={(e) => setCashflowField("reserveTargetMonths", parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <span className="font-bold text-slate-900 min-w-[3rem] text-center bg-slate-100 px-2 py-1 rounded">{data.cashflow.reserveTargetMonths}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-1 px-1">
                <span>3 měsíce</span>
                <span>12 měsíců</span>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-slate-500 uppercase tracking-wide">Cíl rezervy</span>
              <span className="font-bold text-slate-900">{formatCzk(reserveTargetVal)}</span>
            </div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200">
              <span className="text-sm font-bold text-slate-500 uppercase tracking-wide">Chybí doplnit</span>
              <span className="font-bold text-indigo-600 text-lg">{formatCzk(reserveGapVal)}</span>
            </div>
            {isReserveMet && (
              <div className="mt-4 text-center">
                <span className="inline-block bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-sm font-bold border border-green-200">
                  Rezerva splněna
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
