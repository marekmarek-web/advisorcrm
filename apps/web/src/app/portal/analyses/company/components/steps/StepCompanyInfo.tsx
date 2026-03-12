"use client";

import { useCompanyFaStore } from "@/lib/analyses/company-fa/store";
import { step1Kpi } from "@/lib/analyses/company-fa/calculations";

const INDUSTRIES = [
  "office",
  "services",
  "light-manufacturing",
  "heavy-manufacturing",
  "construction",
  "transport",
] as const;

const RISK_LABELS: Record<string, string> = {
  low: "Nízká",
  medium: "Střední",
  high: "Vysoká",
};

function num(v: unknown, def: number): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") return parseInt(v, 10) || def;
  return def;
}

export function StepCompanyInfo() {
  const payload = useCompanyFaStore((s) => s.payload);
  const setCompany = useCompanyFaStore((s) => s.setCompany);
  const company = payload.company ?? {};
  const kpi = step1Kpi(payload);

  return (
    <section className="p-4 md:p-6 bg-white rounded-xl border border-slate-200">
      <h3 className="text-lg font-medium text-slate-800 mb-4">Firma</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="sm:col-span-2">
          <span className="block text-sm font-medium text-slate-600 mb-1">Název</span>
          <input
            type="text"
            value={company.name ?? ""}
            onChange={(e) => setCompany({ name: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
          />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-600 mb-1">IČO</span>
          <input
            type="text"
            value={company.ico ?? ""}
            onChange={(e) => setCompany({ ico: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
          />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-600 mb-1">Obor</span>
          <select
            value={company.industry ?? ""}
            onChange={(e) => setCompany({ industry: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
          >
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-600 mb-1">Zaměstnanci</span>
          <input
            type="number"
            min={0}
            value={company.employees ?? 0}
            onChange={(e) => setCompany({ employees: num(e.target.value, 0) })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
          />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-600 mb-1">Průměrná mzda (Kč)</span>
          <input
            type="number"
            min={0}
            value={company.avgWage ?? 0}
            onChange={(e) => setCompany({ avgWage: num(e.target.value, 0) })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
          />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-600 mb-1">3. kategorie</span>
          <input
            type="number"
            min={0}
            value={company.cat3 ?? 0}
            onChange={(e) => setCompany({ cat3: num(e.target.value, 0) })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
          />
        </label>
        <label>
          <span className="block text-sm font-medium text-slate-600 mb-1">TOP klient (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={company.topClient ?? 0}
            onChange={(e) => setCompany({ topClient: num(e.target.value, 0) })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
          />
        </label>
      </div>
      <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
        <p className="text-sm text-slate-600">
          <strong>Mzdový fond (měs.):</strong> {kpi.wageFund.toLocaleString("cs-CZ")} Kč
          {" · "}
          <strong>Rizikovost oboru:</strong> {RISK_LABELS[kpi.riskLevel] ?? kpi.riskLevel}
        </p>
      </div>
    </section>
  );
}
