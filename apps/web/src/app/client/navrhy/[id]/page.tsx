import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";
import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import {
  listClientAdvisorProposals,
  markAdvisorProposalViewed,
} from "@/app/actions/advisor-proposals-client";
import {
  ADVISOR_PROPOSAL_SEGMENT_LABELS,
  ADVISOR_PROPOSAL_STATUS_LABELS,
  formatDateCs,
  formatMoneyCs,
} from "@/lib/advisor-proposals/segment-labels";
import { ClientProposalActions } from "./ClientProposalActions";

export default async function ClientAdvisorProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireClientZoneAuth();
  const { id } = await params;

  const list = await listClientAdvisorProposals();
  const proposal = list.find((p) => p.id === id);
  if (!proposal) notFound();

  if (proposal.status === "published") {
    await markAdvisorProposalViewed(proposal.id).catch(() => null);
  }

  const segmentLabel = ADVISOR_PROPOSAL_SEGMENT_LABELS[proposal.segment] ?? proposal.segment;
  const statusLabel = ADVISOR_PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status;

  const canRespond =
    proposal.status === "published" ||
    proposal.status === "viewed" ||
    proposal.status === "declined";

  const hasSavings = proposal.savingsAnnual !== null && proposal.savingsAnnual > 0;

  return (
    <div className="space-y-6 client-fade-in max-w-3xl">
      <div>
        <Link
          href="/client/navrhy"
          className="inline-flex items-center gap-1 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
        >
          <ArrowLeft size={14} /> Zpět na návrhy
        </Link>
      </div>

      <div className="bg-white rounded-[24px] border border-emerald-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 grid place-items-center text-emerald-600 shrink-0">
            <Sparkles size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
              Návrh od vašeho poradce · {segmentLabel}
            </p>
            <h1 className="text-2xl sm:text-3xl font-display font-black text-[color:var(--wp-text)] leading-tight mt-1">
              {proposal.title}
            </h1>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                {statusLabel}
              </span>
              {proposal.validUntil && (
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]">
                  Platí do {formatDateCs(proposal.validUntil)}
                </span>
              )}
            </div>
          </div>
        </div>

        {hasSavings && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700 mb-1">
              Odhadovaná roční úspora
            </p>
            <p className="text-3xl font-display font-black text-emerald-700">
              {formatMoneyCs(proposal.savingsAnnual, proposal.currency)} / rok
            </p>
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">
                  Aktuální stav
                </p>
                <p className="font-bold text-[color:var(--wp-text)] mt-0.5">
                  {formatMoneyCs(proposal.currentAnnualCost, proposal.currency)} / rok
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">
                  Návrh poradce
                </p>
                <p className="font-bold text-[color:var(--wp-text)] mt-0.5">
                  {formatMoneyCs(proposal.proposedAnnualCost, proposal.currency)} / rok
                </p>
              </div>
            </div>
          </div>
        )}

        {proposal.summary && (
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-1">
              Shrnutí od poradce
            </p>
            <p className="text-sm text-[color:var(--wp-text)] whitespace-pre-wrap leading-relaxed">
              {proposal.summary}
            </p>
          </div>
        )}

        {proposal.benefits && proposal.benefits.length > 0 && (
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-2">
              Co poradce považuje za přínos
            </p>
            <ul className="space-y-2">
              {proposal.benefits.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-[color:var(--wp-text)] leading-relaxed"
                >
                  <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-bold">{b.label}</span>
                    {b.delta ? <span className="text-[color:var(--wp-text-secondary)]"> — {b.delta}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] p-4 text-xs text-[color:var(--wp-text-secondary)] leading-relaxed">
          Tento návrh připravil ručně váš poradce jako nezávazné porovnání pro vaši informaci.
          Nejde o automatické doporučení platformy Aidvisora a finální rozhodnutí je vždy na vás.
        </div>

        {proposal.status === "accepted" && proposal.responseRequestId && (
          <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4 text-sm text-indigo-800 leading-relaxed">
            Poradce byl informován, že chcete tento návrh probrat. Vývoj vidíte v sekci{" "}
            <Link href="/client/requests" className="font-bold underline">
              Požadavky
            </Link>
            .
          </div>
        )}

        {proposal.status === "expired" && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 leading-relaxed">
            Platnost tohoto návrhu skončila. Pokud máte zájem o aktuální variantu, napište poradci.
          </div>
        )}

        {canRespond && (
          <ClientProposalActions
            proposalId={proposal.id}
            alreadyDeclined={proposal.status === "declined"}
          />
        )}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
