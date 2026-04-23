import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Mail, MapPin, ShieldAlert, Headset, FileText } from "lucide-react";
import {
  LEGAL_ADDRESS_LINE,
  LEGAL_COMPANY_NAME,
  LEGAL_DIC_PENDING_NOTE,
  LEGAL_EFFECTIVE_CS,
  LEGAL_ICO,
  LEGAL_PODPORA_EMAIL,
  LEGAL_SECURITY_EMAIL,
  LEGAL_STATUS_PAGE_URL,
  LEGAL_SUPPORT_EMAIL,
} from "@/app/legal/legal-meta";

export const metadata: Metadata = {
  title: "Kontakt | Aidvisora",
  description:
    "Kontaktní údaje provozovatele platformy Aidvisora — sídlo, IČO, podpora, právní kontakt, hlášení bezpečnostních incidentů. Jurisdikce Česká republika.",
  alternates: { canonical: "/kontakt" },
  robots: { index: true, follow: true },
};

export const dynamic = "force-static";
export const revalidate = 3600;

type ContactCardProps = {
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
};

function ContactCard({ icon: Icon, title, description, actionLabel, actionHref }: ContactCardProps) {
  const isExternal = actionHref.startsWith("http");
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900/40">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          <Icon size={20} aria-hidden />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{description}</p>
      {isExternal ? (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex min-h-[44px] w-fit items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {actionLabel}
        </a>
      ) : actionHref.startsWith("mailto:") ? (
        <a
          href={actionHref}
          className="mt-auto inline-flex min-h-[44px] w-fit items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {actionLabel}
        </a>
      ) : (
        <Link
          href={actionHref}
          className="mt-auto inline-flex min-h-[44px] w-fit items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export default function KontaktPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:py-14">
      <header className="border-b border-gray-200 pb-8 dark:border-gray-700">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Aktuální k {LEGAL_EFFECTIVE_CS}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Kontakt
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          Provozovatelem platformy Aidvisora je česká společnost se sídlem v České republice.
          Primárním komunikačním kanálem jsou e-maily níže; telefonická podpora je součástí pouze
          enterprise smluv.
        </p>
      </header>

      <section className="mt-10">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-gray-700 shadow-sm dark:bg-gray-950/60 dark:text-gray-200">
              <Building2 size={22} aria-hidden />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Identifikace provozovatele</h2>
              <dl className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-800 dark:text-gray-200 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Obchodní firma
                  </dt>
                  <dd className="mt-1 font-semibold">{LEGAL_COMPANY_NAME}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    IČO
                  </dt>
                  <dd className="mt-1 font-semibold">{LEGAL_ICO}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Sídlo
                  </dt>
                  <dd className="mt-1 flex items-start gap-2">
                    <MapPin size={16} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
                    <span>{LEGAL_ADDRESS_LINE}</span>
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    DIČ
                  </dt>
                  <dd className="mt-1 text-gray-700 dark:text-gray-300">{LEGAL_DIC_PENDING_NOTE}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Jurisdikce
                  </dt>
                  <dd className="mt-1 text-gray-700 dark:text-gray-300">
                    Česká republika; případné spory jsou řešeny českými soudy v souladu s obchodními podmínkami.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Kontaktní kanály</h2>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          Pro rychlou odezvu použijte kanál podle typu dotazu. U právních a privacy dotazů prosíme o
          uvedení identifikátoru workspace, pokud ho znáte.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ContactCard
            icon={Headset}
            title="Podpora a onboarding"
            description="Obecné dotazy, přihlášení, nastavení účtu, onboarding workspace a školení uživatelů. Reagujeme v pracovních dnech."
            actionLabel={LEGAL_PODPORA_EMAIL}
            actionHref={`mailto:${LEGAL_PODPORA_EMAIL}?subject=${encodeURIComponent("Podpora Aidvisora")}`}
          />
          <ContactCard
            icon={FileText}
            title="Právní a privacy kontakt"
            description="Dotazy k obchodním podmínkám, zpracovatelské smlouvě (DPA), zpracování osobních údajů (GDPR) a požadavky subjektů údajů (export, výmaz, oprava)."
            actionLabel={LEGAL_SUPPORT_EMAIL}
            actionHref={`mailto:${LEGAL_SUPPORT_EMAIL}?subject=${encodeURIComponent("Právní dotaz / GDPR")}`}
          />
          <ContactCard
            icon={ShieldAlert}
            title="Bezpečnostní incidenty"
            description="Podezření na kompromitaci účtu, únik dat, zranitelnost, phishing, nebo odpovědné hlášení chyb. Zprávy na tuto adresu eskalujeme přednostně."
            actionLabel={LEGAL_SECURITY_EMAIL}
            actionHref={`mailto:${LEGAL_SECURITY_EMAIL}?subject=${encodeURIComponent("Bezpečnostní incident")}`}
          />
          <ContactCard
            icon={Mail}
            title="Enterprise / obchod"
            description="Firemní nasazení 20+ poradců, SSO, custom DPA, implementation fee a integrace. Pro účely RFP přiložte rozsah a termín."
            actionLabel={LEGAL_SUPPORT_EMAIL}
            actionHref={`mailto:${LEGAL_SUPPORT_EMAIL}?subject=${encodeURIComponent("Enterprise poptávka")}`}
          />
          <ContactCard
            icon={ShieldAlert}
            title="Status a provozní stav"
            description="Živý přehled dostupnosti klíčových komponent (databáze, auth, Stripe, e-mail). Dedikovaná public status page se připravuje."
            actionLabel="Otevřít /status"
            actionHref={LEGAL_STATUS_PAGE_URL}
          />
          <ContactCard
            icon={FileText}
            title="Právní dokumenty"
            description="Obchodní podmínky, zpracovatelská smlouva, zásady zpracování osobních údajů a přehled subdodavatelů jsou veřejně dostupné."
            actionLabel="Otevřít /terms"
            actionHref="/terms"
          />
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-amber-300/40 bg-amber-50 p-6 dark:border-amber-500/30 dark:bg-amber-950/20">
        <h2 className="text-base font-semibold text-amber-900 dark:text-amber-100">
          Důležité k AI režimu Aidvisory
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/80">
          Aidvisora je interní pracovní nástroj pro finanční poradce. AI výstupy jsou vždy
          informativní podklad pro poradce a podléhají lidskému přezkumu. Finální odpovědnost za
          radu poskytnutou koncovému klientovi nese vždy poradce. Podrobnosti viz{" "}
          <Link
            href="/legal/ai-disclaimer"
            className="font-semibold text-amber-900 underline dark:text-amber-100"
          >
            AI režim a disclaimer
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
