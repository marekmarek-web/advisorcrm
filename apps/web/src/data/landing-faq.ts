/** Obsah FAQ na landing page — sdílené pro UI a JSON-LD schema. */
export const LANDING_FAQS = [
  {
    id: 1,
    q: "Umí to importovat existující data?",
    a: "Ano. Klienty a základní údaje importujete z Excelu nebo CSV. Pomůžeme s napárováním sloupců a duplicitami, abyste nemuseli nic zbytečně přepisovat.",
  },
  {
    id: 2,
    q: "Je to vhodné pro celý tým?",
    a: "Ano. Samostatný poradce i tým s rolemi a sdíleným přehledem. Nastavíte, kdo vidí klienty, úkoly a reporty.",
  },
  {
    id: 3,
    q: "Jak funguje klientská zóna?",
    a: "Klient má v portálu přehledný přístup k dokumentům a stavu věcí. U vyšších tarifů může chatovat a zadávat nové požadavky; u vstupního tarifu Start jsou tyto části v produktu vypnuté — klient pracuje hlavně s dokumenty. Vy dostanete upozornění a řešíte věci v jednom toku v aplikaci.",
  },
  {
    id: 4,
    q: "Co přesně AI umí a neumí?",
    a: "Asistent navrhuje shrnutí, priority a dokáže pracovat s vybranými údaji z dokumentů v rámci vašeho plánu a oprávnění. Rozhodnutí a propsání do Aidvisory zůstává na vás — bez vašeho potvrzení se klientská data nemění. Konkrétní rozsah (např. AI review PDF) závisí na tarifu.",
  },
  {
    id: 5,
    q: "Kde jsou uložená data?",
    a: "V zabezpečeném prostředí v EU. Podporujeme auditní stopu, práci se souhlasy a export podle potřeby vaší praxe.",
  },
  {
    id: 6,
    q: "Jak dlouho trvá nasazení?",
    a: "Účet založíte během několika minut. U týmů záleží na rozsahu importu a nastavení rolí — postup vás provedeme.",
  },
  {
    id: 7,
    q: "Jaké jsou integrace?",
    a: "Google Kalendář je hlavní napojení pro schůzky a termíny. Systém posílá e-mailová upozornění podle událostí v aplikaci. Další integrace doplňujeme podle zpětné vazby — Outlook nebo SMS zatím jako samostatná produkční funkce neinzerujeme.",
  },
  {
    id: 8,
    q: "Jak funguje zkušební verze?",
    a: "Po založení účtu máte 14 kalendářních dní přístup k funkcím v úrovni tarifu Pro (stejné limity a možnosti jako u placeného Pro v dané době). Předplatné si pak zvolíte v nastavení — Start, Pro nebo Management. Pokud na placený tarif nepřejdete, přístup se může omezit podle pravidel workspace; data se standardně nemažou bez vašeho kroku.",
  },
] as const;
