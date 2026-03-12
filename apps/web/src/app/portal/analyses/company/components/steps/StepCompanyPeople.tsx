"use client";

import { useCompanyFaStore } from "@/lib/analyses/company-fa/store";

function num(v: unknown, def: number): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") return parseInt(v, 10) || def;
  return def;
}

export function StepCompanyPeople() {
  const payload = useCompanyFaStore((s) => s.payload);
  const setDirector = useCompanyFaStore((s) => s.setDirector);
  const addDirector = useCompanyFaStore((s) => s.addDirector);
  const removeDirector = useCompanyFaStore((s) => s.removeDirector);
  const directors = payload.directors ?? [];

  return (
    <section className="p-4 md:p-6 bg-white rounded-xl border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-slate-800">Jednatelé</h3>
        <button
          type="button"
          onClick={addDirector}
          className="min-h-[44px] px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200"
        >
          Přidat jednatele
        </button>
      </div>
      <div className="space-y-4">
        {directors.map((d, i) => (
          <div key={i} className="p-4 border border-slate-200 rounded-lg space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-medium text-slate-700">Jednatel {i + 1}</span>
              <button
                type="button"
                onClick={() => removeDirector(i)}
                className="text-sm text-red-600 hover:underline min-h-[44px] flex items-center"
              >
                Odebrat
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label>
                <span className="block text-sm text-slate-600 mb-1">Jméno</span>
                <input
                  type="text"
                  value={d.name ?? ""}
                  onChange={(e) => setDirector(i, { name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </label>
              <label>
                <span className="block text-sm text-slate-600 mb-1">Věk</span>
                <input
                  type="number"
                  min={0}
                  value={d.age ?? ""}
                  onChange={(e) =>
                    setDirector(i, { age: e.target.value === "" ? null : num(e.target.value, 0) })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </label>
              <label>
                <span className="block text-sm text-slate-600 mb-1">Podíl (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={d.share ?? 100}
                  onChange={(e) => setDirector(i, { share: num(e.target.value, 100) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </label>
              <label>
                <span className="block text-sm text-slate-600 mb-1">Čistý měsíční příjem (Kč)</span>
                <input
                  type="number"
                  min={0}
                  value={d.netIncome ?? 0}
                  onChange={(e) => setDirector(i, { netIncome: num(e.target.value, 0) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </label>
              <label className="sm:col-span-2 flex items-center gap-2 min-h-[44px]">
                <input
                  type="checkbox"
                  checked={d.hasSpouse ?? false}
                  onChange={(e) => setDirector(i, { hasSpouse: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-600">Manžel/ka</span>
              </label>
              <label>
                <span className="block text-sm text-slate-600 mb-1">Počet dětí</span>
                <input
                  type="number"
                  min={0}
                  value={d.childrenCount ?? 0}
                  onChange={(e) => setDirector(i, { childrenCount: num(e.target.value, 0) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </label>
              <label>
                <span className="block text-sm text-slate-600 mb-1">Typ příjmu</span>
                <select
                  value={d.incomeType ?? "employee"}
                  onChange={(e) =>
                    setDirector(i, { incomeType: e.target.value as "employee" | "osvc" })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                >
                  <option value="employee">Zaměstnanec</option>
                  <option value="osvc">OSVČ</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
