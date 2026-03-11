/**
 * Financial analysis – constants (FUND_DETAILS, LIABILITY_PROVIDERS, CREDIT_WISH_BANKS).
 * Extracted from financni-analyza.html (Phase 1).
 */

import type { FundDetail, LiabilityProviderGroup, CreditWishBank } from './types';

export const FUND_DETAILS: Record<string, FundDetail> = {
  imperial: {
    name: 'AlgoImperial',
    manager: 'Imperium Finance',
    goal: 'Absolutní výnos nezávislý na trhu',
    assets: 'Algoritmické strategie, futures',
    yield: 'Obchodování volatility',
    risks: 'Technické selhání, Nízká volatilita trhu, Kreditní riziko',
    liquidity: 'Měsíční (T+15)',
    suitable: 'Dynamičtí investoři hledající diverzifikaci',
    why: 'Snižuje korelaci portfolia s akciovým trhem a stabilizuje výnosy.',
  },
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
  },
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

export const CREDIT_WISH_BANKS: CreditWishBank[] = [
  { id: 'unicredit', name: 'UniCredit Bank', rateHypo: 4.19, rateLoan: 6.2 },
  { id: 'rb', name: 'Raiffeisenbank', rateHypo: 4.29, rateLoan: 6.5 },
  { id: 'csob', name: 'ČSOB / Komerční banka', rateHypo: 4.39, rateLoan: 6.9 },
];

export const STORAGE_KEY = 'financial_plan_state';

export const RENTA_INFLATION = 0.03;
export const RENTA_WITHDRAWAL_RATE = 0.06;

export const STEP_TITLES = [
  'Klient',
  'Cashflow',
  'Majetek',
  'Úvěry',
  'Cíle',
  'Strategie',
  'Shrnutí',
] as const;

export const TOTAL_STEPS = 7;
