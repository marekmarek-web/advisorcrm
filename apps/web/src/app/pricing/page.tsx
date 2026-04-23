import type { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, Shield, Headset } from "lucide-react";
import {
  PUBLIC_MONTHLY_PRICE_KC,
  PUBLIC_TRIAL_DURATION_DAYS,
  ANNUAL_BILLING_DISCOUNT_PERCENT,
  effectiveMonthlyKcWhenBilledAnnually,
  formatPublicPriceKc,
  yearlyTotalKcFromMonthlyList,
} from "@/lib/billing/public-pricing";

export const metadata: Metadata = {
  title: "Ceník · Aidvisora",
  description:
    "Transparentní ceník Aidvisora pro finanční poradce: Start, Pro a Management. Bez per-klient poplatků, trial 14 dní, roční fakturace −20 %.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Ceník · Aidvisora",
    description:
      "Start od 990 Kč / měsíc. Bez per-klient poplatků, trial 14 dní, DPA smlouva v základu. Nejsme plátci DPH.",
    type: "website",
    locale: "cs_CZ",
    url: "/pricing",
  },
};

export const dynamic = "force-static";
export const revalidate = 3600;

type Plan = {
  id: "starter" | "pro" | "team";
  name: string;
  subtitle: string;
  monthlyKc: number;
  highlight?: string;
  popular?: boolean;
  includes: string[];
  excludes?: string[];
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Start",
    subtitle: "Pro začínající poradce a menší praxe",
    monthlyKc: PUBLIC_MONTHLY_PRICE_KC.starter,
    includes: [
      "CRM, pipeline, kalendář, úkoly",
      "Google Calendar synchronizace",
      "Dokumenty v klientském portálu",
      "Základní AI pomůcky",
      "Neomezeně klientů",
    ],
    excludes: ["Chat s klientem", "Gmail + Drive integrace", "AI review PDF smluv", "Týmové přehledy"],
  },
  {
    id: "pro",
    name: "Pro",
    subtitle: "Kompletní nástroj pro samostatnou praxi",
    monthlyKc: PUBLIC_MONTHLY_PRICE_KC.pro,
    highlight: "Nejoblíbenější",
    popular: true,
    includes: [
      "Všechno ze Startu",
      "Chat + požadavky z portálu",
      "Gmail + Google Drive",
      "AI review PDF smluv",
      "Pokročilý AI asistent",
      "Klientská zóna bez limitu klientů",
    ],
  },
  {
    id: "team",
    name: "Management",
    subtitle: "Pro tým poradců s manažerskou strukturou",
    monthlyKc: PUBLIC_MONTHLY_PRICE_KC.team,
    includes: [
      "Všechno z Pro",
      "Týmové přehledy a KPI",
      "Produkce a reporty",
      "Vedoucí / ředitelská role",
      "Audit log napříč týmem",
    ],
  },
];

function yearlyPerMonthLabel(monthlyKc: number): string {
  return formatPublicPriceKc(effectiveMonthlyKcWhenBilledAnnually(monthlyKc));
}

function yearlyTotalLabel(monthlyKc: number): string {
  return formatPublicPriceKc(yearlyTotalKcFromMonthlyList(monthlyKc));
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#060918] text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10 py-20 md:py-28">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-indigo-600/10 rounded-full blur-[180px] pointer-events-none" />
        <div className="relative z-10 max-w-[1200px] mx-auto px-6 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-indigo-300 mb-4">
            Ceník
          </p>
          <h1 className="font-jakarta text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Férové ceny, <span className="text-indigo-300">bez per-klient poplatků.</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-slate-300 leading-relaxed">
            Platíte za sebe, ne za klienty. {PUBLIC_TRIAL_DURATION_DAYS} dní zdarma,
            fakturace měsíčně nebo ročně (ročně −{ANNUAL_BILLING_DISCOUNT_PERCENT}&nbsp;%).
            Uvedené ceny jsou konečné — nejsme plátci DPH.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="relative py-20 md:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {PLANS.map((p) => (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-[28px] border p-8 backdrop-blur-md ${
                  p.popular
                    ? "border-indigo-500/60 bg-indigo-600/10 shadow-[0_0_60px_rgba(99,102,241,0.2)]"
                    : "border-white/10 bg-white/5"
                }`}
              >
                {p.highlight ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-indigo-600 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
                    {p.highlight}
                  </span>
                ) : null}

                <h2 className="font-jakarta text-2xl font-bold mb-1">{p.name}</h2>
                <p className="text-sm text-slate-300 mb-6 leading-relaxed">{p.subtitle}</p>

                <div className="mb-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-white">
                      {formatPublicPriceKc(p.monthlyKc)}&nbsp;Kč
                    </span>
                    <span className="text-sm text-slate-400">/ měsíc</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Nebo {yearlyPerMonthLabel(p.monthlyKc)}&nbsp;Kč měsíčně při roční fakturaci
                    ({yearlyTotalLabel(p.monthlyKc)}&nbsp;Kč / rok).
                  </p>
                </div>

                <ul className="space-y-3 mb-6">
                  {p.includes.map((inc) => (
                    <li key={inc} className="flex gap-3 text-sm text-slate-200">
                      <Check size={18} className="shrink-0 text-emerald-400 mt-0.5" />
                      <span>{inc}</span>
                    </li>
                  ))}
                </ul>

                {p.excludes && p.excludes.length > 0 ? (
                  <ul className="space-y-2 mb-6 border-t border-white/10 pt-4">
                    {p.excludes.map((exc) => (
                      <li key={exc} className="flex gap-3 text-xs text-slate-500">
                        <span className="shrink-0">—</span>
                        <span>{exc}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-auto">
                  <Link
                    href="/prihlaseni"
                    className={`inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-black uppercase tracking-widest transition-colors ${
                      p.popular
                        ? "bg-indigo-600 text-white hover:bg-indigo-500"
                        : "bg-white text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    Zkusit {PUBLIC_TRIAL_DURATION_DAYS} dní zdarma
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-slate-500">
            Nejsme plátci DPH — uvedené ceny jsou konečné. Klientská zóna je zahrnuta v každém tarifu, neplatíte za klienta ani za seat.
          </p>
        </div>
      </section>

      {/* Trust row */}
      <section className="border-t border-white/10 bg-[#0a0f29] py-14">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex gap-4">
            <Shield size={24} className="shrink-0 text-indigo-300 mt-1" />
            <div>
              <p className="font-bold text-white">DPA + GDPR v základu</p>
              <p className="text-sm text-slate-400 leading-relaxed">
                TLS 1.2+ v přenosu, audit log, hosting v EU (Supabase + Vercel). Zpracovatelská
                smlouva dostupná hned po zřízení účtu; detaily šifrování na /bezpecnost.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Check size={24} className="shrink-0 text-emerald-400 mt-1" />
            <div>
              <p className="font-bold text-white">Bez závazku</p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Fakturace měsíčně. Kdykoliv můžete pauznout, změnit tarif, nebo zrušit
                — faktura se rozpočítá poměrně.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Headset size={24} className="shrink-0 text-purple-300 mt-1" />
            <div>
              <p className="font-bold text-white">Česká podpora</p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Reagujeme v pracovní době do konce dne. Pomůžeme s onboardingem
                i migrací dat z jiných CRM.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <p className="text-sm text-slate-400 mb-4">
            Máte tým nad 10 poradců a hledáte custom nasazení?
          </p>
          <Link
            href="mailto:podpora@aidvisora.cz?subject=Enterprise%20nasazeni"
            className="inline-flex items-center gap-2 text-indigo-300 font-bold hover:text-indigo-200 underline underline-offset-4"
          >
            Ozvěte se — domluvíme individuální podmínky
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}
