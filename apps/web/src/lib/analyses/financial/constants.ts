/**
 * Financial analysis – constants (FUND_DETAILS, LIABILITY_PROVIDERS, CREDIT_WISH_BANKS).
 * Extracted from financni-analyza.html (Phase 1).
 */

import type { FundDetail, LiabilityProviderGroup, CreditWishBank } from './types';

export const FUND_DETAILS: Record<string, FundDetail> = {
  creif: {
    name: 'CREIF',
    manager: 'Generali Investments',
    goal: 'Stabilní výnos z nájmů',
    assets: 'Komerční a logistické parky (CEE)',
    yield: 'Nájemné + Zhodnocení nemovitostí',
    risks: 'Obsazenost, Likvidita nemovitostí, Úrokové sazby',
    liquidity: 'Čtvrtletní / Roční',
    suitable: 'Konzervativní investoři',
    why: 'Zajišťuje stabilní, inflaci překonávající výnos s nižší volatilitou.',
    defaultRate: 0.06,
  },
  atris: {
    name: 'ATRIS',
    manager: 'ATRIS investiční společnost',
    goal: 'Dlouhodobý růst kapitálu',
    assets: 'Infrastruktura, Energetika, Private Equity',
    yield: 'Dividendy z projektů + Růst hodnoty',
    risks: 'Projektové riziko, Regulace, Likvidita',
    liquidity: 'Roční',
    suitable: 'Investoři s delším horizontem',
    why: 'Přináší expozici vůči reálným aktivům mimo veřejné trhy.',
    defaultRate: 0.06,
  },
  penta: {
    name: 'PENTA Public',
    manager: 'Penta Investments',
    goal: 'Rozvoj firem v regionu CEE',
    assets: 'Dr.Max, Fortuna, Penta Hospitals',
    yield: 'Růst hodnoty společností (EBITDA)',
    risks: 'Koncentrace regionu, Manažerské riziko, Likvidita',
    liquidity: 'Čtvrtletní (s výpovědní lhůtou)',
    suitable: 'Zkušení investoři',
    why: 'Umožňuje podílet se na úspěchu největších firem v regionu.',
    defaultRate: 0.09,
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
    strategy: 'iShares Core MSCI World UCITS ETF USD (Acc) je pasivně řízený fond kopírující index MSCI World. Index zahrnuje akcie velkých a středních firem z 23 vyspělých trhů.',
    benefits: [
      'Nízké náklady (TER)',
      'Široká diverzifikace napříč sektory a zeměmi',
      'Denní obchodovatelnost na burze',
      'Akumulační podíl – dividendy se automaticky reinvestují',
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
      { name: 'USA', weight: 67.33 },
      { name: 'Japonsko', weight: 5.59 },
      { name: 'Velká Británie', weight: 3.37 },
      { name: 'Kanada', weight: 3.05 },
      { name: 'Ostatní', weight: 20.66 },
    ],
    sectors: [
      { name: 'Technology', weight: 27.25 },
      { name: 'Financials', weight: 14.51 },
      { name: 'Industrials', weight: 10.65 },
      { name: 'Consumer Discretionary', weight: 9.88 },
      { name: 'Ostatní', weight: 37.71 },
    ],
  },
  alternative: {
    name: 'Alternativní investice',
    manager: 'Různé',
    goal: 'Nadstandardní výnos z alternativních aktiv',
    assets: 'Private Equity, Venture Capital, Komodity',
    yield: 'Růst hodnoty + Dividendy',
    risks: 'Vysoké riziko, Nízká likvidita',
    liquidity: 'Roční / Víceletá',
    suitable: 'Zkušení investoři s dlouhým horizontem',
    why: 'Potenciálně nejvyšší výnos za cenu nízké likvidity a vyššího rizika.',
    defaultRate: 0.12,
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
  },
  conseq: {
    name: 'Conseq Globální',
    manager: 'Conseq IM',
    goal: 'Aktivní výběr akcií',
    assets: 'Globální akcie (Value/Growth mix)',
    yield: 'Růst cen akcií',
    risks: 'Tržní riziko, Výběr titulů',
    liquidity: 'Denní',
    suitable: 'Pravidelné investování',
    why: 'Aktivní správa může v určitých fázích překonat trh.',
    defaultRate: 0.07,
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

/** Logo cesty pro pojišťovny (název pojišťovny → cesta v public). Složka např. public/logos/insurers/. */
export const INSURANCE_LOGOS: Record<string, string> = {
  'ČSOB Pojišťovna': '/logos/insurers/csob.png',
  'Allianz pojišťovna': '/logos/insurers/allianz.png',
  'Generali Pojišťovna': '/logos/insurers/generali.png',
  'Kooperativa': '/logos/insurers/kooperativa.png',
  'Slavia pojišťovna': '/logos/insurers/slavia.png',
  'NN pojišťovna': '/logos/insurers/nn.png',
  'UNIQA': '/logos/insurers/uniqa.png',
  'AXA': '/logos/insurers/axa.png',
  'MetLife': '/logos/insurers/metlife.png',
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
