/**
 * Investment calculator – profiles, historical data, FAQ, defaults, limits.
 * Source of truth: html/investicni.html (1:1 parity).
 */

export interface AllocationItem {
  name: string;
  value: number;
  color: string;
}

export interface InvestmentProfile {
  id: string;
  name: string;
  rate: number;
  color: string;
  description: string;
  composition: AllocationItem[];
}

export interface HistoricalDataPoint {
  date: string;
  sp500: number;
  gold: number;
  bonds: number;
  re: number;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export const INVESTMENT_PROFILES: InvestmentProfile[] = [
  {
    id: "konzervativni",
    name: "Konzervativní investor",
    rate: 5,
    color: "#3b82f6",
    description:
      "Stabilní zhodnocení s minimálním kolísáním. Ideální pro opatrné investory. Využívá dluhopisy a nemovitostní fondy.",
    composition: [
      { name: "Dluhopisy", value: 70, color: "#3b82f6" },
      { name: "Nemovitostní fondy", value: 20, color: "#10b981" },
      { name: "Akcie", value: 10, color: "#f59e0b" },
    ],
  },
  {
    id: "vyvazeny",
    name: "Vyvážený investor",
    rate: 7,
    color: "#a855f7",
    description:
      "Zlatá střední cesta. Kombinace stability dluhopisů, růstového potenciálu akcií a jistoty nemovitostních fondů.",
    composition: [
      { name: "Akcie (ETF)", value: 50, color: "#f59e0b" },
      { name: "Dluhopisy", value: 35, color: "#3b82f6" },
      { name: "Nemovitostní fondy", value: 15, color: "#10b981" },
    ],
  },
  {
    id: "dynamicky",
    name: "Dynamický investor",
    rate: 9,
    color: "#eab308",
    description: "Maximální potenciál výnosu. Strategie pro dlouhodobé cíle.",
    composition: [
      { name: "Globální Akcie", value: 90, color: "#f59e0b" },
      { name: "Dluhopisy", value: 10, color: "#3b82f6" },
    ],
  },
];

export const HISTORICAL_DATA: HistoricalDataPoint[] = [
  { date: "1995-01", sp500: 459, gold: 380, bonds: 100, re: 100 },
  { date: "1996-06", sp500: 670, gold: 385, bonds: 108, re: 106 },
  { date: "1998-01", sp500: 970, gold: 290, bonds: 115, re: 112 },
  { date: "1999-12", sp500: 1469, gold: 290, bonds: 118, re: 120 },
  { date: "2001-09", sp500: 1040, gold: 290, bonds: 125, re: 128 },
  { date: "2002-10", sp500: 776, gold: 315, bonds: 135, re: 132 },
  { date: "2004-01", sp500: 1130, gold: 410, bonds: 138, re: 140 },
  { date: "2007-10", sp500: 1565, gold: 750, bonds: 145, re: 155 },
  { date: "2008-09", sp500: 1100, gold: 830, bonds: 148, re: 158 },
  { date: "2009-03", sp500: 676, gold: 920, bonds: 152, re: 156 },
  { date: "2010-06", sp500: 1030, gold: 1240, bonds: 158, re: 162 },
  { date: "2011-08", sp500: 1120, gold: 1820, bonds: 165, re: 168 },
  { date: "2013-01", sp500: 1498, gold: 1660, bonds: 170, re: 175 },
  { date: "2015-01", sp500: 2000, gold: 1280, bonds: 175, re: 185 },
  { date: "2018-09", sp500: 2900, gold: 1200, bonds: 178, re: 205 },
  { date: "2020-02", sp500: 3380, gold: 1550, bonds: 185, re: 215 },
  { date: "2020-03", sp500: 2300, gold: 1470, bonds: 180, re: 214 },
  { date: "2020-08", sp500: 3500, gold: 2060, bonds: 190, re: 218 },
  { date: "2021-12", sp500: 4766, gold: 1800, bonds: 185, re: 225 },
  { date: "2022-06", sp500: 3785, gold: 1810, bonds: 165, re: 228 },
  { date: "2022-10", sp500: 3580, gold: 1650, bonds: 155, re: 230 },
  { date: "2023-12", sp500: 4700, gold: 2040, bonds: 162, re: 245 },
  { date: "2024-04", sp500: 5200, gold: 2350, bonds: 164, re: 250 },
];

export const INVESTMENT_FAQ: FaqItem[] = [
  {
    question: "Co je investiční kalkulačka a k čemu slouží?",
    answer:
      "Kalkulačka slouží k rychlému a orientačnímu výpočtu potenciální budoucí hodnoty vaší pravidelné investice na základě vámi zvolené strategie a investičního horizontu.",
  },
  {
    question: "Jak investiční kalkulačka počítá výnosy?",
    answer:
      "Kalkulačka používá princip složeného úročení na základě průměrné roční výnosnosti (p.a.) při pravidelném měsíčním vkladu po celou dobu trvání investice.",
  },
  {
    question: "Jsou uvedené výnosy garantované?",
    answer:
      "Nejsou. Výsledky jsou pouze orientační projekce založené na historických průměrech. Investování s sebou nese riziko, a minulé výnosy nezaručují výnosy budoucí.",
  },
  {
    question:
      "Jaký je rozdíl mezi konzervativní, vyváženou a dynamickou strategií?",
    answer:
      "Konzervativní strategie preferuje stabilitu s nižším očekávaným výnosem. Dynamická strategie upřednostňuje růst s vyšším potenciálem, ale i vyšším rizikem kolísání.",
  },
  {
    question: "Je kalkulačka vhodná pro dlouhodobé investování?",
    answer:
      "Ano, výpočty modelují dlouhé časové horizonty (3–30 let), typické pro ilustraci dlouhodobého spoření — nejde o návrh konkrétní investice.",
  },
  {
    question: "Mohu výsledek konzultovat s Vámi?",
    answer:
      "Určitě. Výsledek kalkulačky je ideálním výchozím bodem pro individuální konzultaci. Můžete si sjednat schůzku a probrat své konkrétní finanční cíle a rizika.",
  },
];

/** Input limits and defaults (1:1 with HTML) */
export const INVESTMENT_DEFAULTS = {
  initialMin: 0,
  initialMax: 2_000_000,
  initialStep: 10_000,
  initialDefault: 100_000,
  monthlyMin: 500,
  monthlyMax: 50_000,
  monthlyStep: 500,
  monthlyDefault: 5_000,
  yearsMin: 3,
  yearsMax: 30,
  yearsDefault: 10,
  startYearMin: 1995,
  startYearMax: 2019,
  startYearDefault: 1995,
  /** Default profile index (0 = Konzervativní, 1 = Vyvážená, 2 = Dynamická) */
  profileIndexDefault: 1,
} as const;
