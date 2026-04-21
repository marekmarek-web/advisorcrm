import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPin, ShieldCheck } from "lucide-react";
import {
  LEGAL_ADDRESS_LINE,
  LEGAL_COMPANY_NAME,
  LEGAL_EFFECTIVE_CS,
  LEGAL_ICO,
  LEGAL_PODPORA_EMAIL,
} from "@/app/legal/legal-meta";

export const metadata: Metadata = {
  title: "O nás | Aidvisora",
  description:
    "Aidvisora — český provozovatel platformy pro finanční poradce a týmy. CRM, klientská zóna, workflow a AI nástroje v EU prostředí.",
  alternates: { canonical: "/o-nas" },
  robots: { index: true, follow: true },
};

export default function ONasPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:py-14">
      <header className="border-b border-gray-200 pb-8 dark:border-gray-700">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Aktuální k {LEGAL_EFFECTIVE_CS}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">O Aidvisoře</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          Stavíme pracovní systém pro finanční poradce a jejich týmy — od klienta a dokumentů přes kalendář a obchodní
          pipeline až po klientský portál a asistenci AI. Jsme v režimu{" "}
          <Link href="/#early-access-heading" className="font-medium text-blue-600 underline dark:text-blue-400">
            pilotního / early access
          </Link>{" "}
          nasazení; reference zveřejňujeme až s písemným souhlasem partnerů.
        </p>
      </header>

      <section className="mt-10 space-y-6 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <div className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <Building2 size={20} aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Provozovatel</h2>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">{LEGAL_COMPANY_NAME}</p>
            <p className="mt-1">IČO {LEGAL_ICO}</p>
            <p className="mt-2 flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
              <span>{LEGAL_ADDRESS_LINE}</span>
            </p>
          </div>
        </div>

        <p>
          Kontakt a obecné dotazy:{" "}
          <a className="font-medium text-blue-600 underline dark:text-blue-400" href={`mailto:${LEGAL_PODPORA_EMAIL}`}>
            {LEGAL_PODPORA_EMAIL}
          </a>
          .
        </p>

        <div className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <ShieldCheck size={20} aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Důvěra a bezpečnost</h2>
            <p className="mt-1">
              Aktuální stav opatření (šifrování, data v EU, role, AI governance) popisujeme transparentně na stránce{" "}
              <Link href="/bezpecnost" className="font-medium text-blue-600 underline dark:text-blue-400">
                Bezpečnost
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <p className="mt-10 text-sm">
        <Link href="/" className="font-medium text-blue-600 underline dark:text-blue-400">
          Zpět na úvod
        </Link>
      </p>
    </main>
  );
}
