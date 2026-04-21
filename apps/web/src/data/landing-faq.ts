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
    a: "Asistent navrhuje shrnutí, priority a dokáže pracovat s vybranými údaji z dokumentů v rámci vašeho plánu a oprávnění. Rozhodnutí a propsání údajů do klientské evidence zůstává na vás — bez vašeho potvrzení se klientská data nemění. Konkrétní rozsah (např. AI review PDF) závisí na tarifu; limity a disclaimery jsou v dokumentu AI režim.",
  },
  {
    id: 5,
    q: "Kde jsou uložená data?",
    a: "V zabezpečeném prostředí v EU u vybraných subdodavatelů (databáze, úložiště, hosting). Pracujeme se souhlasy, exportem na žádost a postupným rozšiřováním záznamu citlivých akcí — aktuální stav popisujeme na stránce Bezpečnost.",
  },
  {
    id: 6,
    q: "Jak dlouho trvá nasazení?",
    a: "Účet založíte během několika minut. U týmů záleží na rozsahu importu a nastavení rolí — postup vás provedeme (e-mailová podpora, u větších nasazení domluva onboardingového kroku).",
  },
  {
    id: 7,
    q: "Jaké jsou integrace?",
    a: "Dnes je hlavní napojení Google Kalendář pro schůzky a termíny; od tarifu Pro Gmail a Google Drive. Systém posílá e-mailová upozornění podle událostí v aplikaci. Outlook / Microsoft 365 a SMS zvažujeme podle zpětné vazby z pilotů — zatím je neinzerujeme jako hotovou produkční funkci.",
  },
  {
    id: 8,
    q: "Jak funguje zkušební verze?",
    a: "Po založení účtu máte 14 kalendářních dní přístup k funkcím v úrovni tarifu Pro (stejné limity a možnosti jako u placeného Pro v dané době). Pak si v nastavení billing zvolíte placený tarif — Start, Pro nebo Management — nebo necháte účet bez předplatného: funkce workspace se podle našich pravidel mohou omezit (např. read-only nebo blokace vybraných modulů), ale data nemazeme automaticky jen proto, že trial skončil. Úplné mazání řešíme na vyžádání podle Zásad zpracování a smlouvy.",
  },
  {
    id: 9,
    q: "Je u vás roční závazek?",
    a: "Nejde o jednoletou minimální smlouvu v klasickém slova smyslu — tarif si spravujete v nastavení a fakturace běží měsíčně nebo ročně podle vaší volby (roční varianta je se slevou oproti součtu 12 měsíčních plateb). Konkrétní podmínky ukončení a výpovědi jsou v obchodních podmínkách.",
  },
  {
    id: 10,
    q: "Jak exportovat nebo smazat data, když skončím?",
    a: "Subjekty údajů i správci praxe mají práva dle GDPR — export a výmaz řešíme procesně podle Zásad zpracování osobních údajů a zpracovatelské smlouvy (DPA). Pro praktický postup napište na kontaktní e-mail uvedený v patičce webu nebo v právních dokumentech.",
  },
  {
    id: 11,
    q: "Je Aidvisora u ČNB registrovaný zprostředkovatel?",
    a: "Aidvisora je provozovatelem softwarové platformy (nástroj pro správu praxe a komunikace s klienty). Neposkytuje investiční nebo pojišťovací doporučení klientům a nenahrazuje regulovanou činnost poradce. Registraci a odpovědnost za klientskou radu má vždy licencovaný poradce nebo jeho firma.",
  },
  {
    id: 12,
    q: "Platí se za každého poradce zvlášť?",
    a: "Veřejný ceník uvádí cenu za jeden workspace (organizaci v systému). Konkrétní počet uživatelských účtů (poradců, asistentek) nastavujete v rámci workspace podle vaší struktury — u větších týmů nebo broker poolů si upřesnění domluvte s námi (viz stránka Pro brokery nebo e-mailem).",
  },
  {
    id: 13,
    q: "Jak dlouho uchováváte data po zrušení účtu?",
    a: "Doby uchování a postup při ukončení smlouvy jsou popsány v Zásadách zpracování osobních údajů a v obchodních podmínkách (včetně provozních záloh a technického zrušení přístupu). Po ukončení služby data dále nezpracováváme pro účely aplikace, kromě zákonných povinností nebo sporů.",
  },
  {
    id: 14,
    q: "Je součástí ceny školení nebo onboarding?",
    a: "Základní onboarding (e-mailová komunikace, dokumentace, kontrola importu) je součástí běžné podpory při náběhu. Hlubší školení celého týmu na míru nebo prémiový onboarding si lze domluvit individuálně — napište nám při větším nasazení.",
  },
] as const;
