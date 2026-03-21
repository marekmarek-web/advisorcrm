/**
 * Financial analysis – constants (FUND_DETAILS, LIABILITY_PROVIDERS, CREDIT_WISH_BANKS).
 * Extracted from financni-analyza.html (Phase 1).
 */

import type { FundDetail, LiabilityProviderGroup, CreditWishBank } from './types';

export const FUND_DETAILS: Record<string, FundDetail> = {
  creif: {
    name: 'CREIF',
    manager: 'CAIAC Fund Management AG',
    goal: 'Stabilní dlouhodobé zhodnocení z komerčních nemovitostí',
    assets: 'Maloobchodní parky, logistika a lehká výroba',
    yield: 'Pravidelný nájemní výnos + dlouhodobý růst hodnoty',
    risks: 'Tržní výkyvy cen nemovitostí, obsazenost, úrokové sazby',
    liquidity: 'Měsíční valuace, výběr standardně ve tříměsíční lhůtě',
    suitable: 'Konzervativní až vyvážení investoři',
    why: 'EFEKTA Real Estate Fund cílí na stabilní výnos, vysokou diverzifikaci nájemců a regionů a nízkou rizikovost.',
    defaultRate: 0.05,
    description: 'EFEKTA Real Estate Fund (dříve CREIF) je nemovitostní fond zaměřený na stávající komerční nemovitosti ve střední Evropě. Zakládá si na stabilním nájemním výnosu, vysoké diverzifikaci a dlouhodobém investičním přístupu.',
    strategy: 'Fond se soustředí především na regionální retail parky, logistické objekty a lehkou výrobu. Důraz je na bonitní nájemce, dlouhodobé nájemní smlouvy a predikovatelné cashflow.',
    riskSRI: '3/7',
    horizon: '4+ roky',
    currency: 'CZK nebo EUR',
    minInvestment: '500 Kč / 125 EUR',
    category: 'Nemovitostní',
    heroImage: '/report-assets/creif/creif-816.jpg',
    galleryImages: [
      '/report-assets/creif/creif-818.jpg',
      '/report-assets/creif/creif-853.jpg',
      '/report-assets/creif/creif-813.jpg',
    ],
    benefits: [
      'Více než 300 nájemců a široká segmentová i regionální diverzifikace portfolia.',
      'Dlouhodobé nájemní smlouvy s bonitními nájemci stabilizují výnos fondu.',
      'Nízká rizikovost fondu (SRI 3) díky zaměření na odolné komerční segmenty.',
      'Dostupná minimální investice a pravidelná měsíční valuace.',
    ],
    countries: [
      { name: 'Česká republika', weight: 40 },
      { name: 'Polsko', weight: 25 },
      { name: 'Maďarsko', weight: 20 },
      { name: 'Chorvatsko', weight: 15 },
    ],
    sectors: [
      { name: 'Maloobchodní nemovitosti', weight: 55 },
      { name: 'Logistika a sklady', weight: 30 },
      { name: 'Lehká výroba', weight: 15 },
    ],
  },
  atris: {
    name: 'ATRIS',
    manager: 'ATRIS investiční společnost',
    goal: 'Stabilní výnos z komerčních nemovitostí',
    assets: 'Kanceláře, retail, logistika, zdravotnické objekty',
    yield: 'Nájemné + dlouhodobý růst hodnoty',
    risks: 'Tržní riziko nemovitostí, obsazenost, likvidita',
    liquidity: 'Likvidita fondu cca 30 pracovních dnů',
    suitable: 'Investoři hledající konzervativnější nemovitostní složku',
    why: 'Fond Realita patří mezi nejdéle fungující retailové nemovitostní fondy v ČR a dlouhodobě drží stabilní výkonnost.',
    defaultRate: 0.047,
    description: 'Realita nemovitostní otevřený podílový fond (ATRIS IS) investuje do nemovitostí v ČR. Spravuje portfolio o hodnotě přibližně 6,9 mld. Kč, s více než 170 nájemci a průměrnou délkou nájemních smluv přes 7 let.',
    strategy: 'Diverzifikované portfolio komerčních nemovitostí napříč odvětvími (kanceláře, retail, zdravotnictví, technologie). Důraz na dlouhodobé nájemní vztahy a stabilní výnos.',
    riskSRI: '3/7',
    horizon: '5+ let',
    currency: 'CZK',
    minInvestment: '500 Kč',
    category: 'Nemovitostní',
    heroImage: '/report-assets/atris/atris1.jpg',
    galleryImages: [
      '/report-assets/atris/atris2.jpg',
      '/report-assets/atris/atris3.jpg',
    ],
    benefits: [
      'Jeden z nejstarších retailových nemovitostních fondů v ČR (od roku 2009).',
      'Více než 20 tisíc investorů a dlouhodobě stabilní výkonnost.',
      'Konzervativní profil s nižší volatilitou oproti čistě akciovým fondům.',
      'Silná diverzifikace portfolia napříč typy nemovitostí a nájemci.',
    ],
    countries: [
      { name: 'Polyfunkční objekty', weight: 52 },
      { name: 'Zdravotnické objekty', weight: 12 },
      { name: 'Technologické a ostatní objekty', weight: 36 },
    ],
  },
  penta: {
    name: 'Penta Investments',
    manager: 'Penta Investments',
    goal: 'Dlouhodobý růst hodnoty firem v regionu CEE',
    assets: 'Dr.Max, Fortuna, Penta Hospitals, Aero Vodochody',
    yield: 'Růst hodnoty podílů a ziskovosti firem',
    risks: 'Koncentrace regionu, manažerské riziko, nižší likvidita',
    liquidity: 'Čtvrtletní (s výpovědní lhůtou)',
    suitable: 'Zkušení investoři',
    why: 'Umožňuje podílet se na vývoji velkých firem v regionu střední Evropy prostřednictvím privátního kapitálu.',
    defaultRate: 0.09,
    description: 'Penta se zaměřuje na dlouhodobé investice do firem ve střední Evropě. Factsheet uvádí více než 30 let zkušeností, působení na 8+ trzích, přibližně 50 tisíc zaměstnanců a čistou hodnotu aktiv kolem 4,43 mld. EUR.',
    strategy: 'Investice do etablovaných společností s růstovým potenciálem: Dr.Max (lékárenství), Fortuna (sázkový a herní průmysl), Penta Hospitals (zdravotnictví), Aero Vodochody (letecký průmysl).',
    riskSRI: '4/7',
    horizon: '7–10 let',
    currency: 'EUR',
    minInvestment: '1 000 000 Kč',
    category: 'Privátní kapitál',
    heroImage: '/logos/Penta.png',
    galleryImages: [
      '/report-assets/penta/penta1.png',
      '/report-assets/penta/penta2.jpg',
      '/report-assets/penta/penta3.webp',
    ],
    benefits: [
      'Přístup k privátním investicím běžně nedostupným pro retailové investory.',
      'Aktivní správa portfoliových firem zkušeným investičním týmem.',
      'Potenciál nadprůměrných výnosů díky operativní restrukturalizaci.',
      'Silná historie skupiny a dlouhodobá přítomnost na trzích CEE.',
    ],
    countries: [
      { name: 'Zdravotnictví', weight: 30 },
      { name: 'Sázky a herní průmysl', weight: 25 },
      { name: 'Letecký průmysl', weight: 25 },
      { name: 'Maloobchod', weight: 20 },
    ],
  },
  ishares: {
    name: 'iShares Core MSCI World',
    manager: 'BlackRock',
    goal: 'Kopírování globálního trhu',
    assets: '1500+ akcií z vyspělých zemí',
    yield: 'Růst cen akcií + Dividendy',
    risks: 'Tržní riziko, Měnové riziko',
    liquidity: 'Denní (Burza)',
    suitable: 'Všichni investoři (základ portfolia)',
    why: 'Maximální diverzifikace za minimální poplatek.',
    defaultRate: 0.12,
    description: 'Pasivně řízený fond kopírující index MSCI World. Fyzicky investuje do přibližně 1 320 společností z 23 rozvinutých zemí — pokrývá zhruba 85 % volně obchodovatelné tržní kapitalizace vyspělého světa. Jeden z nejrespektovanějších nástrojů pro globální diverzifikaci.',
    strategy: 'Index vážený tržní kapitalizací. USA cca 69 %, Japonsko 5,4 %, Velká Británie 3,7 %, Kanada 2,9 %. Sektory: technologie (28 %), finance (14 %), spotřební zboží (10 %), průmysl (10 %).',
    riskSRI: '5/7',
    horizon: '10+ let',
    currency: 'USD',
    morningstarRating: 5,
    category: 'Akciové ETF',
    galleryImages: [
      '/report-assets/msci/msci1.png',
      '/report-assets/msci/msci2.png',
      '/report-assets/msci/msci3.png',
    ],
    benefits: [
      '<strong>Okamžitá diverzifikace</strong> do 1 320 firem jedním nákupem.',
      '<strong>Nejvyšší likvidita</strong> — fond prodejný kdykoliv v obchodních hodinách burzy.',
      'Ocenění <strong>Morningstar Bronze</strong> pro ETF kategorii.',
      'Zcela transparentní složení, denně aktualizované informace o portfoliu.',
    ],
    parameters: {
      'Měna': 'USD',
      'Min. investice': '1 podíl',
      'Typické zastoupení': 'Akcie vyspělých trhů',
    },
    top10WeightPercent: 26.46,
    totalHoldingsCount: 1317,
    topHoldings: [
      { name: 'NVIDIA Corp.', weight: 5.47 },
      { name: 'Apple', weight: 4.48 },
      { name: 'Microsoft', weight: 3.58 },
      { name: 'Amazon.com, Inc.', weight: 2.71 },
      { name: 'Alphabet, Inc. A', weight: 2.3 },
      { name: 'Alphabet, Inc. C', weight: 1.94 },
      { name: 'Meta Platforms', weight: 1.87 },
      { name: 'Broadcom Inc.', weight: 1.74 },
      { name: 'Tesla', weight: 1.38 },
      { name: 'JPMorgan Chase & Co.', weight: 0.99 },
    ],
    countries: [
      { name: 'USA', weight: 69 },
      { name: 'Japonsko', weight: 5.4 },
      { name: 'Velká Británie', weight: 3.7 },
      { name: 'Kanada', weight: 2.9 },
    ],
    sectors: [
      { name: 'Technologie', weight: 27.25 },
      { name: 'Finance', weight: 14.51 },
      { name: 'Průmysl', weight: 10.65 },
      { name: 'Spotřební zboží (cyklické)', weight: 9.88 },
      { name: 'Ostatní', weight: 37.71 },
    ],
  },
  alternative: {
    name: 'Alternativní investice',
    manager: 'Různé',
    goal: 'Nadstandardní výnos z alternativních aktiv',
    assets: 'Privátní kapitál, rizikový kapitál, komodity',
    yield: 'Růst hodnoty + Dividendy',
    risks: 'Vysoké riziko, Nízká likvidita',
    liquidity: 'Roční / Víceletá',
    suitable: 'Zkušení investoři s dlouhým horizontem',
    why: 'Potenciálně nejvyšší výnos za cenu nízké likvidity a vyššího rizika.',
    defaultRate: 0.12,
    riskSRI: '6/7',
    horizon: '10+ let',
    category: 'Alternativní',
  },
  fidelity2040: {
    name: 'Fidelity Target 2040',
    manager: 'Fidelity International',
    goal: 'Růst s cílovým datem',
    assets: 'Mix akcií a dluhopisů (dynamicky se mění)',
    yield: 'Tržní zhodnocení aktiv',
    risks: 'Tržní riziko (klesá v čase)',
    liquidity: 'Denní',
    suitable: 'Investoři s cílem kolem roku 2040',
    why: 'Automaticky řídí alokaci a snižuje riziko s blížícím se cílem.',
    defaultRate: 0.07,
    description: 'Fond životního cyklu s aktivní správou. Investuje do 45 podkladových Fidelity fondů, spravuje přes 32 miliard USD. Aktuální alokace: 90 % akcie, 10 % dluhopisy a hotovost. Postupně snižuje rizikovost směrem k cílovému roku 2040.',
    strategy: '„Glide path" — postupně snižuje rizikovost. Aktuálně: 44 % US akcie, 36 % zahraniční akcie, 17 % dluhopisy. Největší podkladový fond: Fidelity Series Equity-Income.',
    riskSRI: '4/7',
    horizon: 'Do roku 2040',
    currency: 'EUR',
    category: 'Smíšený (Lifecycle)',
    benefits: [
      '<strong>Automatická správa alokace</strong> — „glide path" snižuje riziko v čase.',
      '<strong>Profesionální rebalancing</strong> zkušeným týmem Fidelity International.',
      'Vhodné pro penzijní spoření s jasně definovaným horizontem.',
      'Aktivní výběr titulů z více než 45 podkladových fondů.',
    ],
    countries: [
      { name: 'US akcie', weight: 44 },
      { name: 'Mezinárodní akcie', weight: 36 },
      { name: 'Dluhopisy', weight: 17 },
      { name: 'Hotovost', weight: 3 },
    ],
  },
  conseq: {
    name: 'Conseq Globální Akciový',
    manager: 'Conseq IM',
    goal: 'Aktivní výběr akcií',
    assets: 'Globální akcie (Value/Growth mix)',
    yield: 'Růst cen akcií',
    risks: 'Tržní riziko, Výběr titulů',
    liquidity: 'Denní',
    suitable: 'Pravidelné investování',
    why: 'Aktivní správa může v určitých fázích překonat trh.',
    defaultRate: 0.07,
    description: 'Plně dynamický DPS fond s absolutním vítězstvím Zlaté koruny 2024 v kategorii penzijní spoření. Od vzniku v roce 2013 dosáhl celkového zhodnocení +224 % (průměrně 9,5 % p.a.). Investuje přímo do akcií a ETF s důrazem na středoevropské trhy.',
    strategy: 'Akcie přímo nebo přes ETF a deriváty. Důraz na střední Evropu pro snížení měnového rizika. Od založení (2013) +224 % celkem, průměrně 9,5 % p.a. Výnos 2024: +12,4 %, výnos 2023: +21,9 %.',
    riskSRI: '5/7',
    horizon: '5+ let',
    currency: 'CZK',
    awards: 'Zlatá koruna 2024 — 1. místo',
    category: 'Účastnický fond (DPS)',
    benefits: [
      'Absolutní vítěz <strong>Zlatá koruna 2024</strong> — 1. místo v kategorii penzijní spoření.',
      'Daňové zvýhodnění: odpočet ze základu daně až <strong>48 000 Kč / rok</strong>.',
      'Státní příspěvek až <strong>340 Kč / měsíc</strong> zcela zdarma.',
      'Možnost garance prostředků blížícím se koncem investičního horizontu.',
    ],
    countries: [
      { name: 'Celkem od 2013', weight: 224 },
      { name: 'Průměr p.a.', weight: 9.5 },
    ],
  },
};

/** Logo paths – složka logos v public (nebo repo root logos zkopírovat do apps/web/public/logos). */
export const FUND_LOGOS: Record<string, string> = {
  creif: '/logos/creif.png',
  atris: '/logos/atris.png',
  penta: '/logos/Penta.png',
  ishares: '/logos/ishares.png',
  alternative: '',
  fidelity2040: '/logos/fidelity.png',
  conseq: '/logos/conseq.png',
};

export const LIABILITY_PROVIDERS: LiabilityProviderGroup[] = [
  {
    group: 'Banky',
    names: [
      'Česká spořitelna',
      'ČSOB',
      'Komerční banka',
      'UniCredit Bank',
      'Raiffeisenbank',
      'MONETA Money Bank',
      'Fio banka',
      'mBank',
      'Air Bank',
      'Oberbank',
      'PPF banka',
      'Expobank',
      'Trinity Bank',
      'CREDITAS',
      'Waldviertler Sparkasse',
      'Wüstenrot - stavební spořitelna',
      'ČMSS',
      'Modrá pyramida',
    ],
  },
  {
    group: 'Nebankovní poskytovatelé',
    names: [
      'Home Credit',
      'Cofidis',
      'Provident Financial',
      'Zonky',
      'Profi Credit',
      'Creditstar',
      'Ferratum',
      'Santander Consumer Finance',
      'Acema Credit',
      'BB Finance',
      'Zaplo Finance',
      'Český Triangl',
      'Dollar Financial',
      'Friendly Finance',
      'CreditPortal',
      'Via SMS',
      'Net Credit',
      'Kreditech',
      'creditON.cz',
      '4finance',
      'SMART Lending',
      'Wero Finance',
      'Credit 2.0',
      'Mikrofinance',
    ],
  },
  {
    group: 'Leasingové společnosti',
    names: [
      'ČSOB Leasing',
      'KB Leasing',
      'Komerční banka - Auto Leasing',
      'PPF Leasing',
      'UniCredit Leasing',
      'Raiffeisen Leasing',
      'LeasePlan',
      'Arval',
      'Alphabet',
      'DLL',
      'SG Equipment Finance',
      'CETELEM',
      'Česká spořitelna Leasing',
      'Santander Consumer Leasing',
      'BNP Paribas Leasing',
      'SG Fleet',
      'ALD Automotive',
      'Porsche Financial Services',
      'BMW Financial Services',
      'Škoda Auto VWF',
    ],
  },
  { group: '—', names: ['Jiný / neuvedeno'] },
];

/** Flat list of all provider names for dropdowns. */
export function getLiabilityProviderOptions(): string[] {
  return LIABILITY_PROVIDERS.flatMap((g) => g.names);
}

/** Only bank providers – for mortgage dropdown. */
export function getMortgageProviderOptions(): string[] {
  const bankGroup = LIABILITY_PROVIDERS.find((g) => g.group === 'Banky');
  return bankGroup ? [...bankGroup.names] : [];
}

/** Providers filtered by loan type. */
export function getLoanProvidersByType(loanType: string): string[] {
  if (loanType === 'Leasing') {
    const leasing = LIABILITY_PROVIDERS.find((g) => g.group === 'Leasingové společnosti');
    return leasing ? [...leasing.names] : [];
  }
  if (loanType === 'Spotřebitelský úvěr' || loanType === 'Kreditní karta' || loanType === 'Kontokorent') {
    return LIABILITY_PROVIDERS
      .filter((g) => g.group === 'Banky' || g.group === 'Nebankovní poskytovatelé' || g.group === '—')
      .flatMap((g) => g.names);
  }
  return getLiabilityProviderOptions();
}

export const LOAN_TYPES = [
  'Spotřebitelský úvěr',
  'Kreditní karta',
  'Kontokorent',
  'Leasing',
  'Jiný',
] as const;

export const INVESTMENT_ASSET_TYPES = ['Akcie', 'Dluhopisy', 'Krypto', 'ETF', 'Stavební spoření', 'Zlato', 'Kovy', 'Jiné'] as const;
export const PENSION_ASSET_TYPES = ['DPS', 'DIP', 'PP'] as const;

export const CREDIT_WISH_BANKS: CreditWishBank[] = [
  { id: 'unicredit', name: 'UniCredit Bank', rateHypo: 4.19, rateLoan: 6.2 },
  { id: 'rb', name: 'Raiffeisenbank', rateHypo: 4.29, rateLoan: 6.5 },
  { id: 'csob', name: 'ČSOB / Komerční banka', rateHypo: 4.39, rateLoan: 6.9 },
  { id: 'cs', name: 'Česká spořitelna', rateHypo: 4.49, rateLoan: 6.5 },
  { id: 'moneta', name: 'MONETA Money Bank', rateHypo: 4.35, rateLoan: 6.8 },
  { id: 'fio', name: 'Fio banka', rateHypo: 4.25, rateLoan: 6.4 },
  { id: 'mbank', name: 'mBank', rateHypo: 4.45, rateLoan: 6.7 },
  { id: 'airbank', name: 'Air Bank', rateHypo: 4.29, rateLoan: 6.3 },
  { id: 'other', name: 'Jiná banka', rateHypo: 4.5, rateLoan: 7 },
];

export const CREDIT_PURPOSE_OPTIONS: { value: string; label: string }[] = [
  { value: 'bydleni-koupě', label: 'Bydlení – koupě nemovitosti' },
  { value: 'bydleni-rekonstrukce', label: 'Bydlení – rekonstrukce' },
  { value: 'auto', label: 'Auto / vozidlo' },
  { value: 'konsolidace', label: 'Konsolidace úvěrů' },
  { value: 'ostatni', label: 'Ostatní' },
];

export const LTV_OPTIONS = [80, 90] as const;

export const STORAGE_KEY = 'financial_plan_state';

export const RENTA_INFLATION = 0.03;
export const RENTA_WITHDRAWAL_RATE = 0.06;

/** Přepočet čistá ↔ hrubá mzda (pro pojištění). */
export const GROSS_FROM_NET_FACTOR = 0.74;

/** Zajištění příjmů – kalkulačka mzda vs benefit. Sazby jsou v constants; pro multi-tenant lze v budoucnu číst z tenant config. */
export const BENEFIT_OPTIMIZATION = {
  /** Koeficient čistá z hrubé (např. 0,67 → z 1000 Kč hrubé cca 670 Kč čistého). */
  netFromGrossFactor: 0.67,
  /** Odvody z hrubé mzdy v % (např. 33,8). */
  deductionsPercent: 33.8,
  /** Náklad firmy na 1 Kč hrubé (odvody zaměstnavatele, např. 1,338). */
  employerCostFactor: 1.338,
  /** Daňová úspora majitelů při benefitu (21 %). */
  ownerTaxSavingsPercent: 21,
} as const;

/** Logo cesty pro pojišťovny (název pojišťovny → cesta v public). */
export const INSURANCE_LOGOS: Record<string, string> = {
  'ČSOB Pojišťovna': '/logos/csob-logo.png',
  'Allianz pojišťovna': '/logos/allianz.png',
  'Generali Pojišťovna': '/logos/generali.png',
  'Kooperativa': '/logos/kooperativa_logo.png',
  'Slavia pojišťovna': '/logos/slavia.jpg',
  'Česká podnikatelská pojišťovna': '/logos/cpp.png',
  'Maxima pojišťovna': '/logos/maxima.png',
  'NN pojišťovna': '/logos/nn.png',
  'UNIQA': '/logos/uniqa.png',
  'AXA': '/logos/axa.png',
  'MetLife': '/logos/metlife.png',
};

/** České pojišťovny pro dropdown. */
export const INSURANCE_COMPANIES_CS: string[] = [
  "ČSOB Pojišťovna",
  "Allianz pojišťovna",
  "Generali Pojišťovna",
  "Kooperativa",
  "Slavia pojišťovna",
  "Česká podnikatelská pojišťovna",
  "Maxima pojišťovna",
  "NN pojišťovna",
  "UNIQA",
  "AXA",
  "MetLife",
  "Jiná / neuvedeno",
];

export const STEP_TITLES = [
  'Klient',
  'Cashflow',
  'Majetek',
  'Úvěry',
  'Cíle',
  'Strategie',
  'Zajištění',
  'Shrnutí',
] as const;

/** Počet kroků bez firemního rozšíření. */
export const TOTAL_STEPS = 8;

/** Titulky kroků; při includeCompany vloží „FIRMA“ za Cashflow. */
export function getStepTitles(includeCompany: boolean): readonly string[] {
  if (!includeCompany) return STEP_TITLES;
  return [
    STEP_TITLES[0],
    STEP_TITLES[1],
    'FIRMA',
    ...STEP_TITLES.slice(2),
  ];
}

/** Shared labels for financial analysis status (client card summary + analyses list). */
export const ANALYSIS_STATUS_LABELS: Record<string, string> = {
  draft: "Rozpracováno",
  completed: "Dokončeno",
  exported: "Exportováno",
  archived: "Archivováno",
  missing: "Chybí",
};

export function getAnalysisStatusLabel(status: string): string {
  return ANALYSIS_STATUS_LABELS[status] ?? status;
}
