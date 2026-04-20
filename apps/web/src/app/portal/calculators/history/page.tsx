import Link from "next/link";
import { ArrowLeft, FileText, ChevronRight, Send } from "lucide-react";
import { ListPageShell } from "@/app/components/list-page";
import { getRecentCalculatorRuns } from "@/app/actions/calculator-runs";
import {
  calculatorTypeLabelCs,
  calculatorTypeRoute,
  formatRelativeCs,
} from "@/lib/calculators/history-format";

function buildOfferLink(runId: string, calcType: string, title: string | null): string {
  const params = new URLSearchParams();
  params.set("openProposalFromRun", runId);
  params.set("calcType", calcType);
  if (title) params.set("proposalTitle", title);
  return `?${params.toString()}#advisor-proposals`;
}

export default async function CalculatorHistoryPage() {
  const runs = await getRecentCalculatorRuns(100).catch(() => []);

  return (
    <ListPageShell className="max-w-[1200px]">
      <div className="mb-8">
        <Link
          href="/portal/calculators"
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <ArrowLeft size={18} aria-hidden />
          Zpět na kalkulačky
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-[color:var(--wp-text)] md:text-3xl mb-2">
          Nedávné propočty
        </h1>
        <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
          Přehled posledních propočtů, které jste v kalkulačkách spustili. Jde o orientační interní podklad.
        </p>
      </div>

      <div className="rounded-[32px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 shadow-sm md:p-8">
        {runs.length === 0 ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">
            Zatím zde nejsou žádné propočty. Spusťte kalkulačku a výsledek se zde zobrazí.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--wp-surface-card-border)]">
            {runs.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <Link
                  href={calculatorTypeRoute(item.calculatorType)}
                  className="group flex min-w-0 flex-1 items-start gap-4 transition-colors hover:text-indigo-600"
                >
                  <div className="shrink-0 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-2 text-indigo-500 shadow-sm group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-950/40">
                    <FileText size={20} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-[color:var(--wp-text)] group-hover:text-indigo-600 truncate">
                      {item.contactName ?? item.label ?? calculatorTypeLabelCs(item.calculatorType)}
                    </p>
                    <p className="text-sm font-semibold text-[color:var(--wp-text-secondary)]">
                      {calculatorTypeLabelCs(item.calculatorType)}
                      {item.label ? ` · ${item.label}` : ""}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                      {formatRelativeCs(item.createdAt)}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-3">
                  {item.contactId && (
                    <Link
                      href={`/portal/contacts/${item.contactId}${buildOfferLink(
                        item.id,
                        item.calculatorType,
                        item.label ?? item.contactName ?? calculatorTypeLabelCs(item.calculatorType),
                      )}`}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                      title="Otevřít detail klienta a vytvořit návrh pro Klientskou zónu"
                    >
                      <Send size={14} aria-hidden />
                      Nabídnout klientovi
                    </Link>
                  )}
                  <Link
                    href={calculatorTypeRoute(item.calculatorType)}
                    aria-label="Otevřít kalkulačku"
                    className="shrink-0 text-[color:var(--wp-text-tertiary)] hover:text-indigo-600"
                  >
                    <ChevronRight size={20} aria-hidden />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-center text-sm text-[color:var(--wp-text-secondary)] mt-8">
        Orientační výpočet. Nejedná se o finanční poradenství ani závaznou nabídku.
      </p>
    </ListPageShell>
  );
}
