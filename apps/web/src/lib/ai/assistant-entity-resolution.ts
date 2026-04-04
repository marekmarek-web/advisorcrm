/**
 * Entity resolution: resolves textual references from user messages
 * to actual DB entities (contacts, opportunities, documents, contracts).
 */

import { db, contacts, opportunities, documents, eq, and, isNull, desc, sql } from "db";
import { searchContactsForAssistant, type AssistantContactMatch } from "./assistant-contact-search";
import type { AssistantSession } from "./assistant-session";
import type { CanonicalIntent } from "./assistant-domain-model";

export type ResolvedEntity = {
  entityType: "contact" | "opportunity" | "document" | "contract";
  entityId: string;
  displayLabel: string;
  confidence: number;
  ambiguous: boolean;
  alternatives: { id: string; label: string }[];
};

export type EntityResolutionResult = {
  client: ResolvedEntity | null;
  opportunity: ResolvedEntity | null;
  document: ResolvedEntity | null;
  contract: ResolvedEntity | null;
  warnings: string[];
};

function emptyResolution(): EntityResolutionResult {
  return { client: null, opportunity: null, document: null, contract: null, warnings: [] };
}

function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

async function resolveClientRef(
  tenantId: string,
  ref: string,
  _session: AssistantSession,
): Promise<ResolvedEntity | null> {
  if (isUuid(ref)) {
    const rows = await db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(eq(contacts.id, ref), eq(contacts.tenantId, tenantId)))
      .limit(1);
    if (rows[0]) {
      return {
        entityType: "contact",
        entityId: rows[0].id,
        displayLabel: `${rows[0].firstName} ${rows[0].lastName}`.trim(),
        confidence: 1.0,
        ambiguous: false,
        alternatives: [],
      };
    }
    return null;
  }

  const matches = await searchContactsForAssistant(tenantId, ref, 5, { match: "all" });
  if (matches.length === 0) return null;

  if (matches.length === 1) {
    return {
      entityType: "contact",
      entityId: matches[0]!.id,
      displayLabel: matches[0]!.displayName,
      confidence: 0.9,
      ambiguous: false,
      alternatives: [],
    };
  }

  return {
    entityType: "contact",
    entityId: matches[0]!.id,
    displayLabel: matches[0]!.displayName,
    confidence: 0.6,
    ambiguous: true,
    alternatives: matches.slice(1).map((m) => ({ id: m.id, label: m.displayName })),
  };
}

async function resolveOpportunityRef(
  tenantId: string,
  ref: string,
  contactId: string | null,
): Promise<ResolvedEntity | null> {
  if (isUuid(ref)) {
    const rows = await db
      .select({ id: opportunities.id, title: opportunities.title })
      .from(opportunities)
      .where(and(eq(opportunities.id, ref), eq(opportunities.tenantId, tenantId), isNull(opportunities.archivedAt)))
      .limit(1);
    if (rows[0]) {
      return {
        entityType: "opportunity",
        entityId: rows[0].id,
        displayLabel: rows[0].title,
        confidence: 1.0,
        ambiguous: false,
        alternatives: [],
      };
    }
    return null;
  }

  if (contactId) {
    const rows = await db
      .select({ id: opportunities.id, title: opportunities.title })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenantId, tenantId),
          eq(opportunities.contactId, contactId),
          isNull(opportunities.archivedAt),
          sql`${opportunities.title} ILIKE ${"%" + ref + "%"}`,
        ),
      )
      .orderBy(desc(opportunities.updatedAt))
      .limit(5);

    if (rows.length === 1 && rows[0]) {
      return {
        entityType: "opportunity",
        entityId: rows[0].id,
        displayLabel: rows[0].title,
        confidence: 0.85,
        ambiguous: false,
        alternatives: [],
      };
    }
    if (rows.length > 1 && rows[0]) {
      return {
        entityType: "opportunity",
        entityId: rows[0].id,
        displayLabel: rows[0].title,
        confidence: 0.5,
        ambiguous: true,
        alternatives: rows.slice(1).map((r) => ({ id: r.id, label: r.title })),
      };
    }
  }

  return null;
}

async function resolveDocumentRef(
  tenantId: string,
  explicitRef: string | undefined,
  session: AssistantSession,
): Promise<ResolvedEntity | null> {
  if (session.lockedDocumentId) {
    const rows = await db
      .select({ id: documents.id, name: documents.name })
      .from(documents)
      .where(and(eq(documents.id, session.lockedDocumentId), eq(documents.tenantId, tenantId)))
      .limit(1);
    if (rows[0]) {
      return {
        entityType: "document",
        entityId: rows[0].id,
        displayLabel: rows[0].name,
        confidence: 1.0,
        ambiguous: false,
        alternatives: [],
      };
    }
  }

  if (explicitRef && isUuid(explicitRef)) {
    const rows = await db
      .select({ id: documents.id, name: documents.name })
      .from(documents)
      .where(and(eq(documents.id, explicitRef), eq(documents.tenantId, tenantId)))
      .limit(1);
    if (rows[0]) {
      return {
        entityType: "document",
        entityId: rows[0].id,
        displayLabel: rows[0].name,
        confidence: 1.0,
        ambiguous: false,
        alternatives: [],
      };
    }
  }

  return null;
}

export async function resolveEntities(
  tenantId: string,
  intent: CanonicalIntent,
  session: AssistantSession,
): Promise<EntityResolutionResult> {
  const result = emptyResolution();

  const clientRef = intent.targetClient?.ref;
  if (clientRef) {
    const resolved = await resolveClientRef(tenantId, clientRef, session);
    if (resolved) {
      result.client = resolved;
      if (resolved.ambiguous) {
        result.warnings.push(
          `Nalezeno více klientů pro „${clientRef}": ${resolved.displayLabel} a ${resolved.alternatives.length} dalších. Upřesněte prosím.`,
        );
      }
    } else {
      result.warnings.push(`Klient „${clientRef}" nebyl nalezen.`);
    }
  } else if (
    (session.lockedClientId || session.activeClientId) &&
    !session.pendingClientDisambiguation
  ) {
    const cid = session.lockedClientId ?? session.activeClientId!;
    const rows = await db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(eq(contacts.id, cid), eq(contacts.tenantId, tenantId)))
      .limit(1);
    if (rows[0]) {
      result.client = {
        entityType: "contact",
        entityId: rows[0].id,
        displayLabel: `${rows[0].firstName} ${rows[0].lastName}`.trim(),
        confidence: 1.0,
        ambiguous: false,
        alternatives: [],
      };
    }
  }

  const oppRef = intent.targetOpportunity?.ref;
  if (oppRef) {
    const resolved = await resolveOpportunityRef(tenantId, oppRef, result.client?.entityId ?? null);
    if (resolved) {
      result.opportunity = resolved;
      if (resolved.ambiguous) {
        result.warnings.push(
          `Nalezeno více obchodů pro „${oppRef}". Upřesněte prosím.`,
        );
      }
    } else {
      result.warnings.push(`Obchod „${oppRef}" nebyl nalezen.`);
    }
  } else if (session.lockedOpportunityId) {
    const resolved = await resolveOpportunityRef(tenantId, session.lockedOpportunityId, result.client?.entityId ?? null);
    if (resolved) {
      result.opportunity = resolved;
    }
  }

  const docRef = intent.targetDocument?.ref;
  if (docRef || session.lockedDocumentId) {
    const resolvedDoc = await resolveDocumentRef(tenantId, docRef, session);
    if (resolvedDoc) {
      result.document = resolvedDoc;
    } else if (docRef && isUuid(docRef)) {
      result.warnings.push(`Dokument „${docRef}" nebyl nalezen.`);
    }
  }

  return result;
}

/**
 * Patch an intent with resolved entity IDs so downstream layers
 * can use the resolved ID rather than textual reference.
 */
export function patchIntentWithResolutions(
  intent: CanonicalIntent,
  resolution: EntityResolutionResult,
): CanonicalIntent {
  const patched = { ...intent };
  if (resolution.client && !resolution.client.ambiguous) {
    patched.targetClient = { ref: resolution.client.entityId, resolved: true };
  }
  if (resolution.opportunity && !resolution.opportunity.ambiguous) {
    patched.targetOpportunity = { ref: resolution.opportunity.entityId, resolved: true };
  }
  if (resolution.document && !resolution.document.ambiguous) {
    patched.targetDocument = { ref: resolution.document.entityId, resolved: true };
  }
  return patched;
}
