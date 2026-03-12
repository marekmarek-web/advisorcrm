import Link from "next/link";
import { FileSpreadsheet, PlusCircle, BarChart3 } from "lucide-react";
import { listFinancialAnalyses } from "@/app/actions/financial-analyses";

function formatUpdated(updatedAt: Date): string {
  const d = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Dnes";
  if (diffDays === 1) return "Včera";
  if (diffDays < 7) return `Před ${diffDays} dny`;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AnalysesPage() {
  const analyses = await listFinancialAnalyses();

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">Analýzy</h1>
      <p className="text-slate-500 text-sm mb-6">
        Nástroje pro analýzu potřeb klientů a doporučení.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <Link
          href="/portal/analyses/financial"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-md transition-colors"
        >
          <PlusCircle className="w-5 h-5" />
          Nová analýza
        </Link>
        <Link
          href="/portal/analyses/financial"
          className="inline-flex items-center gap-4 min-h-[44px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 hover:border-indigo-300 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-indigo-700" />
          </div>
          <div className="text-left">
            <span className="font-semibold text-slate-800 block">Finanční analýza</span>
            <span className="text-slate-500 text-sm">7krokový wizard: cashflow, bilance, cíle, strategie, report.</span>
          </div>
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-3">Uložené analýzy</h2>
        {analyses.length === 0 ? (
          <p className="text-slate-500 text-sm py-4">Zatím nemáte žádné uložené analýzy. Vytvořte novou nebo otevřete analýzu z profilu klienta.</p>
        ) : (
          <ul className="space-y-3">
            {analyses.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/portal/analyses/financial?id=${encodeURIComponent(a.id)}`}
                  className="flex items-center gap-4 min-h-[44px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 hover:border-indigo-300 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-slate-800 block truncate">
                      {a.clientName || "Bez názvu"}
                    </span>
                    <span className="text-slate-500 text-sm">
                      Upraveno {formatUpdated(a.updatedAt)} · {a.status === "draft" ? "Koncept" : a.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
