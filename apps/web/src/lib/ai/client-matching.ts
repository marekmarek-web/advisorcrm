import { db } from "db";
import {
  contacts,
  companies,
  companyPersonLinks,
  households,
  householdMembers,
  opportunities,
  contracts,
} from "db";
import { eq, and, sql, inArray } from "db";
import type { ExtractedContractSchema } from "./extraction-schemas";
import type { ClientMatchCandidate, MatchConfidence } from "./review-queue";
import type { DocumentReviewEnvelope } from "./document-review-types";
import {
  normalizeForCompare,
  normalizePhone,
  normalizeEmail,
  normalizePersonalId,
  normalizeCompanyId,
  normalizeName,
  normalizeAddress,
  normalizeDate,
} from "./normalize";

export type ClientMatchingContext = {
  tenantId: string;
};

const SCORE = {
  personalIdExact: 0.46,
  companyIdExact: 0.34,
  birthDate: 0.22,
  fullName: 0.18,
  email: 0.14,
  phone: 0.14,
  address: 0.1,
  employer: 0.08,
  insurerOrLenderHint: 0.06,
} as const;

function confidenceFromScore(score: number): MatchConfidence {
  if (score >= 0.34) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

/**
 * Deterministic verdict enum for client resolution.
 * - existing_match: single high-confidence candidate with clear gap to second → auto-resolve
 * - near_match: high-confidence top but close second, or single medium → advisory
 * - ambiguous_match: multiple high-confidence or indistinguishable top → blocking
 * - no_match: nothing above threshold
 */
export type MatchVerdict =
  | "existing_match"
  | "near_match"
  | "ambiguous_match"
  | "no_match";

export type MatchVerdictResult = {
  verdict: MatchVerdict;
  autoResolvedClientId: string | null;
  reason: string;
};

/**
 * Deterministic match verdict from scored candidates.
 * Candidates must be pre-filtered (score >= 0.25) and sorted desc by score.
 * Rules per mini-plan section 4.
 */
export function computeMatchVerdict(candidates: ClientMatchCandidate[]): MatchVerdictResult {
  const filtered = candidates.filter((c) => c.score >= 0.25).sort((a, b) => b.score - a.score);

  if (filtered.length === 0) {
    return { verdict: "no_match", autoResolvedClientId: null, reason: "no_candidates_above_threshold" };
  }

  const top = filtered[0];
  const second = filtered[1];

  if (top.confidence === "high") {
    const gap = second ? top.score - second.score : Infinity;
    if (!second || gap >= 0.10) {
      return {
        verdict: "existing_match",
        autoResolvedClientId: top.clientId,
        reason: `single_high_confidence_gap_${gap.toFixed(2)}`,
      };
    }
    if (gap >= 0.05) {
      return { verdict: "near_match", autoResolvedClientId: null, reason: `high_confidence_close_gap_${gap.toFixed(2)}` };
    }
    return { verdict: "ambiguous_match", autoResolvedClientId: null, reason: "multiple_high_confidence_indistinguishable" };
  }

  if (top.confidence === "medium") {
    if (!second) {
      return { verdict: "near_match", autoResolvedClientId: null, reason: "single_medium_confidence" };
    }
    return { verdict: "ambiguous_match", autoResolvedClientId: null, reason: "multiple_medium_confidence_candidates" };
  }

  return { verdict: "no_match", autoResolvedClientId: null, reason: "top_candidate_low_confidence" };
}

function fullNameFromParts(firstRaw?: string | null, lastRaw?: string | null, fullRaw?: string | null): string {
  if (fullRaw) return normalizeName(fullRaw);
  const first = normalizeName(firstRaw ?? "");
  const last = normalizeName(lastRaw ?? "");
  return [first, last].filter(Boolean).join(" ");
}

function extractSignals(
  extracted: ExtractedContractSchema | DocumentReviewEnvelope
): {
  fullNameNorm: string;
  birthDateNorm: string;
  emailNorm: string;
  phoneNorm: string;
  personalIdNorm: string;
  companyIdNorm: string;
  addressNorm: string;
  employerNorm: string;
  institutionNorm: string;
} {
  const asEnvelope = extracted as DocumentReviewEnvelope;
  const isEnvelope = !!asEnvelope?.documentClassification && !!asEnvelope?.extractedFields;
  if (isEnvelope) {
    const fields = asEnvelope.extractedFields;
    const fullName = String(
      fields.employeeFullName?.value ??
      fields.investorFullName?.value ??
      fields.insuredPersonName?.value ??
      fields.clientFullName?.value ??
      ""
    );
    const firstName = String(fields.clientFirstName?.value ?? "");
    const lastName = String(fields.clientLastName?.value ?? "");
    const birthDate = String(fields.birthDate?.value ?? fields.employeeBirthDate?.value ?? "");
    const email = String(fields.email?.value ?? fields.clientEmail?.value ?? "");
    const phone = String(fields.phone?.value ?? fields.clientPhone?.value ?? "");
    const personalId = String(fields.maskedPersonalId?.value ?? fields.personalId?.value ?? "");
    const companyId = String(fields.companyId?.value ?? fields.employerIco?.value ?? "");
    const address = String(fields.address?.value ?? fields.permanentAddress?.value ?? "");
    const employer = String(fields.employerName?.value ?? "");
    const institution = String(fields.insurer?.value ?? fields.lender?.value ?? fields.bankName?.value ?? "");
    return {
      fullNameNorm: fullNameFromParts(firstName, lastName, fullName),
      birthDateNorm: normalizeDate(birthDate),
      emailNorm: normalizeEmail(email),
      phoneNorm: normalizePhone(phone),
      personalIdNorm: normalizePersonalId(personalId),
      companyIdNorm: normalizeCompanyId(companyId),
      addressNorm: normalizeAddress(address),
      employerNorm: normalizeForCompare(employer),
      institutionNorm: normalizeForCompare(institution),
    };
  }
  const legacy = extracted as ExtractedContractSchema;
  return {
    fullNameNorm: fullNameFromParts(legacy.client?.firstName, legacy.client?.lastName, legacy.client?.fullName),
    birthDateNorm: normalizeDate(legacy.client?.birthDate),
    emailNorm: normalizeEmail(legacy.client?.email),
    phoneNorm: normalizePhone(legacy.client?.phone),
    personalIdNorm: normalizePersonalId(legacy.client?.personalId),
    companyIdNorm: normalizeCompanyId(legacy.client?.companyId),
    addressNorm: normalizeAddress(legacy.client?.address),
    employerNorm: "",
    institutionNorm: normalizeForCompare(legacy.institutionName),
  };
}

/**
 * Find CRM contact candidates matching extracted contract client.
 * Uses normalized comparison; returns candidates with score, confidence, reasons, matchedFields.
 */
export async function findClientCandidates(
  extracted: ExtractedContractSchema | DocumentReviewEnvelope,
  context: ClientMatchingContext
): Promise<ClientMatchCandidate[]> {
  const { tenantId } = context;
  const byId = new Map<string, ClientMatchCandidate>();
  const {
    personalIdNorm,
    companyIdNorm,
    emailNorm,
    phoneNorm,
    fullNameNorm,
    birthDateNorm,
    addressNorm,
    employerNorm,
    institutionNorm,
  } = extractSignals(extracted);

  // 1) personalId exact match – very strong
  if (personalIdNorm.length >= 9) {
    const rows = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        personalId: contacts.personalId,
        email: contacts.email,
        phone: contacts.phone,
        birthDate: contacts.birthDate,
        street: contacts.street,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          sql`${contacts.personalId} IS NOT NULL AND replace(replace(${contacts.personalId}, ' ', ''), '-', '') = ${personalIdNorm}`
        )
      )
      .limit(10);
    for (const r of rows) {
      const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.id;
      byId.set(r.id, {
        clientId: r.id,
        score: SCORE.personalIdExact,
        confidence: "high",
        reasons: ["Shoda rodného čísla"],
        matchedFields: { personalId: true },
        displayName,
      });
    }
  }

  // 2) companyId (IČO) – match via companies + companyPersonLinks
  if (companyIdNorm.length >= 8 && byId.size === 0) {
    const linkRows = await db
      .select({
        contactId: companyPersonLinks.contactId,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(companyPersonLinks)
      .innerJoin(companies, eq(companies.id, companyPersonLinks.companyId))
      .innerJoin(contacts, eq(contacts.id, companyPersonLinks.contactId))
      .where(
        and(
          eq(companyPersonLinks.tenantId, tenantId),
          eq(companies.tenantId, tenantId),
          sql`REPLACE(${companies.ico}, ' ', '') = ${companyIdNorm}`
        )
      )
      .limit(10);
    for (const r of linkRows) {
      if (!r.contactId) continue;
      const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.contactId;
      const existing = byId.get(r.contactId);
      if (!existing || existing.score < SCORE.companyIdExact) {
        byId.set(r.contactId, {
          clientId: r.contactId,
          score: SCORE.companyIdExact,
          confidence: "high",
          reasons: ["Shoda IČO (firma)"],
          matchedFields: { companyId: true },
          displayName,
        });
      }
    }
  }

  const allContacts = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      birthDate: contacts.birthDate,
      personalId: contacts.personalId,
      street: contacts.street,
      notes: contacts.notes,
    })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId))
    .limit(400);

  for (const r of allContacts) {
    let score = 0;
    const reasons: string[] = [];
    const matchedFields: Record<string, boolean> = {};
    const contactName = normalizeName([r.firstName, r.lastName].filter(Boolean).join(" "));
    if (fullNameNorm && contactName === fullNameNorm) {
      score += SCORE.fullName;
      matchedFields.fullName = true;
      matchedFields.firstName = true;
      matchedFields.lastName = true;
      reasons.push("Shoda jména");
    }
    if (birthDateNorm && normalizeDate(r.birthDate) === birthDateNorm) {
      score += SCORE.birthDate;
      matchedFields.birthDate = true;
      reasons.push("Shoda data narození");
    }
    if (emailNorm && normalizeEmail(r.email) === emailNorm) {
      score += SCORE.email;
      matchedFields.email = true;
      reasons.push("Shoda e-mailu");
    }
    if (phoneNorm && normalizePhone(r.phone) === phoneNorm) {
      score += SCORE.phone;
      matchedFields.phone = true;
      reasons.push("Shoda telefonu");
    }
    if (addressNorm && normalizeAddress(r.street) === addressNorm) {
      score += SCORE.address;
      matchedFields.address = true;
      reasons.push("Shoda adresy");
    }
    if (personalIdNorm.length >= 9 && normalizePersonalId(r.personalId) === personalIdNorm) {
      score += SCORE.personalIdExact;
      matchedFields.personalId = true;
      reasons.push("Shoda rodného čísla");
    }
    if (employerNorm && normalizeForCompare(r.notes).includes(employerNorm)) {
      score += SCORE.employer;
      reasons.push("Shoda zaměstnavatele v poznámce");
    }
    if (institutionNorm && normalizeForCompare(r.notes).includes(institutionNorm)) {
      score += SCORE.insurerOrLenderHint;
      reasons.push("Shoda instituce v kontextu");
    }
    if (score < 0.25) continue;
    score = Math.min(1, score);
    const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.id;
    byId.set(r.id, {
      clientId: r.id,
      score,
      confidence: confidenceFromScore(score),
      reasons,
      matchedFields,
      displayName,
    });
  }

  const result = Array.from(byId.values()).map((c) => ({
    ...c,
    confidence: confidenceFromScore(c.score),
  }));
  result.sort((a, b) => b.score - a.score);
  return result.slice(0, 20);
}

/**
 * Whether matching is ambiguous (multiple similar scores) and should require manual review.
 */
export function isMatchingAmbiguous(candidates: ClientMatchCandidate[]): boolean {
  const high = candidates.filter((c) => c.confidence === "high");
  if (high.length > 1) return true;
  const topScore = candidates[0]?.score ?? 0;
  const similar = candidates.filter((c) => c.score >= topScore - 0.07 && c.score <= topScore + 0.07);
  return similar.length > 1;
}

export async function findMatchedHouseholds(
  tenantId: string,
  clientCandidates: ClientMatchCandidate[]
): Promise<Array<{ entityId: string; score: number; reason: string }>> {
  const top = clientCandidates.slice(0, 5);
  if (top.length === 0) return [];
  const contactIds = top.map((c) => c.clientId);
  const rows = await db
    .select({
      householdId: households.id,
      contactId: householdMembers.contactId,
      householdName: households.name,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(and(eq(households.tenantId, tenantId), inArray(householdMembers.contactId, contactIds)))
    .limit(20);
  const out = new Map<string, { entityId: string; score: number; reason: string }>();
  for (const row of rows) {
    const candidate = top.find((c) => c.clientId === row.contactId);
    if (!candidate) continue;
    const current = out.get(row.householdId);
    const score = Math.min(1, candidate.score * 0.92);
    if (!current || current.score < score) {
      out.set(row.householdId, {
        entityId: row.householdId,
        score,
        reason: `Člen householdu: ${row.householdName}`,
      });
    }
  }
  return [...out.values()].sort((a, b) => b.score - a.score);
}

export async function findMatchedDeals(
  tenantId: string,
  clientCandidates: ClientMatchCandidate[],
  contractNumber?: string | null
): Promise<Array<{ entityId: string; score: number; reason: string }>> {
  const topClient = clientCandidates[0];
  if (!topClient) return [];
  const oppRows = await db
    .select({ id: opportunities.id, title: opportunities.title })
    .from(opportunities)
    .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.contactId, topClient.clientId)))
    .limit(5);
  const contractRows =
    contractNumber && contractNumber.trim()
      ? await db
          .select({ id: contracts.id, contractNumber: contracts.contractNumber })
          .from(contracts)
          .where(and(eq(contracts.tenantId, tenantId), eq(contracts.contractNumber, contractNumber.trim())))
          .limit(5)
      : [];
  const mapped = [
    ...oppRows.map((r) => ({ entityId: r.id, score: Math.min(1, topClient.score * 0.85), reason: `Opportunity: ${r.title}` })),
    ...contractRows.map((r) => ({
      entityId: r.id,
      score: Math.min(1, topClient.score * 0.9),
      reason: `Smlouva s číslem ${r.contractNumber ?? contractNumber ?? "—"}`,
    })),
  ];
  mapped.sort((a, b) => b.score - a.score);
  return mapped;
}

export async function findMatchedCompanies(
  tenantId: string,
  extracted: ExtractedContractSchema | DocumentReviewEnvelope
): Promise<Array<{ entityId: string; score: number; reason: string }>> {
  const { companyIdNorm, employerNorm } = extractSignals(extracted);
  const out = new Map<string, { entityId: string; score: number; reason: string }>();
  if (companyIdNorm) {
    const rows = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, tenantId),
          sql`REPLACE(${companies.ico}, ' ', '') = ${companyIdNorm}`
        )
      )
      .limit(5);
    for (const row of rows) {
      out.set(row.id, {
        entityId: row.id,
        score: 0.95,
        reason: `Shoda IČO firmy ${row.name ?? row.id}`,
      });
    }
  }
  if (employerNorm) {
    const rows = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.tenantId, tenantId))
      .limit(200);
    for (const row of rows) {
      const companyNorm = normalizeForCompare(row.name);
      if (!companyNorm || !companyNorm.includes(employerNorm)) continue;
      const existing = out.get(row.id);
      if (!existing || existing.score < 0.7) {
        out.set(row.id, {
          entityId: row.id,
          score: 0.7,
          reason: `Názvová shoda firmy ${row.name ?? row.id}`,
        });
      }
    }
  }
  return [...out.values()].sort((a, b) => b.score - a.score);
}

export async function findMatchedExistingContracts(
  tenantId: string,
  extracted: ExtractedContractSchema | DocumentReviewEnvelope,
  clientCandidates: ClientMatchCandidate[]
): Promise<Array<{ entityId: string; score: number; reason: string }>> {
  const asEnvelope = extracted as DocumentReviewEnvelope;
  const possibleContractNumber = String(
    asEnvelope?.extractedFields?.existingPolicyNumber?.value ??
      asEnvelope?.extractedFields?.contractNumber?.value ??
      ""
  ).trim();
  const out: Array<{ entityId: string; score: number; reason: string }> = [];
  if (possibleContractNumber) {
    const rows = await db
      .select({ id: contracts.id, contractNumber: contracts.contractNumber, contactId: contracts.contactId })
      .from(contracts)
      .where(and(eq(contracts.tenantId, tenantId), eq(contracts.contractNumber, possibleContractNumber)))
      .limit(10);
    for (const row of rows) {
      const linkedClientScore = clientCandidates.find((c) => c.clientId === row.contactId)?.score ?? 0.65;
      out.push({
        entityId: row.id,
        score: Math.min(1, 0.75 + linkedClientScore * 0.2),
        reason: `Shoda čísla smlouvy ${row.contractNumber ?? possibleContractNumber}`,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
