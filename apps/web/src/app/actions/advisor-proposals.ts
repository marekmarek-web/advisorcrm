"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "db";
import { db } from "db";
import {
  advisorProposals,
  advisorProposalSegments,
  contacts,
  type AdvisorProposalBenefit,
  type AdvisorProposalSegment,
  type AdvisorProposalStatus,
} from "db";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { logActivity } from "./activity";

export type AdvisorProposalRow = {
  id: string;
  tenantId: string;
  contactId: string;
  householdId: string | null;
  createdBy: string;
  segment: AdvisorProposalSegment;
  title: string;
  summary: string | null;
  currentAnnualCost: number | null;
  proposedAnnualCost: number | null;
  savingsAnnual: number | null;
  currency: string;
  benefits: AdvisorProposalBenefit[] | null;
  validUntil: string | null;
  status: AdvisorProposalStatus;
  publishedAt: string | null;
  firstViewedAt: string | null;
  respondedAt: string | null;
  responseRequestId: string | null;
  sourceCalculatorRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeBenefits(input: unknown): AdvisorProposalBenefit[] | null {
  if (!Array.isArray(input)) return null;
  const out: AdvisorProposalBenefit[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const label = typeof obj.label === "string" ? obj.label.trim() : "";
    if (!label) continue;
    const delta = typeof obj.delta === "string" ? obj.delta.trim() || null : null;
    out.push({ label, delta });
  }
  return out.length > 0 ? out : null;
}

function toDateIsoString(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function mapRow(r: typeof advisorProposals.$inferSelect): AdvisorProposalRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    contactId: r.contactId,
    householdId: r.householdId,
    createdBy: r.createdBy,
    segment: r.segment as AdvisorProposalSegment,
    title: r.title,
    summary: r.summary,
    currentAnnualCost: toNumber(r.currentAnnualCost),
    proposedAnnualCost: toNumber(r.proposedAnnualCost),
    savingsAnnual: toNumber(r.savingsAnnual),
    currency: r.currency,
    benefits: (r.benefits as AdvisorProposalBenefit[] | null) ?? null,
    validUntil: r.validUntil ?? null,
    status: r.status as AdvisorProposalStatus,
    publishedAt: toDateIsoString(r.publishedAt),
    firstViewedAt: toDateIsoString(r.firstViewedAt),
    respondedAt: toDateIsoString(r.respondedAt),
    responseRequestId: r.responseRequestId,
    sourceCalculatorRunId: r.sourceCalculatorRunId,
    createdAt: toDateIsoString(r.createdAt) ?? new Date().toISOString(),
    updatedAt: toDateIsoString(r.updatedAt) ?? new Date().toISOString(),
  };
}

export type CreateAdvisorProposalInput = {
  contactId: string;
  householdId?: string | null;
  segment: AdvisorProposalSegment;
  title: string;
  summary?: string | null;
  currentAnnualCost?: number | null;
  proposedAnnualCost?: number | null;
  currency?: string;
  benefits?: AdvisorProposalBenefit[] | null;
  validUntil?: string | null;
  sourceCalculatorRunId?: string | null;
  /** Publikovat ihned (přeskočit draft). */
  publishImmediately?: boolean;
};

function sanitizeSegment(value: unknown): AdvisorProposalSegment {
  if (typeof value === "string" && advisorProposalSegments.includes(value as AdvisorProposalSegment)) {
    return value as AdvisorProposalSegment;
  }
  return "other";
}

async function assertOwnsContact(tenantId: string, contactId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
    .limit(1);
  return Boolean(row);
}

export async function createAdvisorProposal(
  input: CreateAdvisorProposalInput
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { success: false, error: "Forbidden" };
  }
  const title = input.title?.trim();
  if (!title) return { success: false, error: "Vyplňte název návrhu." };
  if (!input.contactId) return { success: false, error: "Chybí kontakt." };
  const owns = await assertOwnsContact(auth.tenantId, input.contactId);
  if (!owns) return { success: false, error: "Kontakt nenalezen." };

  const segment = sanitizeSegment(input.segment);
  const status: AdvisorProposalStatus = input.publishImmediately ? "published" : "draft";
  const now = new Date();

  const [row] = await db
    .insert(advisorProposals)
    .values({
      tenantId: auth.tenantId,
      contactId: input.contactId,
      householdId: input.householdId ?? null,
      createdBy: auth.userId,
      segment,
      title,
      summary: input.summary?.trim() || null,
      currentAnnualCost:
        input.currentAnnualCost !== null && input.currentAnnualCost !== undefined
          ? String(input.currentAnnualCost)
          : null,
      proposedAnnualCost:
        input.proposedAnnualCost !== null && input.proposedAnnualCost !== undefined
          ? String(input.proposedAnnualCost)
          : null,
      currency: (input.currency || "CZK").toUpperCase().slice(0, 3),
      benefits: normalizeBenefits(input.benefits),
      validUntil: input.validUntil || null,
      status,
      publishedAt: status === "published" ? now : null,
      sourceCalculatorRunId: input.sourceCalculatorRunId ?? null,
    })
    .returning({ id: advisorProposals.id });

  if (!row?.id) return { success: false, error: "Nepodařilo se uložit návrh." };

  try {
    await logActivity("contact", input.contactId, "update", {
      source: "advisor_proposal_create",
      proposalId: row.id,
      segment,
      status,
    });
  } catch {
    /* non-fatal */
  }

  try {
    revalidatePath(`/portal/contacts/${input.contactId}`);
    revalidatePath(`/dashboard/contacts/${input.contactId}`);
  } catch {
    /* ignore */
  }

  return { success: true, id: row.id };
}

export type UpdateAdvisorProposalInput = Partial<
  Omit<CreateAdvisorProposalInput, "contactId" | "publishImmediately">
> & {
  id: string;
};

export async function updateAdvisorProposal(
  input: UpdateAdvisorProposalInput
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { success: false, error: "Forbidden" };
  }

  const [row] = await db
    .select()
    .from(advisorProposals)
    .where(
      and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.id, input.id))
    )
    .limit(1);
  if (!row) return { success: false, error: "Návrh nebyl nalezen." };
  if (row.status !== "draft") {
    return { success: false, error: "Upravovat lze jen nepublikovaný návrh (draft)." };
  }

  const patch: Partial<typeof advisorProposals.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.summary !== undefined) patch.summary = input.summary?.trim() || null;
  if (input.segment !== undefined) patch.segment = sanitizeSegment(input.segment);
  if (input.currentAnnualCost !== undefined) {
    patch.currentAnnualCost =
      input.currentAnnualCost === null ? null : String(input.currentAnnualCost);
  }
  if (input.proposedAnnualCost !== undefined) {
    patch.proposedAnnualCost =
      input.proposedAnnualCost === null ? null : String(input.proposedAnnualCost);
  }
  if (input.currency !== undefined) {
    patch.currency = (input.currency || "CZK").toUpperCase().slice(0, 3);
  }
  if (input.benefits !== undefined) patch.benefits = normalizeBenefits(input.benefits);
  if (input.validUntil !== undefined) patch.validUntil = input.validUntil || null;
  if (input.householdId !== undefined) patch.householdId = input.householdId ?? null;

  await db
    .update(advisorProposals)
    .set(patch)
    .where(
      and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.id, input.id))
    );

  try {
    revalidatePath(`/portal/contacts/${row.contactId}`);
    revalidatePath(`/dashboard/contacts/${row.contactId}`);
  } catch {
    /* ignore */
  }
  return { success: true };
}

export async function publishAdvisorProposal(
  proposalId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { success: false, error: "Forbidden" };
  }

  const [row] = await db
    .select({ id: advisorProposals.id, contactId: advisorProposals.contactId, status: advisorProposals.status })
    .from(advisorProposals)
    .where(and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.id, proposalId)))
    .limit(1);
  if (!row) return { success: false, error: "Návrh nebyl nalezen." };
  if (row.status !== "draft" && row.status !== "withdrawn") {
    return { success: false, error: "Publikovat lze jen draft nebo stažený návrh." };
  }

  const now = new Date();
  await db
    .update(advisorProposals)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(
      and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.id, proposalId))
    );

  try {
    revalidatePath(`/portal/contacts/${row.contactId}`);
    revalidatePath(`/dashboard/contacts/${row.contactId}`);
    revalidatePath("/client");
    revalidatePath("/client/navrhy");
  } catch {
    /* ignore */
  }
  return { success: true };
}

export async function withdrawAdvisorProposal(
  proposalId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { success: false, error: "Forbidden" };
  }

  const [row] = await db
    .select({ id: advisorProposals.id, contactId: advisorProposals.contactId, status: advisorProposals.status })
    .from(advisorProposals)
    .where(and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.id, proposalId)))
    .limit(1);
  if (!row) return { success: false, error: "Návrh nebyl nalezen." };
  if (!["published", "viewed", "expired"].includes(row.status)) {
    return { success: false, error: "Stáhnout lze jen publikovaný / zobrazený / vypršelý návrh." };
  }

  await db
    .update(advisorProposals)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(
      and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.id, proposalId))
    );

  try {
    revalidatePath(`/portal/contacts/${row.contactId}`);
    revalidatePath(`/dashboard/contacts/${row.contactId}`);
    revalidatePath("/client");
    revalidatePath("/client/navrhy");
  } catch {
    /* ignore */
  }
  return { success: true };
}

export async function deleteAdvisorProposal(
  proposalId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { success: false, error: "Forbidden" };
  }
  const [row] = await db
    .select({ contactId: advisorProposals.contactId, status: advisorProposals.status })
    .from(advisorProposals)
    .where(and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.id, proposalId)))
    .limit(1);
  if (!row) return { success: false, error: "Návrh nebyl nalezen." };
  if (row.status !== "draft") {
    return { success: false, error: "Smazat lze jen nepublikovaný draft." };
  }
  await db
    .delete(advisorProposals)
    .where(
      and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.id, proposalId))
    );

  try {
    revalidatePath(`/portal/contacts/${row.contactId}`);
    revalidatePath(`/dashboard/contacts/${row.contactId}`);
  } catch {
    /* ignore */
  }
  return { success: true };
}

export async function listProposalsForContact(contactId: string): Promise<AdvisorProposalRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return [];
  const rows = await db
    .select()
    .from(advisorProposals)
    .where(
      and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.contactId, contactId))
    )
    .orderBy(desc(advisorProposals.createdAt));
  return rows.map(mapRow);
}

export async function listProposalsForHousehold(householdId: string): Promise<AdvisorProposalRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return [];
  const rows = await db
    .select()
    .from(advisorProposals)
    .where(
      and(
        eq(advisorProposals.tenantId, auth.tenantId),
        eq(advisorProposals.householdId, householdId)
      )
    )
    .orderBy(desc(advisorProposals.createdAt));
  return rows.map(mapRow);
}

export async function getAdvisorProposal(proposalId: string): Promise<AdvisorProposalRow | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return null;
  const [row] = await db
    .select()
    .from(advisorProposals)
    .where(
      and(eq(advisorProposals.tenantId, auth.tenantId), eq(advisorProposals.id, proposalId))
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

/** Pro bulk stats v hlavní listě kontaktů (kolik aktivních návrhů / suma úspor). */
export async function getActiveProposalSummaryForContacts(
  contactIds: string[]
): Promise<Record<string, { activeCount: number; totalAnnualSavings: number }>> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return {};
  if (contactIds.length === 0) return {};

  const rows = await db
    .select({
      contactId: advisorProposals.contactId,
      savings: advisorProposals.savingsAnnual,
      status: advisorProposals.status,
    })
    .from(advisorProposals)
    .where(
      and(
        eq(advisorProposals.tenantId, auth.tenantId),
        inArray(advisorProposals.contactId, contactIds)
      )
    );

  const out: Record<string, { activeCount: number; totalAnnualSavings: number }> = {};
  for (const r of rows) {
    if (!["published", "viewed"].includes(r.status)) continue;
    const bucket = out[r.contactId] ?? { activeCount: 0, totalAnnualSavings: 0 };
    bucket.activeCount += 1;
    const s = toNumber(r.savings);
    if (s && s > 0) bucket.totalAnnualSavings += s;
    out[r.contactId] = bucket;
  }
  return out;
}
