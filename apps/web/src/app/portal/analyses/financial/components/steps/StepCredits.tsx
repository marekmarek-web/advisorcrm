"use client";

import { useState } from "react";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { CREDIT_WISH_BANKS, CREDIT_PURPOSE_OPTIONS, LTV_OPTIONS } from "@/lib/analyses/financial/constants";
import { monthlyPayment, totalRepayment, ownResourcesFromLtv } from "@/lib/analyses/financial/calculations";
import { formatCzk } from "@/lib/analyses/financial/formatters";
import { CreditCard, Plus, Trash2 } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";

const PRODUCT_OPTIONS = [
  { value: "hypoteka", label: "Hypotéka" },
  { value: "uver", label: "Úvěr" },
] as const;

const FIX_YEARS_OPTIONS = [3, 5, 7, 10] as const;

export function StepCredits() {
  const data = useStore((s) => s.data);
  const addCreditWish = useStore((s) => s.addCreditWish);
  const removeCreditWish = useStore((s) => s.removeCreditWish);

  const [product, setProduct] = useState<"hypoteka" | "uver">("hypoteka");
  const [purpose, setPurpose] = useState(CREDIT_PURPOSE_OPTIONS[0]?.value ?? "");
  const [amount, setAmount] = useState(0);
  const [termYears, setTermYears] = useState(25);
  const [fixYears, setFixYears] = useState(5);
  const [selectedBankId, setSelectedBankId] = useState(CREDIT_WISH_BANKS[0]?.id ?? "");
  const [customRate, setCustomRate] = useState<number | "">("");
  const [ltvPercent, setLtvPercent] = useState<number | "">(90);
  const [akoPercent, setAkoPercent] = useState<number | "">("");

  const bank = CREDIT_WISH_BANKS.find((b) => b.id === selectedBankId);
  const ratePercent = customRate !== "" ? Number(customRate) : (product === "hypoteka" ? bank?.rateHypo : bank?.rateLoan) ?? 0;
  const estimatedMonthly = monthlyPayment(amount, ratePercent, termYears);
  const estimatedTotal = totalRepayment(estimatedMonthly, termYears);

  const ownResources = amount > 0 && ltvPercent !== "" && product === "hypoteka"
    ? ownResourcesFromLtv(amount, Number(ltvPercent))
    : 0;

  const handleAdd = () => {
    addCreditWish({
      product: product === "hypoteka" ? "hypotéka" : "úvěr",
      subType: product === "hypoteka" ? "hypotéka" : "úvěr",
      purpose: purpose || CREDIT_PURPOSE_OPTIONS[0]?.value || "ostatni",
      selectedBankId: (selectedBankId || CREDIT_WISH_BANKS[0]?.id) ?? "",
      amount,
      termYears,
      fixYears,
      estimatedRate: ratePercent,
      estimatedMonthly,
      estimatedTotal,
      ...(ltvPercent !== "" && product === "hypoteka" && { ltvPercent: Number(ltvPercent), ownResources }),
      ...(akoPercent !== "" && { akoPercent: Number(akoPercent) }),
      ...(customRate !== "" && { customRate: Number(customRate) }),
    });
    setAmount(0);
    setPurpose(CREDIT_PURPOSE_OPTIONS[0]?.value ?? "");
  };

  const list = data.newCreditWishList || [];

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-[color:var(--wp-text)]">Úvěry k vyřízení</h2>
        <p className="text-[color:var(--wp-text-secondary)] mt-1">Přání na hypotéku nebo úvěr – částka, doba, sazba a odhad splátky.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
          <h3 className="text-[color:var(--wp-text)] font-bold mb-6 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            Nový úvěr / hypotéka
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Produkt</label>
              <CustomDropdown
                value={product}
                onChange={(id) => setProduct(id as "hypoteka" | "uver")}
                options={PRODUCT_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Účel</label>
              <CustomDropdown
                value={purpose}
                onChange={setPurpose}
                options={CREDIT_PURPOSE_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Částka (Kč)</label>
              <input type="number" value={amount || ""} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Doba splácení (roky)</label>
                <input type="number" min={1} max={35} value={termYears} onChange={(e) => setTermYears(parseInt(e.target.value, 10) || 1)} className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Fixace úroku</label>
                <CustomDropdown
                  value={String(fixYears)}
                  onChange={(id) => setFixYears(parseInt(id, 10) as (typeof FIX_YEARS_OPTIONS)[number])}
                  options={FIX_YEARS_OPTIONS.map((y) => ({ id: String(y), label: `${y} let` }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Banka</label>
              <CustomDropdown
                value={selectedBankId}
                onChange={setSelectedBankId}
                options={CREDIT_WISH_BANKS.map((b) => ({ id: b.id, label: b.name }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Vlastní sazba (%) – volitelně</label>
              <input type="number" step={0.01} value={customRate === "" ? "" : customRate} onChange={(e) => setCustomRate(e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder={product === "hypoteka" ? (bank?.rateHypo?.toString() ?? "") : (bank?.rateLoan?.toString() ?? "")} className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl" />
            </div>
            {product === "hypoteka" && (
              <div>
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-2">Vlastní zdroje – LTV</label>
                <div className="flex flex-wrap gap-2">
                  {LTV_OPTIONS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setLtvPercent(pct)}
                      className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${ltvPercent === pct ? "bg-indigo-500 border-indigo-500 text-white" : "bg-[color:var(--wp-surface-card)] border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:border-indigo-300"}`}
                    >
                      {pct} %
                    </button>
                  ))}
                </div>
                {amount > 0 && ltvPercent !== "" && (
                  <p className="text-xs text-[color:var(--wp-text-secondary)] mt-2">Vlastní zdroje: {formatCzk(ownResources)}</p>
                )}
              </div>
            )}
            <div className="bg-[color:var(--wp-surface-card)] rounded-xl p-4 border border-[color:var(--wp-surface-card-border)]">
              <div className="flex justify-between text-sm mb-1"><span className="text-[color:var(--wp-text-secondary)]">Odhadovaná sazba</span><span className="font-bold">{ratePercent.toFixed(2)} %</span></div>
              <div className="flex justify-between text-sm mb-1"><span className="text-[color:var(--wp-text-secondary)]">Měsíční splátka</span><span className="font-bold text-indigo-700">{formatCzk(estimatedMonthly)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-[color:var(--wp-text-secondary)]">Celkem splátek</span><span className="font-bold text-[color:var(--wp-text-secondary)]">{formatCzk(estimatedTotal)}</span></div>
            </div>
            <button type="button" onClick={handleAdd} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500">
              <Plus className="w-5 h-5" /> Přidat úvěr / hypotéku
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="sticky top-4 rounded-2xl border border-white/10 bg-[#111827] p-6 text-white shadow-xl dark:bg-[#0a0f1a]">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Přibližná měsíční splátka od</p>
            <p className="mb-6 text-4xl font-black">
              {amount > 0 ? formatCzk(estimatedMonthly) : "—"}{" "}
              <span className="text-xl font-medium text-white/70">Kč</span>
            </p>
            <div className="space-y-2 border-t border-white/10 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/60">Odhad úroku</span>
                <span className="font-bold text-indigo-400">{ratePercent.toFixed(2)} %</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">Celkem zaplatíte</span>
                <span className="font-bold">{amount > 0 ? formatCzk(estimatedTotal) : "—"}</span>
              </div>
            </div>
          </div>
          <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
          <h3 className="text-[color:var(--wp-text)] font-bold mb-4">Přidané položky</h3>
          {list.length === 0 ? (
            <p className="text-[color:var(--wp-text-secondary)] text-sm">Zatím nic. Přidejte úvěr nebo hypotéku v levém formuláři.</p>
          ) : (
            <ul className="space-y-3">
              {list.map((item) => (
                <li key={item.id} className="bg-[color:var(--wp-surface-card)] rounded-xl p-4 border border-[color:var(--wp-surface-card-border)] flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[color:var(--wp-text)]">{item.product} – {item.purpose}</div>
                    <div className="text-sm text-[color:var(--wp-text-secondary)]">{formatCzk(item.amount)} · {item.termYears} let · {item.estimatedRate.toFixed(1)} %</div>
                    <div className="text-sm font-bold text-indigo-700 mt-1">Splátka {formatCzk(item.estimatedMonthly)}/měs.</div>
                  </div>
                  <button type="button" onClick={() => removeCreditWish(item.id)} className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 dark:hover:text-red-400" aria-label="Odebrat"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>
      </div>
    </>
  );
}
