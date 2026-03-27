import Link from "next/link";
import type { ReactNode } from "react";
import {
  LEGAL_ADDRESS_LINE,
  LEGAL_COMPANY_NAME,
  LEGAL_EFFECTIVE_CS,
  LEGAL_ICO_DIC_NOTE,
  LEGAL_PODPORA_EMAIL,
  LEGAL_PRICING_HREF,
  LEGAL_SUPPORT_EMAIL,
  type LegalDocumentSlug,
} from "./legal-meta";

const NAV: { slug: LegalDocumentSlug; href: string; label: string }[] = [
  { slug: "terms", href: "/terms", label: "Obchodní podmínky" },
  { slug: "privacy", href: "/privacy", label: "Zásady zpracování OU" },
  { slug: "dpa", href: "/legal/zpracovatelska-smlouva", label: "Zpracovatelská smlouva (DPA)" },
  { slug: "ai-disclaimer", href: "/legal/ai-disclaimer", label: "AI režim a disclaimer" },
];

export function LegalDocumentLayout(props: {
  title: string;
  documentSlug: LegalDocumentSlug;
  children: ReactNode;
  /** Zobrazí odkaz na veřejný ceník (typicky u OP). */
  showPricingLink?: boolean;
  /** Doplňkový text pod identifikačním blokem (např. upozornění k exportu). */
  belowPartyBlock?: ReactNode;
}) {
  const { title, documentSlug, children, showPricingLink, belowPartyBlock } = props;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:py-14">
      <header className="border-b border-gray-200 pb-8 dark:border-gray-700">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Účinnost od {LEGAL_EFFECTIVE_CS}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>

        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-200">
          <p className="font-semibold text-gray-900 dark:text-white">{LEGAL_COMPANY_NAME}</p>
          <p className="mt-1">{LEGAL_ADDRESS_LINE}</p>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{LEGAL_ICO_DIC_NOTE}</p>
          <p className="mt-3">
            Právní a privacy kontakt:{" "}
            <a className="text-blue-600 underline dark:text-blue-400" href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>
              {LEGAL_SUPPORT_EMAIL}
            </a>{" "}
            nebo{" "}
            <a className="text-blue-600 underline dark:text-blue-400" href={`mailto:${LEGAL_PODPORA_EMAIL}`}>
              {LEGAL_PODPORA_EMAIL}
            </a>
            .
          </p>
        </div>

        {showPricingLink ? (
          <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">
            Aktuální ceník a tarify jsou uvedeny v sekci „Ceník“ na{" "}
            <Link href={LEGAL_PRICING_HREF} className="font-medium text-blue-600 underline dark:text-blue-400">
              úvodní stránce
            </Link>
            .
          </p>
        ) : null}

        {belowPartyBlock ? <div className="mt-4">{belowPartyBlock}</div> : null}
      </header>

      <div className="prose prose-sm mt-8 max-w-none dark:prose-invert">{children}</div>

      <nav
        className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-700"
        aria-label="Související právní dokumenty"
      >
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Další dokumenty</p>
        <ul className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-4">
          {NAV.filter((n) => n.slug !== documentSlug).map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="text-blue-600 underline dark:text-blue-400 min-h-[44px] inline-flex items-center">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
