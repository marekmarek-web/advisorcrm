import { Briefcase, Home, Shield, TrendingUp } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { getContractsByContact } from "@/app/actions/contracts";

function getProductDesign(segment: string) {
  if (segment === "HYPO" || segment === "UVER") {
    return {
      icon: Home,
      color: "text-blue-600 bg-blue-50 border-blue-200",
    };
  }
  if (segment === "INV" || segment === "DIP" || segment === "DPS") {
    return {
      icon: TrendingUp,
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    };
  }
  if (segment === "ZP" || segment === "MAJ" || segment === "ODP") {
    return {
      icon: Shield,
      color: "text-rose-600 bg-rose-50 border-rose-200",
    };
  }
  return {
    icon: Briefcase,
    color: "text-purple-600 bg-purple-50 border-purple-200",
  };
}

function getStatus(contract: {
  startDate: string | null;
  anniversaryDate: string | null;
}) {
  if (!contract.startDate) return { key: "pending", label: "V řešení" };
  if (contract.anniversaryDate && new Date(contract.anniversaryDate) < new Date()) {
    return { key: "active", label: "Aktivní" };
  }
  return { key: "active", label: "Aktivní" };
}

function formatValue(amount: string | null, annual: string | null): string {
  const monthly = Number(amount ?? "");
  const yearly = Number(annual ?? "");

  if (Number.isFinite(yearly) && yearly > 0) return `${yearly.toLocaleString("cs-CZ")} Kč / rok`;
  if (Number.isFinite(monthly) && monthly > 0) return `${monthly.toLocaleString("cs-CZ")} Kč / měs`;
  return "Dle smlouvy";
}

export default async function ClientPortfolioPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const contracts = await getContractsByContact(auth.contactId);

  return (
    <div className="space-y-8 client-fade-in">
      <div>
        <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight">
          Moje portfolio
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          Přehled aktivních produktů, poskytovatelů a stavu vašich smluv.
        </p>
      </div>

      {contracts.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-10 text-center">
          <p className="text-slate-500 font-medium">
            Váš poradce zatím nepřidal žádné smlouvy.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {contracts.map((contract) => {
            const design = getProductDesign(contract.segment);
            const status = getStatus(contract);
            const ProductIcon = design.icon;
            return (
              <article
                key={contract.id}
                className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden hover:shadow-md hover:border-indigo-200 transition-all group flex flex-col"
              >
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-start justify-between">
                  <div
                    className={`w-12 h-12 rounded-xl border flex items-center justify-center ${design.color}`}
                  >
                    <ProductIcon size={17} />
                  </div>
                  <span
                    className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-md border ${
                      status.key === "active"
                        ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                        : "bg-amber-50 text-amber-600 border-amber-100"
                    }`}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-bold text-lg text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors leading-tight">
                    {contract.productName || "Produkt bez názvu"}
                  </h3>
                  <p className="text-sm font-bold text-slate-500 mb-6">
                    {contract.partnerName || "Neznámý provider"}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-auto">
                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                        Hodnota / krytí
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        {formatValue(contract.premiumAmount, contract.premiumAnnual)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                        Číslo smlouvy
                      </span>
                      <span className="text-sm font-bold text-slate-600 font-mono">
                        {contract.contractNumber || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
