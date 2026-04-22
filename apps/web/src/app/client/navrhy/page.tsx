import Link from "next/link";
import { ArrowRight, Ban, CheckCircle2, ChevronRight, Clock, Sparkles } from "lucide-react";
import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import {
  listClientAdvisorProposals,
  type ClientAdvisorProposal,
} from "@/app/actions/advisor-proposals-client";
import {
  ADVISOR_PROPOSAL_SEGMENT_LABELS,
  ADVISOR_PROPOSAL_STATUS_LABELS,
  formatDateCs,
  formatMoneyCs,
} from "@/lib/advisor-proposals/segment-labels";

function pickActive(list: ClientAdvisorProposal[]) {
  return list.filter((p) => p.status === "published" || p.status === "viewed");
}
function pickAccepted(list: ClientAdvisorProposal[]) {
  return list.filter((p) => p.status === "accepted");
}
function pickDeclined(list: ClientAdvisorProposal[]) {
  return list.filter((p) => p.status === "declined");
}
function pickExpired(list: ClientAdvisorProposal[]) {
  return list.filter((p) => p.status === "expired");
}

export default async function ClientAdvisorProposalsListPage() {
  await requireClientZoneAuth();
  const proposals = await listClientAdvisorProposals();

  const active = pickActive(proposals);
  const accepted = pickAccepted(proposals);
  const declined = pickDeclined(proposals);
  const expired = pickExpired(proposals);

  const hasAny = proposals.length > 0;

  return (
    <div className="space-y-8 client-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight">
            Návrhy od poradce
          </h2>
          <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mt-1">
            Nezávazná porovnání, která pro vás poradce připravil. Není to automatické doporučení —
            finální rozhodnutí je vždy na vás.
          </p>
        </div>
      </div>

      {!hasAny ? (
        <div className="bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm p-10 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[color:var(--wp-surface-muted)] grid place-items-center text-[color:var(--wp-text-tertiary)]">
            <Sparkles size={22} />
          </div>
          <p className="text-[color:var(--wp-text)] font-semibold">Zatím žádné návrhy</p>
          <p className="text-[color:var(--wp-text-secondary)] text-sm max-w-md mx-auto">
            Jakmile pro vás poradce připraví porovnání (např. výhodnější pojištění vozu nebo
            refinancování hypotéky), uvidíte ho tady.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {active.length > 0 && (
            <ProposalSection
              title="Aktivní návrhy"
              subtitle="Nezávazná porovnání, ke kterým se ještě můžete vyjádřit"
              icon={<Sparkles size={18} />}
              color="emerald"
              items={active}
            />
          )}

          {accepted.length > 0 && (
            <ProposalSection
              title="Chcete probrat s poradcem"
              subtitle="Poradce byl informován. Sledujte sekci Požadavky."
              icon={<CheckCircle2 size={18} />}
              color="indigo"
              items={accepted}
            />
          )}

          {declined.length > 0 && (
            <ProposalSection
              title="Odmítnuté"
              subtitle="Tyto návrhy jste odmítli. Můžete se k nim kdykoli vrátit."
              icon={<Ban size={18} />}
              color="slate"
              items={declined}
            />
          )}

          {expired.length > 0 && (
            <ProposalSection
              title="Vypršelé"
              subtitle="Platnost uvedená poradcem skončila."
              icon={<Clock size={18} />}
              color="amber"
              items={expired}
            />
          )}
        </div>
      )}
    </div>
  );
}

type ColorKey = "emerald" | "indigo" | "slate" | "amber";

const BORDER: Record<ColorKey, string> = {
  emerald: "border-emerald-200",
  indigo: "border-indigo-200",
  slate: "border-[color:var(--wp-surface-card-border)]",
  amber: "border-amber-200",
};
const ICON_BG: Record<ColorKey, string> = {
  emerald: "bg-emerald-100 text-emerald-600",
  indigo: "bg-indigo-100 text-indigo-600",
  slate: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]",
  amber: "bg-amber-100 text-amber-600",
};
const BADGE: Record<ColorKey, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  slate: "bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text)] border-[color:var(--wp-surface-card-border)]",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
};

function ProposalSection({
  title,
  subtitle,
  icon,
  color,
  items,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: ColorKey;
  items: ClientAdvisorProposal[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div className={`w-9 h-9 rounded-xl grid place-items-center ${ICON_BG[color]}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-black text-[color:var(--wp-text)]">{title}</h3>
          <p className="text-xs text-[color:var(--wp-text-secondary)]">{subtitle}</p>
        </div>
        <span
          className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-black border ${BADGE[color]}`}
        >
          {items.length}
        </span>
      </div>

      <div className="space-y-3">
        {items.map((p) => (
          <Link
            key={p.id}
            href={`/client/navrhy/${p.id}`}
            className={`block bg-white rounded-[24px] border ${BORDER[color]} shadow-sm p-5 hover:shadow-md transition-all`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] block mb-0.5">
                  {ADVISOR_PROPOSAL_SEGMENT_LABELS[p.segment] ?? p.segment}
                </span>
                <h4 className="font-bold text-[color:var(--wp-text)] line-clamp-1">{p.title}</h4>
                {p.summary && (
                  <p className="text-sm text-[color:var(--wp-text-secondary)] mt-1 line-clamp-2">{p.summary}</p>
                )}
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-[color:var(--wp-text-secondary)]">
                  {p.savingsAnnual !== null && p.savingsAnnual > 0 && (
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                      Úspora {formatMoneyCs(p.savingsAnnual, p.currency)} / rok
                    </span>
                  )}
                  {p.validUntil && (
                    <span className="inline-flex items-center gap-1">
                      Platí do {formatDateCs(p.validUntil)}
                    </span>
                  )}
                  {p.publishedAt && (
                    <span className="inline-flex items-center gap-1">
                      Odesláno {new Date(p.publishedAt).toLocaleDateString("cs-CZ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${BADGE[color]}`}
                >
                  {ADVISOR_PROPOSAL_STATUS_LABELS[p.status] ?? p.status}
                </span>
                <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {color === "emerald" && (
        <p className="text-[11px] text-[color:var(--wp-text-tertiary)] leading-relaxed">
          <ArrowRight size={10} aria-hidden className="inline mr-1" />
          Porovnání připravil váš poradce. Aidvisora nevytváří automatická doporučení pro klienty.
        </p>
      )}
    </section>
  );
}
