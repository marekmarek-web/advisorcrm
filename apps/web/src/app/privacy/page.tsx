export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">Zásady ochrany osobních údajů</h1>
      <div className="prose prose-sm max-w-none space-y-4">
        <h2 className="text-lg font-semibold mt-2">1. Správce údajů</h2>
        <p>
          Správcem osobních údajů je společnost provozující službu Aidvisora (dále „Správce“), v rozsahu uvedeném ve
          smlouvě nebo v nastavení vašeho účtu. V kontextu klientské zóny mohou být údaje zpracovávány též vaším
          finančním poradcem jako samostatným správcem nebo společným správcem podle konkrétního vztahu.
        </p>

        <h2 className="text-lg font-semibold mt-6">2. Jaké údaje zpracováváme</h2>
        <p>Zpracováváme zejména:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>identifikační a kontaktní údaje (jméno, e-mail, telefon);</li>
          <li>údaje o účtu a používání platformy (přihlášení, nastavení, logy);</li>
          <li>obsah související s poradenstvím a dokumenty nahrané do systému v souladu s oprávněním;</li>
          <li>technické údaje (IP, cookies, pokud je to relevantní pro provoz a bezpečnost).</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">3. Účel a právní základ</h2>
        <p>
          Údaje zpracováváme za účelem poskytování služby Aidvisora, plnění smlouvy, komunikace s uživateli,
          zajištění bezpečnosti, evidence dokumentů v rámci oprávnění a plnění právních povinností. Právní základem je
          plnění smlouvy, oprávněný zájem (bezpečnost, zlepšování služby) nebo souhlas, pokud je vyžadován.
        </p>
        <p>
          Funkce založené na umělé inteligenci v prostředí pro poradce slouží jako interní podpora a informativní
          podklady; nejsou určeny jako automatické doporučení finančních produktů klientům koncových uživatelů.
        </p>

        <h2 className="text-lg font-semibold mt-6">4. Doba uchovávání</h2>
        <p>
          Údaje uchováváme po dobu trvání účtu a následně po dobu nezbytnou pro účely uvedené výše, včetně archivace
          podle zákona a uplatnění nároků. Po uplynutí lhůty je anonymizujeme nebo vymažeme.
        </p>

        <h2 className="text-lg font-semibold mt-6">5. Práva subjektů údajů</h2>
        <p>Máte právo na přístup, opravu, výmaz, omezení zpracování, přenositelnost údajů a vznést námitku tam, kde to
          přísluší. Můžete podat stížnost u Úřadu pro ochranu osobních údajů (www.uoou.cz).</p>

        <h2 className="text-lg font-semibold mt-6">6. Kontakt</h2>
        <p>
          Ohledně osobních údajů nás kontaktujte prostřednictvím e-mailu uvedeného v aplikaci nebo na webu Aidvisora, nebo
          svého poradce, pokud se údaje týkají klientské zóny.
        </p>

        <p className="text-sm text-gray-500 mt-8">Poslední aktualizace: březen 2026</p>
      </div>
    </main>
  );
}
