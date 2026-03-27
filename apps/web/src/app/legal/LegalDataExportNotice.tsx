import { LEGAL_PODPORA_EMAIL, LEGAL_SUPPORT_EMAIL } from "./legal-meta";

export function LegalDataExportNotice() {
  return (
    <section
      className="mt-10 rounded-xl border border-gray-200 bg-amber-50/80 p-4 text-sm text-gray-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-gray-200"
      aria-labelledby="legal-export-heading"
    >
      <h2 id="legal-export-heading" className="text-base font-semibold text-gray-900 dark:text-white">
        Ukončení účtu a export údajů
      </h2>
      <p className="mt-2">
        <strong>Poradce (zákazník):</strong> ukončení předplatného nebo smlouvy se řídí těmito obchodními
        podmínkami a individuální objednávkou. Žádost o ukončení nebo o spolupráci při předání dat lze
        podat e-mailem na právní kontakty uvedené v záhlaví stránky. Export dat proběhne v rozsahu
        technických možností služby a zvoleného tarifu (např. exporty dostupné v aplikaci).
      </p>
      <p className="mt-3">
        <strong>Klientská zóna:</strong> pro výpis nebo přenos údajů, které se vás týkají, se obraťte na
        svého finančního poradce jako na správce údajů. Doplňující technickou žádost můžete směřovat na{" "}
        <a className="text-blue-600 underline dark:text-blue-400" href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>
          {LEGAL_SUPPORT_EMAIL}
        </a>{" "}
        nebo{" "}
        <a className="text-blue-600 underline dark:text-blue-400" href={`mailto:${LEGAL_PODPORA_EMAIL}`}>
          {LEGAL_PODPORA_EMAIL}
        </a>
        . Funkce exportu v klientské zóně (pokud je váš poradce aktivoval) najdete v rozhraní portálu.
      </p>
      <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
        Samostatné zásady cookies budou na webu zveřejněny v okamžiku, kdy budou k dispozici v konečné
        podobě.
      </p>
    </section>
  );
}
