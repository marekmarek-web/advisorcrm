/**
 * Canonical naming layer for AI-created CRM entities.
 * Single source of truth for what names and detail lines look like.
 *
 * Rules:
 * - Deals: short, strong title (Hypotéka 4 000 000 Kč); detail separate
 * - Tasks: verb + object, no abbreviations
 * - Client requests: action-oriented, short
 * - Detail lines: facts joined with ·
 */

import type { ProductDomain } from "./assistant-domain-model";

// ─── Domain display labels ────────────────────────────────────────────────────

const DOMAIN_DISPLAY_LABEL: Partial<Record<ProductDomain | string, string>> = {
  hypo: "Hypotéka",
  uver: "Spotřebitelský úvěr",
  investice: "Investice",
  dip: "Investice (DIP)",
  dps: "Penzijní spoření",
  zivotni_pojisteni: "Životní pojištění",
  majetek: "Pojištění majetku",
  odpovednost: "Pojištění odpovědnosti",
  auto: "Pojištění vozidla",
  cestovni: "Cestovní pojištění",
  firma_pojisteni: "Firemní pojištění",
  servis: "Servis",
  jine: "Případ",
};

export function domainDisplayLabel(domain: string | null | undefined): string {
  if (!domain) return "Případ";
  return DOMAIN_DISPLAY_LABEL[domain] ?? "Případ";
}

// ─── Amount formatting ────────────────────────────────────────────────────────

function formatCzechAmount(raw: unknown): string | null {
  if (raw == null || raw === "" || raw === 0) return null;
  const n =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(/\s/g, "").replace(/,/g, "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + "\u00a0Kč";
}

function isMonthlyPeriodicity(periodicity: unknown): boolean {
  if (!periodicity) return false;
  return /měs|měsíc|monthly|regular|pravidelně/i.test(String(periodicity));
}

// ─── Deal / opportunity title ─────────────────────────────────────────────────

const DEAL_TITLE_WITH_AMOUNT: Partial<Record<string, (a: string) => string>> = {
  hypo: (a) => `Hypotéka ${a}`,
  uver: (a) => `Spotřebitelský úvěr ${a}`,
  investice: (a) => `Investice ${a}`,
  dip: (a) => `Investice DIP ${a}`,
  dps: (a) => `Penzijní spoření ${a}`,
  zivotni_pojisteni: (a) => `Životní pojištění ${a}`,
  majetek: (a) => `Pojištění majetku ${a}`,
  auto: (a) => `Pojištění vozidla ${a}`,
};

const DEAL_TITLE_WITH_AMOUNT_MONTHLY: Partial<Record<string, (a: string) => string>> = {
  investice: (a) => `Investice ${a} měsíčně`,
  dip: (a) => `Investice DIP ${a} měsíčně`,
  dps: (a) => `Penzijní spoření ${a} měsíčně`,
  zivotni_pojisteni: (a) => `Životní pojištění ${a} měsíčně`,
  majetek: (a) => `Pojištění majetku ${a} měsíčně`,
};

/**
 * Returns the canonical deal title.
 * Short, clean, no internal abbreviations.
 * If amount is known: "Hypotéka 4 000 000 Kč"
 * Without amount: "Hypotéka"
 */
export function canonicalDealTitle(params: {
  productDomain: string | null | undefined;
  amount?: unknown;
  periodicity?: string | null;
  purpose?: string | null;
}): string {
  const domain = params.productDomain ?? null;
  const amount = formatCzechAmount(params.amount);

  if (domain && amount) {
    if (
      isMonthlyPeriodicity(params.periodicity) &&
      DEAL_TITLE_WITH_AMOUNT_MONTHLY[domain]
    ) {
      return DEAL_TITLE_WITH_AMOUNT_MONTHLY[domain]!(amount);
    }
    if (DEAL_TITLE_WITH_AMOUNT[domain]) {
      return DEAL_TITLE_WITH_AMOUNT[domain]!(amount);
    }
  }

  return domainDisplayLabel(domain);
}

// ─── Task title ───────────────────────────────────────────────────────────────

const TASK_TITLE_BY_DOMAIN: Partial<Record<string, string>> = {
  hypo: "Zkontrolovat podklady k hypotéce",
  uver: "Zkontrolovat podklady k úvěru",
  investice: "Doplnit informace o investici",
  dip: "Doplnit informace o DIP",
  dps: "Doplnit informace o penzijním spoření",
  zivotni_pojisteni: "Ověřit krytí životního pojištění",
  majetek: "Prověřit pojištění majetku",
  odpovednost: "Prověřit pojištění odpovědnosti",
  auto: "Prověřit pojištění vozidla",
  cestovni: "Prověřit cestovní pojištění",
  firma_pojisteni: "Prověřit firemní pojištění",
  servis: "Zkontrolovat servisní požadavek",
};

const FOLLOWUP_TITLE_BY_DOMAIN: Partial<Record<string, string>> = {
  hypo: "Naplánovat schůzku ke hypotéce",
  uver: "Naplánovat schůzku k úvěru",
  investice: "Naplánovat schůzku k investici",
  dip: "Naplánovat schůzku k DIP",
  dps: "Naplánovat schůzku k penzijnímu spoření",
  zivotni_pojisteni: "Naplánovat schůzku k životnímu pojištění",
  majetek: "Naplánovat schůzku k pojištění majetku",
  odpovednost: "Naplánovat schůzku k pojištění",
  auto: "Naplánovat schůzku k pojištění vozidla",
  firma_pojisteni: "Naplánovat schůzku k firemnímu pojištění",
};

/** Returns true if the title looks like an internal slug or raw abbreviation. */
export function looksInternalOrRaw(title: string): boolean {
  if (!title || title.length < 3) return true;
  if (/^(hypo|uver|invest|pojko|dps|dip)[\s:_]/i.test(title)) return true;
  if (/^[a-z_]+$/.test(title)) return true;
  return false;
}

export function canonicalTaskTitle(params: {
  action: "createTask" | "createFollowUp" | "createReminder";
  productDomain?: string | null;
  existingTitle?: string | null;
  purpose?: string | null;
}): string {
  const existing = params.existingTitle?.trim();
  if (existing && !looksInternalOrRaw(existing)) return existing;

  const domain = params.productDomain ?? null;

  if (params.action === "createFollowUp") {
    return FOLLOWUP_TITLE_BY_DOMAIN[domain ?? ""] ?? "Naplánovat navazující kontakt";
  }

  if (params.action === "createReminder") {
    const label = DOMAIN_DISPLAY_LABEL[domain ?? ""];
    return label ? `Připomínka: ${label}` : "Připomínka";
  }

  // createTask
  if (domain && TASK_TITLE_BY_DOMAIN[domain]) {
    return TASK_TITLE_BY_DOMAIN[domain]!;
  }

  const purpose = params.purpose?.trim();
  if (purpose) return purpose.charAt(0).toUpperCase() + purpose.slice(1);

  return "Úkol";
}

// ─── Client request subject ───────────────────────────────────────────────────

const CLIENT_REQUEST_BY_DOMAIN: Partial<Record<string, string>> = {
  hypo: "Doložit podklady k hypotéce",
  uver: "Doložit podklady k úvěru",
  investice: "Doplnit informace k investici",
  dip: "Doplnit informace k DIP",
  dps: "Doplnit informace k penzijnímu spoření",
  zivotni_pojisteni: "Poskytnout informace k životnímu pojištění",
  majetek: "Doložit informace k pojištění majetku",
  auto: "Doložit informace k pojištění vozidla",
  firma_pojisteni: "Doložit informace k firemnímu pojištění",
};

export function canonicalClientRequestSubject(params: {
  productDomain?: string | null;
  existingSubject?: string | null;
  taskTitle?: string | null;
}): string {
  const existing = params.existingSubject?.trim() ?? params.taskTitle?.trim();
  if (existing && !looksInternalOrRaw(existing)) return existing;
  const domain = params.productDomain ?? null;
  return CLIENT_REQUEST_BY_DOMAIN[domain ?? ""] ?? "Požadavek klienta";
}

// ─── Material request title ───────────────────────────────────────────────────

const MATERIAL_REQUEST_BY_DOMAIN: Partial<Record<string, string>> = {
  hypo: "Podklady k hypotéce",
  uver: "Podklady k úvěru",
  investice: "Podklady k investici",
  dip: "Podklady k DIP",
  dps: "Podklady k penzijnímu spoření",
  zivotni_pojisteni: "Podklady k životnímu pojištění",
  majetek: "Podklady k pojištění majetku",
  auto: "Podklady k pojištění vozidla",
  firma_pojisteni: "Podklady k firemnímu pojištění",
};

export function canonicalMaterialRequestTitle(params: {
  productDomain?: string | null;
  existingTitle?: string | null;
  taskTitle?: string | null;
}): string {
  const existing = params.existingTitle?.trim() ?? params.taskTitle?.trim();
  if (existing && !looksInternalOrRaw(existing)) return existing;
  const domain = params.productDomain ?? null;
  return MATERIAL_REQUEST_BY_DOMAIN[domain ?? ""] ?? "Podklady od klienta";
}

// ─── Deal detail line (for step preview description and board card subtitle) ──

/**
 * Composes a human-readable detail line from deal parameters.
 * Example: "Sazba 4,5 % · Raiffeisenbank · splatnost 30 let"
 * Returns null if not enough info to make a useful line.
 */
export function canonicalDealDetailLine(params: Record<string, unknown>): string | null {
  const parts: string[] = [];

  const rate = strOr(params, "interestRate", "rate");
  if (rate) parts.push(`Sazba ${rate}`);

  const bank = strOr(params, "bank", "institution", "provider");
  if (bank) parts.push(bank);

  const maturity = strOr(params, "maturity", "termYears", "term");
  if (maturity) {
    const clean = /^\d+$/.test(maturity) ? `${maturity} let` : maturity;
    parts.push(`splatnost ${clean}`);
  }

  return parts.length > 0 ? parts.join(" \u00b7 ") : null;
}

function strOr(params: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = params[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}
