"use client";

import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectTotalAssets, selectTotalLiabilities, selectNetWorth } from "@/lib/analyses/financial/selectors";
import { formatCzk } from "@/lib/analyses/financial/formatters";
import { Building2, Landmark, Plus, Trash2 } from "lucide-react";

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
          className="w-full pl-4 pr-12 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-400"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">Kč</span>
      </div>
    </div>
  );
}

export function StepAssetsLiabilities() {
  const data = useStore((s) => s.data);
  const setAssetsField = useStore((s) => s.setAssetsField);
  const addAssetInvestment = useStore((s) => s.addAssetInvestment);
  const updateAssetInvestment = useStore((s) => s.updateAssetInvestment);
  const removeAssetInvestment = useStore((s) => s.removeAssetInvestment);
  const addAssetPension = useStore((s) => s.addAssetPension);
  const updateAssetPension = useStore((s) => s.updateAssetPension);
  const removeAssetPension = useStore((s) => s.removeAssetPension);
  const setLiabilitiesField = useStore((s) => s.setLiabilitiesField);
  const addLoan = useStore((s) => s.addLoan);
  const removeLoan = useStore((s) => s.removeLoan);

  const totalAssets = selectTotalAssets(data);
  const totalLiabilities = selectTotalLiabilities(data);
  const netWorthVal = selectNetWorth(data);

  const assets = data.assets;
  const liab = data.liabilities;

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Bilance</h2>
          <p className="text-slate-500 mt-1">Aktiva a pasiva domácnosti.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Aktiva</span>
            <span className="text-lg font-bold text-green-600">{formatCzk(totalAssets)}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Pasiva</span>
            <span className="text-lg font-bold text-red-600">{formatCzk(totalLiabilities)}</span>
          </div>
          <div className={`px-4 py-2 rounded-lg text-sm font-bold ${netWorthVal >= 0 ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700"}`}>
            Čisté jmění: {formatCzk(netWorthVal)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-green-800 font-bold mb-6 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center"><Landmark className="w-4 h-4 text-green-600" /></div>
            Aktiva
          </h3>
          <div className="space-y-4">
            <InputAmount label="Hotovost (účty, hotovost)" value={assets.cash} onChange={(v) => setAssetsField("cash", v)} id="asset-cash" />
            <InputAmount label="Nemovitosti (odhad)" value={assets.realEstate} onChange={(v) => setAssetsField("realEstate", v)} id="asset-realestate" />
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Investice (jednotky, podíly)</label>
              <div className="space-y-2 mb-2">
                {(assets.investmentsList || []).map((item) => (
                  <div key={item.id} className="flex flex-wrap gap-2 items-center bg-white rounded-lg p-2 border border-slate-100">
                    <input type="text" value={item.type || ""} onChange={(e) => updateAssetInvestment(item.id, { type: e.target.value })} placeholder="Typ" className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded text-sm" />
                    <input type="number" value={item.value || ""} onChange={(e) => updateAssetInvestment(item.id, { value: parseFloat(e.target.value) || 0 })} placeholder="0" className="w-28 px-2 py-1.5 border border-slate-200 rounded text-sm" />
                    <span className="text-slate-500 text-sm">Kč</span>
                    <button type="button" onClick={() => removeAssetInvestment(item.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addAssetInvestment("Investice", 0)} className="text-sm text-green-600 font-bold flex items-center gap-1 hover:underline">
                <Plus className="w-4 h-4" /> Přidat investici
              </button>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Důchody / penze (souhrn)</label>
              <div className="space-y-2 mb-2">
                {(assets.pensionList || []).map((item) => (
                  <div key={item.id} className="flex flex-wrap gap-2 items-center bg-white rounded-lg p-2 border border-slate-100">
                    <input type="text" value={item.type || ""} onChange={(e) => updateAssetPension(item.id, { type: e.target.value })} placeholder="Typ" className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded text-sm" />
                    <input type="number" value={item.value || ""} onChange={(e) => updateAssetPension(item.id, { value: parseFloat(e.target.value) || 0 })} placeholder="0" className="w-28 px-2 py-1.5 border border-slate-200 rounded text-sm" />
                    <span className="text-slate-500 text-sm">Kč</span>
                    <button type="button" onClick={() => removeAssetPension(item.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addAssetPension("Penze", 0)} className="text-sm text-green-600 font-bold flex items-center gap-1 hover:underline">
                <Plus className="w-4 h-4" /> Přidat penzi
              </button>
            </div>
            <InputAmount label="Ostatní aktiva" value={assets.other} onChange={(v) => setAssetsField("other", v)} id="asset-other" />
          </div>
        </div>

        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-red-800 font-bold mb-6 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><Building2 className="w-4 h-4 text-red-600" /></div>
            Pasiva
          </h3>
          <div className="space-y-4">
            <InputAmount label="Hypotéka (zbývající dlužná částka)" value={liab.mortgage} onChange={(v) => setLiabilitiesField("mortgage", v)} id="liab-mortgage" />
            <div className="grid grid-cols-3 gap-2">
              <InputAmount label="Úroková sazba (%)" value={liab.mortgageDetails?.rate ?? 0} onChange={(v) => setLiabilitiesField("mortgageDetails.rate", v)} id="liab-mortgage-rate" />
              <InputAmount label="Fixace (roky)" value={liab.mortgageDetails?.fix ?? 0} onChange={(v) => setLiabilitiesField("mortgageDetails.fix", v)} id="liab-mortgage-fix" />
              <InputAmount label="Měsíční splátka (Kč)" value={liab.mortgageDetails?.pay ?? 0} onChange={(v) => setLiabilitiesField("mortgageDetails.pay", v)} id="liab-mortgage-pay" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="liab-mortgage-provider">Poskytovatel hypotéky</label>
              <input id="liab-mortgage-provider" type="text" value={liab.mortgageProvider ?? ""} onChange={(e) => setLiabilitiesField("mortgageProvider", e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Úvěry (kromě hypotéky)</label>
              <div className="space-y-2 mb-2">
                {(liab.loansList || []).map((loan) => (
                  <div key={loan.id} className="flex flex-wrap gap-2 items-center bg-white rounded-lg p-3 border border-slate-100">
                    <span className="text-slate-600 text-sm">{loan.desc || "Úvěr"}</span>
                    <span className="font-semibold text-slate-800">{formatCzk(Number(loan.balance) || 0)}</span>
                    {loan.pay != null && <span className="text-slate-500 text-sm">splátka {formatCzk(Number(loan.pay))}</span>}
                    <button type="button" onClick={() => removeLoan(loan.id)} className="ml-auto min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addLoan({ balance: 0, desc: "Úvěr" })} className="text-sm text-red-600 font-bold flex items-center gap-1 hover:underline">
                <Plus className="w-4 h-4" /> Přidat úvěr
              </button>
            </div>
            <InputAmount label="Ostatní pasiva" value={liab.other} onChange={(v) => setLiabilitiesField("other", v)} id="liab-other" />
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="liab-other-desc">Popis ostatních pasiv</label>
              <input id="liab-other-desc" type="text" value={liab.otherDesc ?? ""} onChange={(e) => setLiabilitiesField("otherDesc", e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex gap-8 text-center sm:text-left">
          <div>
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Celková aktiva</span>
            <div className="text-lg font-bold text-green-600">{formatCzk(totalAssets)}</div>
          </div>
          <div>
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Celková pasiva</span>
            <div className="text-lg font-bold text-red-600">{formatCzk(totalLiabilities)}</div>
          </div>
        </div>
        <div className="text-center sm:text-right border-t sm:border-t-0 border-slate-100 pt-4 sm:pt-0">
          <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Čisté jmění</span>
          <div className={`text-2xl font-bold ${netWorthVal >= 0 ? "text-slate-900" : "text-red-700"}`}>{formatCzk(netWorthVal)}</div>
        </div>
      </div>
    </>
  );
}
