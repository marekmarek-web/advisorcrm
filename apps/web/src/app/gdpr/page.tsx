import Link from "next/link";

export default function GdprPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-monday-text mb-6">Ochrana osobních udaju (GDPR)</h1>
      <div className="text-sm text-monday-text space-y-4">
        <p>Tato stranka popisuje zpracovani osobnich udaju v souladu s GDPR. Spravcem je vas poradce / provozovatel workspace.</p>
        <p>Ucel: poradenske sluzby, evidence smluv a dokumentu, komunikace, Client Zone.</p>
        <p>Prava: pristup, oprava, vymaz, omezeni, prenosnost, stiznost u UOOOU. Export dat: vyuzijte Export v Client Zone nebo kontaktujte poradce.</p>
      </div>
      <p className="mt-8">
        <Link href="/" className="text-monday-blue font-medium">Zpet</Link>
      </p>
    </div>
  );
}
