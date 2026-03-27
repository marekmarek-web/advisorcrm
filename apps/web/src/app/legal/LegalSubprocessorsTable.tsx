import { LEGAL_EFFECTIVE_CS } from "./legal-meta";

const ROWS: { name: string; purpose: string; region: string }[] = [
  {
    name: "Supabase (PostgreSQL, Auth, Storage)",
    purpose: "Databáze, autentizace, úložiště souborů",
    region: "Primárně EU (region dle nastavení projektu); smluvní dokumentace poskytovatele",
  },
  {
    name: "Vercel Inc.",
    purpose: "Hosting aplikace, CDN, serverless funkce, cron",
    region: "Globální infrastruktura; u přenosu mimo EHP typicky SCC dle dokumentace Vercel",
  },
  {
    name: "Resend",
    purpose: "Transakční a systémové e-maily",
    region: "USA / EU dle konfigurace; smluvní rámec poskytovatele",
  },
  {
    name: "Sentry",
    purpose: "Monitoring chyb a výkonu",
    region: "EU nebo USA dle konfigurace projektu; DPA poskytovatele",
  },
  {
    name: "Stripe",
    purpose: "Zpracování plateb a fakturace (pokud je pro účet aktivní)",
    region: "Mezinárodní zpracování dle nastavení Stripe a platných záruk",
  },
  {
    name: "OpenAI / jiný poskytovatel LLM",
    purpose: "Technické zpracování požadavků u funkcí založených na AI (pokud jsou zapnuty)",
    region: "Dle nastavení produkčního režimu a smluv; u mezinárodního přenosu vhodné záruky (např. SCC)",
  },
];

export function LegalSubprocessorsTable() {
  return (
    <section className="mt-10 scroll-mt-24" aria-labelledby="legal-subprocessors-heading">
      <h2
        id="legal-subprocessors-heading"
        className="text-lg font-semibold text-gray-900 dark:text-white"
      >
        Přehled vybraných subdodavatelů (zkrácený)
      </h2>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
        Primární smluvní vztah k uživatelům platformy je veden z České republiky. Níže jsou uvedeni
        typičtí subdodavatelé infrastruktury a služeb používaných v aktuální architektuře. Úplný nebo
        aktualizovaný seznam může být součástí zpracovatelské smlouvy nebo interní dokumentace;
        tato tabulka slouží jako orientační přehled ke dni {LEGAL_EFFECTIVE_CS}.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-3 py-2 font-semibold text-gray-900 dark:text-white">Subjekt / služba</th>
              <th className="px-3 py-2 font-semibold text-gray-900 dark:text-white">Účel</th>
              <th className="px-3 py-2 font-semibold text-gray-900 dark:text-white">Region / rámec</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
            {ROWS.map((r) => (
              <tr key={r.name} className="bg-white dark:bg-gray-950/30">
                <td className="px-3 py-2 align-top text-gray-800 dark:text-gray-200">{r.name}</td>
                <td className="px-3 py-2 align-top text-gray-800 dark:text-gray-200">{r.purpose}</td>
                <td className="px-3 py-2 align-top text-gray-800 dark:text-gray-200">{r.region}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
