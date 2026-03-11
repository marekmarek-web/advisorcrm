"use client";

import { useState } from "react";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { CREDIT_WISH_BANKS } from "@/lib/analyses/financial/constants";
import { monthlyPayment, totalRepayment } from "@/lib/analyses/financial/calculations";
import { formatCzk } from "@/lib/analyses/financial/formatters";
import { CreditCard, Plus, Trash2 } from "lucide-react";

const PRODUCT_OPTIONS = [
  { value: "hypoteka", label: "Hypotéka" },
  { value: "uver", label: "Úvěr" },
] as const;

export function StepCredits() {
  const data = useStore((s) => s.data);
  const addCreditWish = useStore((s) => s.addCreditWish);
  const removeCreditWish = useStore((s) => s.removeCreditWish);

  const [product, setProduct] = useState<"hypoteka" | "uver">("hypoteka");
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState(0);
  const [termYears, setTermYears] = useState(20);
  const [fixYears, setFixYears] = useState(5);
  const [selectedBankId, setSelectedBankId] = useState(CREDIT_WISH_BANKS[0]?.id ?? "");
  const [customRate, setCustomRate] = useState<number | "">("");
  const [ltvPercent, setLtvPercent] = useState<number | "">("");
  const [akoPercent, setAkoPercent] = useState<number | "">("");

  const bank = CREDIT_WISH_BANKS.find((b) => b.id === selectedBankId);
  const ratePercent = customRate !== "" ? Number(customRate) : (product === "hypoteka" ? bank?.rateHypo : bank?.rateLoan) ?? 0;
  const estimatedMonthly = monthlyPayment(amount, ratePercent, termYears);
  const estimatedTotal = totalRepayment(estimatedMonthly, termYears);

  const handleAdd = () => {
    addCreditWish({
      product: product === "hypoteka" ? "hypotéka" : "úvěr",
      subType: product === "hypoteka" ? "hypotéka" : "úvěr",
      purpose: purpose || (product === "hypoteka" ? "Bydlení" : "Ostatní"),
      selectedBankId: (selectedBankId || CREDIT_WISH_BANKS[0]?.id) ?? "",
      amount,
      termYears,
      fixYears,
      estimatedRate: ratePercent,
      estimatedMonthly,
      estimatedTotal,
      ...(ltvPercent !== "" && { ltvPercent: Number(ltvPercent) }),
      ...(akoPercent !== "" && { akoPercent: Number(akoPercent) }),
      ...(customRate !== "" && { customRate: Number(customRate) }),
    });
    setAmount(0);
    setPurpose("");
  };

  const list = data.newCreditWishList || [];

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Úvěry k vyřízení</h2>
        <p className="text-slate-500 mt-1">Přání na hypotéku nebo úvěr – částka, doba, sazba a odhad splátky.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-slate-800 font-bold mb-6 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-600" />
            Nový úvěr / hypotéka
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Produkt</label>
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value as "hypoteka" | "uver")}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl"
              >
                {PRODUCT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Účel</label>
              <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Bydlení, auto, rekonstrukce…" className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Částka (Kč)</label>
              <input type="number" value={amount || ""} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Doba splácení (roky)</label>
                <input type="number" min={1} max={30} value={termYears} onChange={(e) => setTermYears(parseInt(e.target.value, 10) || 1)} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Fixace (roky)</label>
                <input type="number" min={0} max={30} value={fixYears} onChange={(e) => setFixYears(parseInt(e.target.value, 10) || 0)} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Banka</label>
              <select value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl">
                {CREDIT_WISH_BANKS.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Vlastní sazba (%) – volitelně</label>
              <input type="number" step={0.01} value={customRate === "" ? "" : customRate} onChange={(e) => setCustomRate(e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder={product === "hypoteka" ? (bank?.rateHypo?.toString() ?? "") : (bank?.rateLoan?.toString() ?? "")} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
            </div>
            {product === "hypoteka" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">LTV (%)</label>
                  <input type="number" min={0} max={100} value={ltvPercent === "" ? "" : ltvPercent} onChange={(e) => setLtvPercent(e.target.value === "" ? "" : parseFloat(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">AKO (%)</label>
                  <input type="number" min={0} max={100} value={akoPercent === "" ? "" : akoPercent} onChange={(e) => setAkoPercent(e.target.value === "" ? "" : parseFloat(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl p-4 border border-slate-100">
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-500">Odhadovaná sazba</span><span className="font-bold">{ratePercent.toFixed(2)} %</span></div>
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-500">Měsíční splátka</span><span className="font-bold text-amber-700">{formatCzk(estimatedMonthly)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Celkem splátek</span><span className="font-bold text-slate-700">{formatCzk(estimatedTotal)}</span></div>
            </div>
            <button type="button" onClick={handleAdd} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600">
              <Plus className="w-5 h-5" /> Přidat úvěr / hypotéku
            </button>
          </div>
        </div>

        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-slate-800 font-bold mb-4">Přidané položky</h3>
          {list.length === 0 ? (
            <p className="text-slate-500 text-sm">Zatím nic. Přidejte úvěr nebo hypotéku v levém formuláři.</p>
          ) : (
            <ul className="space-y-3">
              {list.map((item) => (
                <li key={item.id} className="bg-white rounded-xl p-4 border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800">{item.product} – {item.purpose}</div>
                    <div className="text-sm text-slate-500">{formatCzk(item.amount)} · {item.termYears} let · {item.estimatedRate.toFixed(1)} %</div>
                    <div className="text-sm font-bold text-amber-700 mt-1">Splátka {formatCzk(item.estimatedMonthly)}/měs.</div>
                  </div>
                  <button type="button" onClick={() => removeCreditWish(item.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg shrink-0" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
