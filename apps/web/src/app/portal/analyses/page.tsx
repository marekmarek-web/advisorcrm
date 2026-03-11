import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";

export default function AnalysesPage() {
  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">Analýzy</h1>
      <p className="text-slate-500 text-sm mb-8">
        Nástroje pro analýzu potřeb klientů a doporučení.
      </p>
      <ul className="space-y-3">
        <li>
          <Link
            href="/portal/analyses/financial"
            className="flex items-center gap-4 min-h-[44px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 hover:border-amber-300 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-amber-700" />
            </div>
            <div className="text-left">
              <span className="font-semibold text-slate-800 block">Finanční analýza</span>
              <span className="text-slate-500 text-sm">7krokový wizard: cashflow, bilance, cíle, strategie, report.</span>
            </div>
          </Link>
        </li>
      </ul>
    </div>
  );
}
