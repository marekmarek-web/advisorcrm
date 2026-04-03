import type { AssistantPlaybook } from "./types";

export const ASSISTANT_PLAYBOOKS: AssistantPlaybook[] = [
  {
    id: "hypo_uver",
    label: "Hypotéka / úvěr",
    matches: (m, i) =>
      i.productDomain === "hypo" ||
      i.productDomain === "uver" ||
      /hypoték|hypoteční|úvěr|uver|ltv|úrokov|sazeb/i.test(m),
    defaultProductDomain: "hypo",
    priorityMissingHints: [
      "částka jistiny",
      "LTV nebo zástavní hodnota",
      "banka / nabídka",
      "účel (koupě, rekonstrukce)",
      "termín follow-upu",
    ],
    nextStepSuggestions: [
      "Ověřit příjem a bonitu v analýze.",
      "Naplánovat podklady pro banku a termín čerpání.",
      "Zkontrolovat pojistné krytí zástavy.",
    ],
  },
  {
    id: "investice_dip_dps",
    label: "Investice / DIP / DPS",
    matches: (m, i) =>
      i.productDomain === "investice" ||
      i.productDomain === "dip" ||
      i.productDomain === "dps" ||
      /investic|etf|portfolio|dip|dps|penzijn|spoření na důchod/i.test(m),
    defaultProductDomain: "investice",
    priorityMissingHints: ["horizont", "rizikový profil", "cílová částka", "pravidelná vs. jednorázová investice"],
    nextStepSuggestions: [
      "Doplnit vhodnost produktu k profilu klienta.",
      "Zkontrolovat daňové aspekty a limity.",
      "Domluvit další kontrolu portfolia.",
    ],
  },
  {
    id: "zivotni_riziko",
    label: "Životní / rizikové pojištění",
    matches: (m, i) =>
      i.productDomain === "zivotni_pojisteni" ||
      /životní|zivotni|rizikov|invalid|úmrt|příjem|pojistné|smrt/i.test(m),
    defaultProductDomain: "zivotni_pojisteni",
    priorityMissingHints: ["pojistná částka", "pojistné", "doba pojištění", "beneficiár"],
    nextStepSuggestions: [
      "Porovnat krytí s výdaji domácnosti.",
      "Zkontrolovat výluky a pojistné události.",
    ],
  },
  {
    id: "majetek_odpovednost_auto",
    label: "Majetek / odpovědnost / auto",
    matches: (m, i) =>
      ["majetek", "odpovednost", "auto", "cestovni"].includes(i.productDomain ?? "") ||
      /majetek|domácnost|odpovědnost|povinné|havarijní|auto|vozidlo|cestovní/i.test(m),
    defaultProductDomain: "majetek",
    priorityMissingHints: ["předmět pojištění", "limity plnění", "spoluúčast", "datum počátku"],
    nextStepSuggestions: [
      "Zkontrolovat podpojištění / nadlimitní majetek.",
      "Sladit s hypotékou nebo zástavou.",
    ],
  },
  {
    id: "servis_vyroci",
    label: "Servis smluv / výročí",
    matches: (m, i) =>
      i.productDomain === "servis" ||
      /servis|výročí|vyroci|sjednání|změna smlouvy|doplňkov|cross-sell/i.test(m),
    defaultProductDomain: "servis",
    priorityMissingHints: ["která smlouva", "co se mění", "deadline pro klienta"],
    nextStepSuggestions: [
      "Ověřit stav smlouvy v portfoliu.",
      "Poslat shrnutí změn klientovi přes portál.",
    ],
  },
  {
    id: "schuzka_ukol_zapis",
    label: "Schůzka / úkol / zápis",
    matches: (m, i) =>
      i.intentType === "schedule_meeting" ||
      i.intentType === "create_task" ||
      i.intentType === "create_followup" ||
      i.intentType === "create_note" ||
      i.intentType === "create_internal_note" ||
      /schůzk|schuzk|úkol|ukol|follow|poznám|zápis|brief/i.test(m),
    defaultProductDomain: null,
    priorityMissingHints: ["datum a čas", "účastníci", "agenda", "vazba na klienta"],
    nextStepSuggestions: [
      "Po schůzce doplnit zápis do CRM.",
      "Naplánovat další krok jako úkol s termínem.",
    ],
  },
];
