import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Lock, Users } from "lucide-react";
import {
  LEGAL_EFFECTIVE_CS,
  LEGAL_PODPORA_EMAIL,
} from "@/app/legal/legal-meta";

const DEMO_MAILTO = `mailto:${LEGAL_PODPORA_EMAIL}?subject=${encodeURIComponent("Broker pool / firma — Aidvisora")}`;

export const metadata: Metadata = {
  title: "Pro brokery a firmy | Aidvisora",
  description:
    "Aidvisora pro broker pooly a finanční firmy: izolovaný workspace, role, DPA a bezpečnostní přehled. Domluvte si onboarding a due diligence.",
  alternates: { canonical: "/pro-brokery" },
  robots: { index: true, follow: true },
};

export default function ProBrokeryPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:py-14">
      <header className="border-b border-gray-200 pb-8 dark:border-gray-700">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Aktuální k {LEGAL_EFFECTIVE_CS}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Pro brokery a firmy
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          Jedna instance platformy pro vaši organizaci (workspace), oddělená data od jiných poradců, role Manažer / Poradce /
          Asistent a smluvní rámec pro zpracování osobních údajů klientů. Negarantujeme „stoprocentní GDPR“ — umíme ale
          popsát reálná opatření a stav zavádění.
        </p>
      </header>

      <section className="mt-10 grid grid-cols-1 gap-4">
        <div className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
            <Users size={20} aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Workspace a role</h2>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              Sdílený přehled pro vedení, izolace vůči jiným firmám v systému, nastavitelná práva k datům klientů a úkolům.
            </p>
          </div>
        </div>
        <div className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <FileText size={20} aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Smluvní rámec</h2>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              Obchodní podmínky, zásady zpracování osobních údajů a{" "}
              <Link href="/legal/zpracovatelska-smlouva" className="font-medium text-blue-600 underline dark:text-blue-400">
                zpracovatelská smlouva (DPA)
              </Link>{" "}
              pro váš vztah správce–zpracovatele.
            </p>
          </div>
        </div>
        <div className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <Lock size={20} aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Bezpečnost a subdodavatelé</h2>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              Přehled opatření a stavu zavádění:{" "}
              <Link href="/bezpecnost" className="font-medium text-blue-600 underline dark:text-blue-400">
                Bezpečnost a ochrana dat
              </Link>
              , seznam{" "}
              <Link href="/subprocessors" className="font-medium text-blue-600 underline dark:text-blue-400">
                subdodavatelů
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-500/30 dark:bg-blue-950/30">
        <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100">Další krok</h2>
        <p className="mt-2 text-sm text-blue-900/90 dark:text-blue-100/90">
          Napište nám stručně velikost týmu a požadavky (např. více workspace, SSO, školení). Ozveme se s návrhem nasazení.
        </p>
        <a
          href={DEMO_MAILTO}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Napsat {LEGAL_PODPORA_EMAIL}
        </a>
      </section>

      <p className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/" className="font-medium text-blue-600 underline dark:text-blue-400">
          Zpět na úvod
        </Link>
        <Link href="/demo" className="font-medium text-blue-600 underline dark:text-blue-400">
          Ukázka a demo
        </Link>
      </p>
    </main>
  );
}
