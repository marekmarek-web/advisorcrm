import {
  Briefcase,
  Car,
  Home,
  Plane,
  Shield,
  TrendingUp,
  Umbrella,
  Users,
  Building2,
} from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { getClientPortfolioForContact } from "@/app/actions/contracts";
import { getClientVisiblePortfolioDocumentNames } from "@/app/actions/documents";
import {
  aggregatePortfolioMetrics,
  PORTFOLIO_GROUP_LABELS,
  segmentToPortfolioGroup,
  type PortfolioUiGroup,
} from "@/lib/client-portfolio/read-model";

function groupIcon(g: PortfolioUiGroup) {
  switch (g) {
    case "investments_pensions":
      return TrendingUp;
    case "loans":
      return Home;
    case "income_protection_life":
    case "children":
      return Users;
    case "property_liability":
      return Umbrella;
    case "vehicles":
      return Car;
    case "travel":
      return Plane;
    case "business":
      return Building2;
    default:
      return Briefcase;
  }
}

function formatMoneyLine(monthly: string | null, annual: string | null): string {
  const m = Number(monthly ?? "");
  const y = Number(annual ?? "");
  if (Number.isFinite(y) && y > 0) return `${y.toLocaleString("cs-CZ")} Kč / rok`;
  if (Number.isFinite(m) && m > 0) return `${m.toLocaleString("cs-CZ")} Kč / měsíc`;
  return "Dle smlouvy";
}

function statusLabel(portfolioStatus: string, anniversaryDate: string | null, startDate: string | null): string {
  if (portfolioStatus === "ended") return "Ukončené";
  if (!startDate) return "V evidenci";
  return "Aktivní";
}

export default async function ClientPortfolioPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const contracts = await getClientPortfolioForContact(auth.contactId);
  const sourceDocIds = [
    ...new Set(contracts.map((c) => c.sourceDocumentId).filter((id): id is string => !!id)),
  ];
  const visibleSourceDocs =
    sourceDocIds.length > 0
      ? await getClientVisiblePortfolioDocumentNames(auth.contactId, sourceDocIds)
      : {};
  const metrics = aggregatePortfolioMetrics(contracts);

  const grouped = new Map<PortfolioUiGroup, typeof contracts>();
  for (const c of contracts) {
    const g = segmentToPortfolioGroup(c.segment, c.portfolioAttributes);
    const list = grouped.get(g) ?? [];
    list.push(c);
    grouped.set(g, list);
  }

  const groupOrder: PortfolioUiGroup[] = [
    "investments_pensions",
    "loans",
    "income_protection_life",
    "children",
    "property_liability",
    "vehicles",
    "travel",
    "business",
    "other",
  ];

  return (
    <div className="space-y-8 client-fade-in">
      <div>
        <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight">
          Moje portfolio
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          Přehled produktů, které váš poradce eviduje a zveřejnil pro vás v portálu.
        </p>
      </div>

      {contracts.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-8 md:p-10 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
            <Briefcase size={28} />
          </div>
          <p className="text-slate-700 font-semibold text-lg">Zatím zde nemáte zobrazené žádné produkty</p>
          <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
            Jakmile váš poradce doplní a zveřejní smlouvy v klientské zóně, objeví se zde přehledně podle kategorií —
            investice, úvěry, pojištění a další.
          </p>
          <p className="text-slate-400 text-xs">
            Máte dotaz? Napište poradci přes Zprávy nebo vytvořte požadavek z hlavní stránky portálu.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Měsíční investice</p>
              <p className="text-2xl font-black text-slate-900">{metrics.monthlyInvestments.toLocaleString("cs-CZ")} Kč</p>
            </div>
            <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Měsíční pojistné</p>
              <p className="text-2xl font-black text-slate-900">{metrics.monthlyInsurancePremiums.toLocaleString("cs-CZ")} Kč</p>
            </div>
            <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Jistiny úvěrů (evidence)</p>
              <p className="text-2xl font-black text-slate-900">{metrics.totalLoanPrincipal.toLocaleString("cs-CZ")} Kč</p>
            </div>
            <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Položky v přehledu</p>
              <p className="text-2xl font-black text-slate-900">{metrics.activeContractCount}</p>
            </div>
          </div>

          {groupOrder.map((groupKey) => {
            const items = grouped.get(groupKey);
            if (!items?.length) return null;
            const Icon = groupIcon(groupKey);
            return (
              <section key={groupKey} className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                    <Icon size={18} />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">{PORTFOLIO_GROUP_LABELS[groupKey]}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {items.map((contract) => {
                    const st = statusLabel(contract.portfolioStatus, contract.anniversaryDate, contract.startDate);
                    return (
                      <article
                        key={contract.id}
                        className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md hover:border-indigo-200 transition-all"
                      >
                        <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-indigo-600 shrink-0">
                              <Shield size={18} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-slate-900 leading-tight line-clamp-2">
                                {contract.productName || "Produkt"}
                              </h4>
                              <p className="text-xs font-semibold text-slate-500 truncate">{contract.partnerName || "Partner"}</p>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${
                              st === "Aktivní"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : st === "Ukončené"
                                  ? "bg-slate-100 text-slate-600 border-slate-200"
                                  : "bg-amber-50 text-amber-800 border-amber-100"
                            }`}
                          >
                            {st}
                          </span>
                        </div>
                        <div className="p-5 flex-1 flex flex-col gap-3 text-sm">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                                Platba / pojistné / splátka
                              </span>
                              <span className="font-bold text-slate-900">{formatMoneyLine(contract.premiumAmount, contract.premiumAnnual)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                                Číslo smlouvy
                              </span>
                              <span className="font-mono text-slate-700">{contract.contractNumber || "—"}</span>
                            </div>
                          </div>
                          {(contract.startDate || contract.anniversaryDate) && (
                            <div className="text-xs text-slate-500">
                              {contract.startDate ? (
                                <span>Od {new Date(contract.startDate).toLocaleDateString("cs-CZ")}</span>
                              ) : null}
                              {contract.anniversaryDate ? (
                                <span className={contract.startDate ? " ml-2" : ""}>
                                  Výročí {new Date(contract.anniversaryDate).toLocaleDateString("cs-CZ")}
                                </span>
                              ) : null}
                            </div>
                          )}
                          {contract.sourceDocumentId && visibleSourceDocs[contract.sourceDocumentId] ? (
                            <a
                              href={`/api/documents/${contract.sourceDocumentId}/download`}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-100 transition-colors"
                            >
                              Související dokument ({visibleSourceDocs[contract.sourceDocumentId].name})
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
