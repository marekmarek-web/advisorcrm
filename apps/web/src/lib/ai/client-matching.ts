import { db } from "db";
import { contacts, companies, companyPersonLinks } from "db";
import { eq, and, or, sql } from "drizzle-orm";
import type { ExtractedContractSchema } from "./extraction-schemas";
import type { ClientMatchCandidate, MatchConfidence } from "./review-queue";
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
  personalIdExact: 1.0,
  companyIdExact: 0.95,
  fullNameBirthDate: 0.9,
  fullNameEmail: 0.75,
  fullNamePhone: 0.7,
  fullNameOnly: 0.35,
  addressOnly: 0.2,
} as const;

function confidenceFromScore(score: number): MatchConfidence {
  if (score >= 0.85) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function fullNameFromExtracted(extracted: ExtractedContractSchema): string {
  const c = extracted.client;
  if (c?.fullName) return normalizeName(c.fullName);
  const first = normalizeName(c?.firstName ?? "");
  const last = normalizeName(c?.lastName ?? "");
  return [first, last].filter(Boolean).join(" ");
}

/**
 * Find CRM contact candidates matching extracted contract client.
 * Uses normalized comparison; returns candidates with score, confidence, reasons, matchedFields.
 */
export async function findClientCandidates(
  extracted: ExtractedContractSchema,
  context: ClientMatchingContext
): Promise<ClientMatchCandidate[]> {
  const { tenantId } = context;
  const c = extracted.client;
  const byId = new Map<string, ClientMatchCandidate>();

  const personalIdNorm = normalizePersonalId(c?.personalId);
  const companyIdNorm = normalizeCompanyId(c?.companyId);
  const emailNorm = normalizeEmail(c?.email);
  const phoneNorm = normalizePhone(c?.phone);
  const fullNameNorm = fullNameFromExtracted(extracted);
  const birthDateNorm = normalizeDate(c?.birthDate);
  const addressNorm = normalizeAddress(c?.address);

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

  // 3) fullName + birthDate
  if (fullNameNorm && birthDateNorm) {
    const allContacts = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        birthDate: contacts.birthDate,
        email: contacts.email,
        phone: contacts.phone,
        street: contacts.street,
        personalId: contacts.personalId,
      })
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId))
      .limit(200);
    for (const r of allContacts) {
      const contactFullName = normalizeName([r.firstName, r.lastName].filter(Boolean).join(" "));
      const contactBirth = normalizeDate(r.birthDate);
      if (contactFullName !== fullNameNorm || contactBirth !== birthDateNorm) continue;
      const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.id;
      const existing = byId.get(r.id);
      if (!existing || existing.score < SCORE.fullNameBirthDate) {
        byId.set(r.id, {
          clientId: r.id,
          score: SCORE.fullNameBirthDate,
          confidence: "high",
          reasons: ["Shoda jména a data narození"],
          matchedFields: { fullName: true, firstName: true, lastName: true, birthDate: true },
          displayName,
        });
      }
    }
  }

  // 4) fullName + email
  if (fullNameNorm && emailNorm) {
    const allContacts = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId))
      .limit(200);
    for (const r of allContacts) {
      if (normalizeEmail(r.email) !== emailNorm) continue;
      const contactFullName = normalizeName([r.firstName, r.lastName].filter(Boolean).join(" "));
      if (contactFullName !== fullNameNorm) continue;
      const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.id;
      const existing = byId.get(r.id);
      if (!existing || existing.score < SCORE.fullNameEmail) {
        byId.set(r.id, {
          clientId: r.id,
          score: SCORE.fullNameEmail,
          confidence: "medium",
          reasons: ["Shoda jména a e-mailu"],
          matchedFields: { fullName: true, email: true },
          displayName,
        });
      }
    }
  }

  // 5) fullName + phone
  if (fullNameNorm && phoneNorm) {
    const allContacts = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        phone: contacts.phone,
      })
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId))
      .limit(200);
    for (const r of allContacts) {
      if (normalizePhone(r.phone) !== phoneNorm) continue;
      const contactFullName = normalizeName([r.firstName, r.lastName].filter(Boolean).join(" "));
      if (contactFullName !== fullNameNorm) continue;
      const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.id;
      const existing = byId.get(r.id);
      if (!existing || existing.score < SCORE.fullNamePhone) {
        byId.set(r.id, {
          clientId: r.id,
          score: SCORE.fullNamePhone,
          confidence: "medium",
          reasons: ["Shoda jména a telefonu"],
          matchedFields: { fullName: true, phone: true },
          displayName,
        });
      }
    }
  }

  // 6) fullName only – weak
  if (fullNameNorm && byId.size === 0) {
    const allContacts = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(eq(contacts.tenantId, tenantId))
      .limit(100);
    for (const r of allContacts) {
      const contactFullName = normalizeName([r.firstName, r.lastName].filter(Boolean).join(" "));
      if (contactFullName !== fullNameNorm) continue;
      const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.id;
      byId.set(r.id, {
        clientId: r.id,
        score: SCORE.fullNameOnly,
        confidence: "low",
        reasons: ["Shoda jména"],
        matchedFields: { fullName: true, firstName: true, lastName: true },
        displayName,
      });
    }
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
  const similar = candidates.filter((c) => c.score >= topScore - 0.15 && c.score <= topScore + 0.15);
  return similar.length > 1;
}
