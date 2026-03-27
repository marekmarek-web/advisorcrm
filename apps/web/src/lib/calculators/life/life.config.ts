/**
 * Life insurance calculator – config (1:1 with zivotni.html).
 */

import type { FaqItem } from "@/lib/calculators/core/types";

export const LIMITS = {
  age: { min: 18, max: 64, step: 1, default: 30 },
  netIncome: { min: 15_000, max: 250_000, step: 1_000, default: 30_000 },
  expenses: { min: 5_000, max: 200_000, step: 500, default: 20_000 },
  liabilities: { min: 0, max: 20_000_000, step: 50_000, default: 2_000_000 },
  reserves: { min: 0, max: 5_000_000, step: 10_000, default: 100_000 },
  children: { min: 0, max: 10, step: 1, default: 2 },
} as const;

export const DEFAULT_STATE = {
  age: 30,
  netIncome: 30_000,
  expenses: 20_000,
  liabilities: 2_000_000,
  reserves: 100_000,
  children: 2,
  hasSpouse: true,
} as const;

export const LIFE_FAQ: FaqItem[] = [
  {
    question: "Co je kalkulačka životního pojištění a k čemu slouží?",
    answer:
      "Kalkulačka životního pojištění slouží k orientačnímu výpočtu, jaké pojistné krytí by mohlo dávat smysl vzhledem k vašemu příjmu, výdajům a závazkům. Pomáhá ujasnit si, na jaká rizika má smysl se zaměřit a v jakém rozsahu.",
  },
  {
    question: "Jak kalkulačka životního pojištění počítá modelované částky?",
    answer:
      "Výpočet vychází z několika základních vstupů – zejména z výše příjmu, délky ekonomické aktivity, závazků (například hypotéky) a finančních rezerv. Cílem není přesná nabídka, ale realistický odhad potřebného krytí.",
  },
  {
    question: "Je výsledek z kalkulačky závazný?",
    answer:
      "Ne. Výsledek je orientační a slouží jako podklad pro další úvahu. Každá životní situace je jiná a finální nastavení pojištění se vždy řeší individuálně podle konkrétních potřeb.",
  },
  {
    question: "Jaká rizika kalkulačka životního pojištění zohledňuje?",
    answer:
      "Kalkulačka se zaměřuje především na klíčová rizika, jako je smrt, invalidita a pracovní neschopnost. Právě tato rizika mají největší dopad na příjem a finanční stabilitu domácnosti.",
  },
  {
    question: "Kdo typicky využívá kalkulačku životního pojištění?",
    answer:
      "Kalkulačka je vhodná pro jednotlivce, rodiny i živnostníky, kteří chtějí získat základní přehled o tom, zda je jejich zajištění dostatečné. Nejčastěji ji využívají lidé s rodinou, hypotékou nebo nepravidelným příjmem.",
  },
];

export const EUCS_LABELS = {
  perPerson: "49 Kč / os.",
  perFamily: "149 Kč / rodina",
} as const;
