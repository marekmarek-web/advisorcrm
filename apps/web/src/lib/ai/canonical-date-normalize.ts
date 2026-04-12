/**
 * Canonical date and payment-frequency normalization for AI Review extraction pipeline.
 *
 * Internal format: ISO YYYY-MM-DD (for DB, CRM apply, system comparisons).
 * Advisor display format: DD.MM.YYYY (Czech business standard).
 * Datetime display: HH:MM DD.MM.YYYY (TIME DDMMYYY rule).
 *
 * Payment frequency: normalizes LLM variants ("annual", "yearly", "ročně", …) to
 * canonical Czech display strings used in advisor review.
 */

const DATE_FIELD_KEYS = new Set([
  "policyStartDate",
  "policyEndDate",
  "effectiveDate",
  "modelationDate",
  "documentIssueDate",
  "issueDate",
  "documentDate",
  "birthDate",
  "firstInstallmentDate",
  "firstPaymentDate",
  "expirationDate",
  "lastInstallmentDate",
  "disbursementDate",
  "startDate",
  "endDate",
  "contractStartDate",
  "contractEndDate",
  "policyDuration",
  "participationStartDate",
  // Phase 3 additions
  "dateSigned",
  "signedDate",
  "proposalDate",
  "offerDate",
  "offerValidDate",
  "analysisDate",
  "questionnaireDate",
  "issuedDate",
  "validFrom",
  "validTo",
  "insuranceStartDate",
  "insuranceEndDate",
  "loanStartDate",
  "loanEndDate",
  "repaymentDate",
]);

export function isDateFieldKey(key: string): boolean {
  return DATE_FIELD_KEYS.has(key);
}

type ParsedDate = { year: number; month: number; day: number; hour?: number; minute?: number };

function tryParse(raw: string): ParsedDate | null {
  const s = raw.trim();
  if (!s) return null;

  let m: RegExpMatchArray | null;

  // HH:MM DD.MM.YYYY or HH:MM DD. MM. YYYY
  m = s.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (m) return { year: +m[5], month: +m[4], day: +m[3], hour: +m[1], minute: +m[2] };

  // DD.MM.YYYY HH:MM
  m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m) return { year: +m[3], month: +m[2], day: +m[1], hour: +m[4], minute: +m[5] };

  // DD.MM.YYYY or DD. MM. YYYY
  m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (m) return { year: +m[3], month: +m[2], day: +m[1] };

  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { year: +m[3], month: +m[2], day: +m[1] };

  // YYYY-MM-DD with optional T or space + time
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) {
    const r: ParsedDate = { year: +m[1], month: +m[2], day: +m[3] };
    if (m[4] != null) { r.hour = +m[4]; r.minute = +m[5]; }
    return r;
  }

  // DDMMYYYY (8 digits, day-first heuristic: first 2 digits ≤31)
  m = s.match(/^(\d{8})$/);
  if (m) {
    const d = +m[1].slice(0, 2);
    const mo = +m[1].slice(2, 4);
    const y = +m[1].slice(4, 8);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 1900 && y <= 2100) {
      return { year: y, month: mo, day: d };
    }
  }

  return null;
}

function isValidDate(p: ParsedDate): boolean {
  if (p.year < 1900 || p.year > 2100) return false;
  if (p.month < 1 || p.month > 12) return false;
  if (p.day < 1 || p.day > 31) return false;
  const d = new Date(p.year, p.month - 1, p.day);
  return d.getFullYear() === p.year && d.getMonth() === p.month - 1 && d.getDate() === p.day;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Returns ISO YYYY-MM-DD (system/DB format) or empty string if unparseable. */
export function normalizeDateToISO(raw: string | null | undefined): string {
  if (raw == null) return "";
  const p = tryParse(String(raw));
  if (!p || !isValidDate(p)) return "";
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Returns D. M. YYYY for advisor display (Czech business standard — no leading zeros, spaces after dots). */
export function normalizeDateForAdvisorDisplay(raw: string | null | undefined): string {
  if (raw == null) return "";
  const p = tryParse(String(raw));
  if (!p || !isValidDate(p)) return String(raw).trim();
  if (p.hour != null && p.minute != null) {
    return `${pad2(p.hour)}:${pad2(p.minute)} ${p.day}. ${p.month}. ${p.year}`;
  }
  return `${p.day}. ${p.month}. ${p.year}`;
}

/**
 * Normalize all date-like extractedFields in place.
 * System values get ISO, display stays Czech.
 * Stores the original raw value in evidenceSnippet if it was changed.
 */
export function normalizeExtractedFieldDates(
  ef: Record<string, { value?: unknown; evidenceSnippet?: string; [k: string]: unknown }>
): void {
  for (const key of Object.keys(ef)) {
    if (!isDateFieldKey(key)) continue;
    const cell = ef[key];
    if (!cell || cell.value == null) continue;
    const raw = String(cell.value).trim();
    if (!raw) continue;
    const iso = normalizeDateToISO(raw);
    if (!iso) continue;
    if (raw !== iso && !cell.evidenceSnippet) {
      cell.evidenceSnippet = raw;
    }
    cell.value = iso;
  }
}

// ─── Payment frequency normalization ─────────────────────────────────────────

/**
 * Maps LLM-returned payment frequency strings (English, Czech, abbreviated variants)
 * to canonical Czech advisor-display format.
 *
 * Returns the canonical Czech form or the trimmed original if unrecognized.
 * Never throws — safe to call on any string from LLM output.
 */
export function normalizePaymentFrequency(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s = raw.trim().toLowerCase();
  if (!s) return "";

  // Monthly
  if (/^(m[eě]s[ií][čc]n[eě]?|monthly|month|m[oő]natlich|mensual|m[ée]nsuel|1[\/\s-]?m[oő]nat)/.test(s)) return "měsíčně";

  // Quarterly
  if (/^([čc]tvrtletn[eě]?|quarterly|quarter|quarterly|three.?monthly|3.?months?|viertj[aä]hrlich|trimestral|trimestriel)/.test(s)) return "čtvrtletně";

  // Semi-annual
  if (/^(polo[- ]?letn[eě]?|semi.?annual|half.?year|twice.?year|biannual|halbjährlich|semestral|semestriel|6.?months?)/.test(s)) return "pololetně";

  // Annual / yearly
  if (/^(ro[čc]n[eě]?|annual|yearly|year|once.?a.?year|j[aä]hrlich|anual|annuel|1.?ro[čc]n[eě]?)/.test(s)) return "ročně";

  // One-time / lump sum
  if (/^(jednor[aá]zov[eě]?|one.?time|single|lump.?sum|einmalig|[uú]nico|unique|jednor[aá]zová platba)/.test(s)) return "jednorázově";

  // Extra / irregular
  if (/^(mimo[řr][aá]dn[eě]?|extra|irregular|nepravidelné?|special|sonderz)/.test(s)) return "mimořádně";

  return raw.trim();
}

/**
 * Normalize paymentFrequency field in extractedFields in place.
 */
export function normalizeExtractedFieldFrequencies(
  ef: Record<string, { value?: unknown; evidenceSnippet?: string; [k: string]: unknown }>
): void {
  const freqKeys = ["paymentFrequency", "premiumFrequency", "frequency"];
  for (const key of freqKeys) {
    const cell = ef[key];
    if (!cell || cell.value == null) continue;
    const raw = String(cell.value).trim();
    if (!raw) continue;
    const normalized = normalizePaymentFrequency(raw);
    if (normalized && normalized !== raw) {
      if (!cell.evidenceSnippet) cell.evidenceSnippet = raw;
      cell.value = normalized;
    }
  }
}
