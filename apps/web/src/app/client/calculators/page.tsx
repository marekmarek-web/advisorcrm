import Link from "next/link";
import { Home, TrendingUp } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";

export default async function ClientCalculatorsPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  return (
    <div className="space-y-8 client-fade-in">
      <div>
        <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight">Finanční kalkulačky</h2>
        <p className="text-sm font-medium text-slate-500 mt-2 max-w-2xl">
          Stejné výpočty jako v poradenském portálu — orientační, ilustrativní. Nejde o návrh konkrétního produktu ani
          radu klientovi; individuální posouzení řeší výhradně váš poradce.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/client/calculators/mortgage"
          className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all text-center flex flex-col items-center min-h-[44px]"
        >
          <span className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
            <Home size={32} />
          </span>
          <h3 className="text-xl font-black text-slate-900 mb-2">Hypotéka a úvěr</h3>
          <p className="text-sm font-medium text-slate-500">
            Měsíční splátka a parametry úvěru — bez srovnání aktuálních nabídek bank v klientské zóně.
          </p>
        </Link>

        <Link
          href="/client/calculators/investment"
          className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all text-center flex flex-col items-center min-h-[44px]"
        >
          <span className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
            <TrendingUp size={32} />
          </span>
          <h3 className="text-xl font-black text-slate-900 mb-2">Investice</h3>
          <p className="text-sm font-medium text-slate-500">
            Projektovaný vývoj hodnoty při pravidelném investování a zvolené strategii.
          </p>
        </Link>
      </div>

      <p className="text-center text-sm text-slate-500">
        Orientační výpočet. Nejedná se o finanční poradenství ani závaznou nabídku.
      </p>
    </div>
  );
}
