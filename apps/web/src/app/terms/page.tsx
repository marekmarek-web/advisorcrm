export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">Obchodní podmínky</h1>
      <div className="prose prose-sm max-w-none space-y-4">
        <p>
          Tyto obchodní podmínky upravují vztah mezi poskytovatelem služby Aidvisora (dále „Poskytovatel") a uživatelem
          platformy (dále „Uživatel").
        </p>
        <h2 className="text-lg font-semibold mt-6">1. Předmět služby</h2>
        <p>
          Aidvisora je platforma pro správu klientského portfolia finančních poradců. Poskytovatel zajišťuje technický
          provoz platformy a zpracování dat v souladu s platnými právními předpisy.
        </p>
        <h2 className="text-lg font-semibold mt-6">2. Registrace a přístup</h2>
        <p>
          Uživatel se registruje prostřednictvím e-mailu nebo přihlášení třetí strany (Google, Apple). Registrací
          uživatel souhlasí s těmito podmínkami a se zpracováním osobních údajů.
        </p>
        <h2 className="text-lg font-semibold mt-6">3. Ochrana údajů</h2>
        <p>
          Osobní a finanční údaje klientů jsou zpracovávány v souladu s GDPR. Podrobnosti viz{" "}
          <a href="/privacy" className="text-blue-600 underline">
            Zásady ochrany osobních údajů
          </a>
          .
        </p>
        <h2 className="text-lg font-semibold mt-6">4. Omezení odpovědnosti</h2>
        <p>
          Aidvisora je technický nástroj (SaaS) pro finanční poradce. Poskytovatel neposkytuje klientům koncových
          uživatelů finanční, investiční ani pojistné poradenství. Výpočty a kalkulace v aplikaci mají výhradně
          ilustrativní a informativní charakter a nenahrazují posouzení poradce. Obsah generovaný umělou inteligencí
          v prostředí pro poradce je interní podklad; není určen jako doporučení předávané klientovi. Uživatel
          odpovídá za správnost dat, která do systému zadává, a za komunikaci se svými klienty.
        </p>
        <h2 className="text-lg font-semibold mt-6">5. Platnost</h2>
        <p>
          Tyto podmínky jsou platné od prvního použití služby. Poskytovatel si vyhrazuje právo podmínky jednostranně
          změnit s předchozím upozorněním uživatelů.
        </p>
        <p className="text-sm text-gray-500 mt-8">Poslední aktualizace: březen 2026</p>
      </div>
    </main>
  );
}
