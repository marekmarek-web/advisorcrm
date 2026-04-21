import type { Metadata } from "next";
import Link from "next/link";
import { Calendar, Mail, Play } from "lucide-react";
import { LEGAL_EFFECTIVE_CS, LEGAL_PODPORA_EMAIL } from "@/app/legal/legal-meta";
import { PUBLIC_TRIAL_DURATION_DAYS } from "@/lib/billing/public-pricing";

const DEMO_VIDEO_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_LANDING_DEMO_VIDEO_URL
    ? process.env.NEXT_PUBLIC_LANDING_DEMO_VIDEO_URL
    : "";

const DEMO_MAILTO = `mailto:${LEGAL_PODPORA_EMAIL}?subject=${encodeURIComponent("Demo Aidvisora (cca 20 min)")}`;

export const metadata: Metadata = {
  title: "Ukázka a demo | Aidvisora",
  description:
    "Domluvte si krátkou ukázku platformy nebo si rovnou založte zkušební účet. CRM a klientský portál pro finanční poradce.",
  alternates: { canonical: "/demo" },
  robots: { index: true, follow: true },
};

export default function DemoPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:py-14">
      <header className="border-b border-gray-200 pb-8 dark:border-gray-700">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Aktuální k {LEGAL_EFFECTIVE_CS}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Ukázka a demo
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          Pro rychlý náběh si můžete založit zkušební účet ({PUBLIC_TRIAL_DURATION_DAYS} dní v úrovni Pro). Pro broker pooly,
          více poboček nebo specifické otázky compliance si domluvte krátký videohovor — napište nám e-mailem.
        </p>
      </header>

      <section className="mt-10 flex flex-col gap-4">
        <a
          href={DEMO_MAILTO}
          className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:border-blue-500/40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <Mail size={20} aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Domluvit demo e-mailem</h2>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              {LEGAL_PODPORA_EMAIL} — předmět „Demo Aidvisora“ už máme předvyplněný.
            </p>
          </div>
        </a>

        <Link
          href="/prihlaseni?register=1"
          className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-emerald-300 dark:border-gray-700 dark:bg-gray-900/40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Calendar size={20} aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Založit zkušební účet</h2>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              {PUBLIC_TRIAL_DURATION_DAYS} dní v úrovni Pro — bez platební karty na začátku.
            </p>
          </div>
        </Link>

        {DEMO_VIDEO_URL ? (
          <a
            href={DEMO_VIDEO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-violet-300 dark:border-gray-700 dark:bg-gray-900/40"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
              <Play size={20} aria-hidden />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Přehrát krátké video</h2>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">Otevře se na nové kartě.</p>
            </div>
          </a>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-400">
            Krátké demo video připravujeme. Mezitím využijte zkušební účet nebo nám napište na demo.
          </div>
        )}
      </section>

      <p className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/" className="font-medium text-blue-600 underline dark:text-blue-400">
          Zpět na úvod
        </Link>
        <Link href="/pro-brokery" className="font-medium text-blue-600 underline dark:text-blue-400">
          Pro brokery a firmy
        </Link>
      </p>
    </main>
  );
}
