import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { ClientAdvisorProposal } from "@/app/actions/advisor-proposals-client";
import {
  ADVISOR_PROPOSAL_SEGMENT_LABELS,
  formatMoneyCs,
} from "@/lib/advisor-proposals/segment-labels";

/**
 * Nenásilná karta na dashboardu — zobrazí **jeden** aktivní návrh s nejvyšší úsporou.
 * Pokud žádný aktivní není, celá karta se vůbec nevykreslí.
 *
 * Compliance: tento obsah vytvořil poradce ručně. Není to automatické doporučení platformy.
 */
export function AdvisorProposalsHighlightCard({
  proposals,
}: {
  proposals: ClientAdvisorProposal[];
}) {
  const activeProposals = proposals.filter(
    (p) => p.status === "published" || p.status === "viewed"
  );
  if (activeProposals.length === 0) return null;

  const sorted = [...activeProposals].sort((a, b) => {
    const sa = a.savingsAnnual ?? 0;
    const sb = b.savingsAnnual ?? 0;
    return sb - sa;
  });
  const hero = sorted[0];
  const otherCount = activeProposals.length - 1;
  const segmentLabel = ADVISOR_PROPOSAL_SEGMENT_LABELS[hero.segment] ?? hero.segment;

  return (
    <div className="rounded-[24px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 sm:p-8 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Sparkles size={22} aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-emerald-700">
              Návrh od vašeho poradce
            </h3>
            <p className="text-xs font-bold text-emerald-800/80 mt-0.5">
              {segmentLabel}
              {otherCount > 0 ? ` · další aktivní: ${otherCount}` : ""}
            </p>
          </div>
        </div>
      </div>

      {hero.savingsAnnual !== null && hero.savingsAnnual > 0 ? (
        <p className="text-2xl sm:text-3xl font-display font-black text-[color:var(--wp-text)] leading-tight mb-2">
          Váš poradce pro vás spočítal úsporu{" "}
          <span className="text-emerald-600">
            {formatMoneyCs(hero.savingsAnnual, hero.currency)} / rok
          </span>
          .
        </p>
      ) : (
        <p className="text-2xl sm:text-3xl font-display font-black text-[color:var(--wp-text)] leading-tight mb-2">
          Váš poradce pro vás připravil nezávazné porovnání.
        </p>
      )}

      <p className="text-base font-semibold text-[color:var(--wp-text)] mb-2">„{hero.title}“</p>

      {hero.summary && (
        <p className="text-sm text-[color:var(--wp-text-secondary)] mb-4 line-clamp-3">{hero.summary}</p>
      )}

      <p className="text-xs text-[color:var(--wp-text-secondary)] mb-4">
        Nezávazné porovnání připravené vaším poradcem. Není to automatické doporučení. Finální
        rozhodnutí je na vás.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/client/navrhy/${hero.id}`}
          className="min-h-[44px] inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-emerald-500/20"
        >
          Prohlédnout návrh
          <ArrowRight size={14} />
        </Link>
        <Link
          href="/client/navrhy"
          className="min-h-[44px] inline-flex items-center px-5 py-3 bg-white hover:bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold border border-emerald-200 transition-colors"
        >
          Všechny návrhy
        </Link>
      </div>
    </div>
  );
}
