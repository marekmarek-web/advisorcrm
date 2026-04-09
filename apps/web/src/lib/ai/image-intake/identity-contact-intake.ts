/**
 * Identity document (OP / pas / povolení k pobytu) → návrh kontaktu pro createContact.
 * Mapuje jen na existující contacts schema; typ dokladu/platnost → notes.
 */

import type { ExtractedFactBundle, InputClassificationResult, DocumentMultiImageResult } from "./types";
import type { ParsedExplicitIntent } from "./explicit-intent-parser";
import { looksLikeStructuredFormScreenshot } from "./review-handoff";
import { enrichBirthDateFromPersonalIdInParams } from "../czech-personal-id-birth-date";

/** Zdroj dat pro createContact — ovlivní wording a logiku „doklad vs. screenshot formuláře“. */
export type CreateContactDraftSource = "identity_document" | "crm_form_screenshot";

const CRM_OR_CONTACT_KEY = /^(crm_|contact_)/;

function hasNonEmptyFact(bundle: ExtractedFactBundle, keyPrefix: string): boolean {
  return bundle.facts.some(
    (f) => f.factKey.startsWith(keyPrefix) && f.value != null && String(f.value).trim().length > 0,
  );
}

/**
 * Odhadne, zda jde o extrakci z CRM/admin screenshotu vs. osobní doklad.
 */
export function inferCreateContactDraftSource(factBundle: ExtractedFactBundle): CreateContactDraftSource {
  const idDocYes = factBundle.facts.some(
    (f) =>
      f.factKey === "id_doc_is_identity_document" &&
      String(f.value).toLowerCase().includes("yes") &&
      f.confidence >= 0.45,
  );
  const hasIdNames =
    factVal(factBundle, "id_doc_first_name") &&
    factVal(factBundle, "id_doc_last_name");
  const hasCrmOrContact = factBundle.facts.some(
    (f) => CRM_OR_CONTACT_KEY.test(f.factKey) && f.value != null && String(f.value).trim().length > 0,
  );

  if (idDocYes || hasIdNames) return "identity_document";
  if (hasCrmOrContact || looksLikeStructuredFormScreenshot(factBundle)) return "crm_form_screenshot";
  return "identity_document";
}

/**
 * U „založ klienta“ z CRM screenshotu nesrovnávat s aktivním kontaktem jako u OP/pasu.
 */
export function shouldSkipIdentityVersusActiveContactMatch(
  factBundle: ExtractedFactBundle,
  parsedIntent?: ParsedExplicitIntent | null,
): boolean {
  if (parsedIntent?.operation !== "create_contact") return false;
  return inferCreateContactDraftSource(factBundle) === "crm_form_screenshot";
}

function factVal(bundle: ExtractedFactBundle, key: string): string | null {
  const f = bundle.facts.find((x) => x.factKey === key);
  const v = f?.value;
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function factConf(bundle: ExtractedFactBundle, key: string): number {
  return bundle.facts.find((x) => x.factKey === key)?.confidence ?? 0;
}

/**
 * Konzervativní: jen photo_or_scan_document + signály identity dokladu, ne smlouva.
 * Rozšíření: explicitní intent `create_contact` aktivuje intake bez ohledu na typ obrázku.
 */
export function detectIdentityContactIntakeSignals(
  classification: InputClassificationResult | null,
  factBundle: ExtractedFactBundle,
  documentSetResult: DocumentMultiImageResult | null,
  parsedIntent?: ParsedExplicitIntent | null,
): boolean {
  // Explicit "založ klienta" / "vytvoř klienta" — funguje i pro CRM screenshoty
  if (parsedIntent?.operation === "create_contact") return true;

  if (!classification || classification.inputType !== "photo_or_scan_document") return false;

  const contractLike = factBundle.facts.some(
    (f) =>
      f.factKey === "looks_like_contract" &&
      String(f.value).toLowerCase().includes("yes") &&
      f.confidence >= 0.55,
  );
  if (contractLike) return false;

  const idYes = factBundle.facts.some(
    (f) =>
      f.factKey === "id_doc_is_identity_document" &&
      String(f.value).toLowerCase().includes("yes") &&
      f.confidence >= 0.5,
  );

  const docType = (factVal(factBundle, "document_type") ?? "").toLowerCase();
  const docHint =
    /občan|obcan|op\b|pas|povolen|pobyt|cestov|identity|řidič|ridič/i.test(docType) ||
    /občan|obcan|op\b|pas|povolen|pobyt/i.test(factVal(factBundle, "document_summary") ?? "");

  const hasName =
    factVal(factBundle, "id_doc_first_name") &&
    factVal(factBundle, "id_doc_last_name") &&
    factConf(factBundle, "id_doc_first_name") >= 0.45 &&
    factConf(factBundle, "id_doc_last_name") >= 0.45;

  if (documentSetResult?.decision === "mixed_document_set") return false;
  if (documentSetResult?.decision === "supporting_reference_set") return false;
  if (documentSetResult?.decision === "review_handoff_candidate") return false;

  return idYes || docHint || Boolean(hasName);
}

export type CreateContactDraftFromIdDoc = {
  /** Parametry pro createContact / execution step (jen povolená pole). */
  params: Record<string, string | undefined>;
  /** Sloučí document summary + typ dokladu do notes. */
  notesSections: string[];
  /** Lidské popisy pro UI „doplnit“. */
  missingAdvisorLines: string[];
  /** Klíče k potvrzení (nízká jistota / inferred). */
  needsConfirmationLines: string[];
  /** Pro rozlišení copy v UI. */
  draftSource: CreateContactDraftSource;
};

function appendNote(parts: string[], title: string, body: string | null | undefined) {
  const b = body?.trim();
  if (b) parts.push(`${title}: ${b}`);
}

export function mapFactBundleToCreateContactDraft(
  factBundle: ExtractedFactBundle,
  draftSource?: CreateContactDraftSource,
): CreateContactDraftFromIdDoc {
  const source = draftSource ?? inferCreateContactDraftSource(factBundle);
  const notesSections: string[] = [];
  appendNote(notesSections, "Typ dokladu / shrnutí", factVal(factBundle, "document_type"));
  appendNote(notesSections, "Obsah dokumentu", factVal(factBundle, "document_summary"));
  appendNote(notesSections, "Platnost / doplněk z dokladu", factVal(factBundle, "id_doc_extra_notes"));

  const get = (k: string) => factVal(factBundle, k);
  const conf = (k: string) => factConf(factBundle, k);

  // id_doc_* keys for identity documents; crm_* / contact_* keys for CRM/system screenshots
  const params: Record<string, string | undefined> = {
    firstName: get("id_doc_first_name") ?? get("crm_first_name") ?? get("contact_first_name") ?? undefined,
    lastName: get("id_doc_last_name") ?? get("crm_last_name") ?? get("contact_last_name") ?? undefined,
    birthDate: get("id_doc_birth_date") ?? get("crm_birth_date") ?? undefined,
    street: get("id_doc_street") ?? get("crm_street") ?? undefined,
    city: get("id_doc_city") ?? get("crm_city") ?? undefined,
    zip: get("id_doc_zip") ?? get("crm_zip") ?? undefined,
    personalId:
      get("id_doc_personal_id") ?? get("crm_personal_id") ?? get("birth_number") ?? undefined,
    email: get("id_doc_email") ?? get("crm_email") ?? undefined,
    phone: get("id_doc_phone") ?? get("crm_phone") ?? undefined,
    title: get("id_doc_title") ?? get("crm_title") ?? undefined,
  };

  const hadExplicitBirthDate = Boolean(params.birthDate?.trim());
  enrichBirthDateFromPersonalIdInParams(params as Record<string, unknown>);

  const missingAdvisorLines: string[] = [];
  const needsConfirmationLines: string[] = [];

  if (!params.firstName?.trim()) missingAdvisorLines.push("Jméno");
  if (!params.lastName?.trim()) missingAdvisorLines.push("Příjmení");

  const lowConfFields: { fk: string; altFk?: string; label: string }[] = [
    { fk: "id_doc_first_name", altFk: "crm_first_name", label: "Jméno" },
    { fk: "id_doc_last_name", altFk: "crm_last_name", label: "Příjmení" },
    { fk: "id_doc_birth_date", altFk: "crm_birth_date", label: "Datum narození" },
    { fk: "id_doc_street", altFk: "crm_street", label: "Ulice" },
    { fk: "id_doc_city", altFk: "crm_city", label: "Město" },
    { fk: "id_doc_zip", altFk: "crm_zip", label: "PSČ" },
  ];
  for (const { fk, altFk, label } of lowConfFields) {
    const usedKey = factVal(factBundle, fk) ? fk : (altFk && factVal(factBundle, altFk) ? altFk : null);
    if (!usedKey) continue;
    const f = factBundle.facts.find((x) => x.factKey === usedKey);
    if (f && (f.confidence < 0.65 || f.observedVsInferred === "inferred")) {
      const line = `${label} — ověřte`;
      if (!needsConfirmationLines.includes(line)) needsConfirmationLines.push(line);
    }
  }

  if (params.personalId?.trim()) {
    needsConfirmationLines.push(
      source === "crm_form_screenshot"
        ? "Rodné číslo / identifikátor z formuláře — potvrďte před uložením"
        : "Rodné číslo / osobní údaj z dokladu — potvrďte před uložením",
    );
  }

  if (!hadExplicitBirthDate && params.birthDate?.trim() && params.personalId?.trim()) {
    const line = "Datum narození odvozeno z rodného čísla — ověřte";
    if (!needsConfirmationLines.includes(line)) needsConfirmationLines.push(line);
  }

  const notesPrefix =
    source === "crm_form_screenshot"
      ? "[Z obrázku formuláře / systému — AI extrakce]"
      : "[Z dokladu — AI extrakce]";
  const notes =
    [notesPrefix, ...notesSections, ...factBundle.missingFields.map((m) => `Chybějící: ${m}`)]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8000) || undefined;
  if (notes) params.notes = notes;

  return { params, notesSections, missingAdvisorLines, needsConfirmationLines, draftSource: source };
}

/** Query string pro /portal/contacts/new (jen neprázdné hodnoty). */
export function buildContactNewPrefillQuery(draft: CreateContactDraftFromIdDoc): string {
  const q = new URLSearchParams();
  const p = draft.params;
  const entries: [string, string | undefined][] = [
    ["firstName", p.firstName],
    ["lastName", p.lastName],
    ["birthDate", p.birthDate],
    ["street", p.street],
    ["city", p.city],
    ["zip", p.zip],
    ["personalId", p.personalId],
    ["email", p.email],
    ["phone", p.phone],
    ["title", p.title],
    ["notes", p.notes],
  ];
  for (const [k, v] of entries) {
    if (v && String(v).trim()) q.set(k, String(v).trim());
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
