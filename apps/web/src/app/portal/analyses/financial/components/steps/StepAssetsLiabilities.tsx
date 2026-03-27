"use client";

import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectTotalAssets, selectTotalLiabilities, selectNetWorth } from "@/lib/analyses/financial/selectors";
import { formatCzk } from "@/lib/analyses/financial/formatters";
import { getMortgageProviderOptions, getLoanProvidersByType, LOAN_TYPES, INVESTMENT_ASSET_TYPES, PENSION_ASSET_TYPES } from "@/lib/analyses/financial/constants";
import { Building2, Landmark, Plus, Trash2 } from "lucide-react";
import { ProvenanceBadge } from "../ProvenanceBadge";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";

const REAL_ESTATE_LABELS = ['Byt', 'Rodinný dům', 'Garáž', 'Pozemek', 'Komerční', 'Jiná nemovitost'] as const;
const mortgageProviders = getMortgageProviderOptions();

function InputAmount({
  label,
  value,
  onChange,
  id,
}: { label: string; value: number; onChange: (v: number) => void; id: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type="number"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full pl-4 pr-12 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl focus:ring-2 focus:ring-indigo-400"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)] text-sm font-bold">Kč</span>
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
  const addRealEstateItem = useStore((s) => s.addRealEstateItem);
  const updateRealEstateItem = useStore((s) => s.updateRealEstateItem);
  const removeRealEstateItem = useStore((s) => s.removeRealEstateItem);
  const setLiabilitiesField = useStore((s) => s.setLiabilitiesField);
  const addLoan = useStore((s) => s.addLoan);
  const updateLoan = useStore((s) => s.updateLoan);
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
          <h2 className="text-2xl sm:text-3xl font-bold text-[color:var(--wp-text)]">Bilance</h2>
          <p className="text-[color:var(--wp-text-secondary)] mt-1">Aktiva a pasiva domácnosti.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider block">Aktiva</span>
            <span className="text-lg font-bold text-green-600">{formatCzk(totalAssets)}</span>
          </div>
          <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider block">Pasiva</span>
            <span className="text-lg font-bold text-red-600">{formatCzk(totalLiabilities)}</span>
          </div>
          <div className={`rounded-lg px-4 py-2 text-sm font-bold ${netWorthVal >= 0 ? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]" : "bg-red-50 text-red-700 dark:bg-red-950/45 dark:text-red-200"}`}>
            Čisté jmění: {formatCzk(netWorthVal)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
          <h3 className="text-green-800 font-bold mb-6 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center"><Landmark className="w-4 h-4 text-green-600" /></div>
            Aktiva
          </h3>
          <div className="space-y-4">
            <InputAmount label="Účty a hotovost" value={assets.cash} onChange={(v) => setAssetsField("cash", v)} id="asset-cash" />
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Nemovitosti</label>
              <div className="space-y-2 mb-2">
                {(assets.realEstateItems ?? []).map((item) => (
                  <div key={item.id} className="flex flex-wrap gap-2 items-center bg-[color:var(--wp-surface-card)] rounded-lg p-3 border border-[color:var(--wp-surface-card-border)]">
                    <div className="min-w-[140px] flex-1 sm:flex-none">
                      <CustomDropdown
                        value={item.label}
                        onChange={(id) => updateRealEstateItem(item.id, { label: id })}
                        options={REAL_ESTATE_LABELS.map((l) => ({ id: l, label: l }))}
                      />
                    </div>
                    <input
                      type="number"
                      value={item.value || ""}
                      onChange={(e) => updateRealEstateItem(item.id, { value: parseFloat(e.target.value) || 0 })}
                      placeholder="Hodnota"
                      className="w-32 px-2 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm"
                    />
                    <span className="text-[color:var(--wp-text-secondary)] text-sm">Kč</span>
                    <button type="button" onClick={() => removeRealEstateItem(item.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 dark:hover:text-red-400" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addRealEstateItem("Byt", 0)} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                <Plus className="w-4 h-4" /> Přidat nemovitost
              </button>
              {assets.realEstate > 0 && (
                <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">Celkem nemovitosti: {formatCzk(assets.realEstate)}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Investice (Akcie, Fondy, Dluhopisy, Krypto, ETF)</label>
              <div className="space-y-2 mb-2">
                {(assets.investmentsList || []).map((item) => (
                  <div key={item.id} className="flex flex-wrap gap-2 items-center bg-[color:var(--wp-surface-card)] rounded-lg p-3 border border-[color:var(--wp-surface-card-border)]">
                    <div className="min-w-[140px] flex-1 sm:flex-none">
                      <CustomDropdown
                        value={item.type || "Akcie"}
                        onChange={(id) => updateAssetInvestment(item.id, { type: id })}
                        options={INVESTMENT_ASSET_TYPES.map((t) => ({ id: t, label: t }))}
                      />
                    </div>
                    <input type="number" value={item.value || ""} onChange={(e) => updateAssetInvestment(item.id, { value: parseFloat(e.target.value) || 0 })} placeholder="0" className="w-28 px-2 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm" />
                    <span className="text-[color:var(--wp-text-secondary)] text-sm">Kč</span>
                    <input type="text" value={item.note ?? ""} onChange={(e) => updateAssetInvestment(item.id, { note: e.target.value })} placeholder="Poznámka" className="flex-1 min-w-0 px-2 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm" />
                    <button type="button" onClick={() => removeAssetInvestment(item.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 dark:hover:text-red-400" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addAssetInvestment("Akcie", 0)} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                <Plus className="w-4 h-4" /> Přidat investici
              </button>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Penzijní / DIP / DPS</label>
              <div className="space-y-2 mb-2">
                {(assets.pensionList || []).map((item) => (
                  <div key={item.id} className="flex flex-wrap gap-2 items-center bg-[color:var(--wp-surface-card)] rounded-lg p-3 border border-[color:var(--wp-surface-card-border)]">
                    <div className="min-w-[100px] flex-1 sm:flex-none">
                      <CustomDropdown
                        value={item.type || "DPS"}
                        onChange={(id) => updateAssetPension(item.id, { type: id })}
                        options={PENSION_ASSET_TYPES.map((t) => ({ id: t, label: t }))}
                      />
                    </div>
                    <input type="number" value={item.value || ""} onChange={(e) => updateAssetPension(item.id, { value: parseFloat(e.target.value) || 0 })} placeholder="0" className="w-28 px-2 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm" />
                    <span className="text-[color:var(--wp-text-secondary)] text-sm">Kč</span>
                    <input type="text" value={item.note ?? ""} onChange={(e) => updateAssetPension(item.id, { note: e.target.value })} placeholder="Poznámka / detail" className="flex-1 min-w-0 px-2 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm" />
                    <button type="button" onClick={() => removeAssetPension(item.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 dark:hover:text-red-400" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addAssetPension("DPS", 0)} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                <Plus className="w-4 h-4" /> Přidat penzijní produkt
              </button>
            </div>
            <InputAmount label="Ostatní aktiva" value={assets.other} onChange={(v) => setAssetsField("other", v)} id="asset-other" />
          </div>
        </div>

        <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
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
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1" htmlFor="liab-mortgage-provider">Poskytovatel hypotéky</label>
              <CustomDropdown
                value={liab.mortgageProvider ?? ""}
                onChange={(id) => setLiabilitiesField("mortgageProvider", id)}
                placeholder="— Vyberte banku —"
                options={[
                  { id: "", label: "— Vyberte banku —" },
                  ...mortgageProviders.map((name) => ({ id: name, label: name })),
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Úvěry (kromě hypotéky)</label>
              <div className="space-y-2 mb-2">
                {(liab.loansList || []).map((loan) => {
                  const loanProviders = getLoanProvidersByType(loan.type ?? LOAN_TYPES[0]);
                  return (
                  <div key={loan.id} className="flex flex-wrap gap-2 items-stretch bg-[color:var(--wp-surface-card)] rounded-lg p-3 border border-[color:var(--wp-surface-card-border)]">
                    <div className="min-w-[160px] flex-1 sm:flex-none">
                      <CustomDropdown
                        value={loan.type ?? LOAN_TYPES[0]}
                        onChange={(id) => updateLoan(loan.id, { type: id, provider: "" })}
                        options={LOAN_TYPES.map((t) => ({ id: t, label: t }))}
                      />
                    </div>
                    <div className="min-w-[160px] flex-1 sm:flex-none">
                      <CustomDropdown
                        value={loan.provider ?? ""}
                        onChange={(id) => updateLoan(loan.id, { provider: id })}
                        placeholder="— Poskytovatel —"
                        options={[
                          { id: "", label: "— Poskytovatel —" },
                          ...loanProviders.map((name) => ({ id: name, label: name })),
                        ]}
                      />
                    </div>
                    <input type="number" value={Number(loan.balance) || ""} onChange={(e) => updateLoan(loan.id, { balance: parseFloat(e.target.value) || 0 })} placeholder="Zůstatek" className="w-28 px-2 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm" />
                    <span className="text-[color:var(--wp-text-secondary)] text-sm flex items-center">Kč</span>
                    <input type="number" value={Number(loan.rate) || ""} onChange={(e) => updateLoan(loan.id, { rate: parseFloat(e.target.value) || 0 })} placeholder="Sazba %" className="w-20 px-2 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm" />
                    <input type="number" value={Number(loan.pay) || ""} onChange={(e) => updateLoan(loan.id, { pay: parseFloat(e.target.value) || 0 })} placeholder="Splátka" className="w-24 px-2 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm" />
                    <button type="button" onClick={() => removeLoan(loan.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 dark:hover:text-red-400" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => addLoan({ type: LOAN_TYPES[0], provider: "", balance: 0 })} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                <Plus className="w-4 h-4" /> Přidat úvěr
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-0">
                <InputAmount label="Ostatní pasiva" value={liab.other} onChange={(v) => setLiabilitiesField("other", v)} id="liab-other" />
              </div>
              <ProvenanceBadge path="liabilities.other" data={data as unknown as Record<string, unknown>} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1" htmlFor="liab-other-desc">Popis ostatních pasiv</label>
              <input id="liab-other-desc" type="text" value={liab.otherDesc ?? ""} onChange={(e) => setLiabilitiesField("otherDesc", e.target.value)} className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex gap-8 text-center sm:text-left">
          <div>
            <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider">Celková aktiva</span>
            <div className="text-lg font-bold text-green-600">{formatCzk(totalAssets)}</div>
          </div>
          <div>
            <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider">Celková pasiva</span>
            <div className="text-lg font-bold text-red-600">{formatCzk(totalLiabilities)}</div>
          </div>
        </div>
        <div className="text-center sm:text-right border-t sm:border-t-0 border-[color:var(--wp-surface-card-border)] pt-4 sm:pt-0">
          <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider">Čisté jmění</span>
          <div className={`text-2xl font-bold ${netWorthVal >= 0 ? "text-[color:var(--wp-text)]" : "text-red-700"}`}>{formatCzk(netWorthVal)}</div>
        </div>
      </div>
    </>
  );
}
