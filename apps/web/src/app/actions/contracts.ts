"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { contracts, partners, products, SEGMENT_LABELS } from "db";
import { eq, and, asc, or, isNull, gte, lt, sql } from "db";
import { contractSegments } from "db";
import { logActivity } from "./activity";

export type ContractRow = {
  id: string;
  contactId: string;
  segment: string;
  partnerId: string | null;
  productId: string | null;
  partnerName: string | null;
  productName: string | null;
  premiumAmount: string | null;
  premiumAnnual: string | null;
  contractNumber: string | null;
  startDate: string | null;
  anniversaryDate: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getContractsByContact(contactId: string): Promise<ContractRow[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (auth.contactId !== contactId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }
  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.contactId, contactId)))
    .orderBy(asc(contracts.startDate));
  return rows;
}

export async function getPartnersForTenant(): Promise<{ id: string; name: string; segment: string }[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({ id: partners.id, name: partners.name, segment: partners.segment })
    .from(partners)
    .where(or(eq(partners.tenantId, auth.tenantId), isNull(partners.tenantId)))
    .orderBy(partners.name);
  return rows;
}

export type ProductOption = { id: string; name: string; category?: string | null; isTbd?: boolean | null };

export async function getProductsForPartner(partnerId: string): Promise<ProductOption[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({ id: products.id, name: products.name, category: products.category, isTbd: products.isTbd })
    .from(products)
    .where(eq(products.partnerId, partnerId))
    .orderBy(asc(products.category), asc(products.name));
  return rows;
}

export async function getContractSegments(): Promise<string[]> {
  return [...contractSegments];
}

export async function createContract(
  contactId: string,
  form: {
    segment: string;
    partnerId?: string;
    productId?: string;
    partnerName?: string;
    productName?: string;
    premiumAmount?: string;
    premiumAnnual?: string;
    contractNumber?: string;
    startDate?: string;
    anniversaryDate?: string;
    note?: string;
  }
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  let partnerName = form.partnerName?.trim() || null;
  let productName = form.productName?.trim() || null;
  if (form.partnerId && !partnerName) {
    const [p] = await db.select({ name: partners.name }).from(partners).where(eq(partners.id, form.partnerId)).limit(1);
    if (p) partnerName = p.name;
  }
  if (form.productId && !productName) {
    const [pr] = await db.select({ name: products.name }).from(products).where(eq(products.id, form.productId)).limit(1);
    if (pr) productName = pr.name;
  }
  const [row] = await db
    .insert(contracts)
    .values({
      tenantId: auth.tenantId,
      contactId,
      advisorId: auth.userId,
      segment: form.segment,
      partnerId: form.partnerId || null,
      productId: form.productId || null,
      partnerName,
      productName,
      premiumAmount: form.premiumAmount || null,
      premiumAnnual: form.premiumAnnual || null,
      contractNumber: form.contractNumber?.trim() || null,
      startDate: form.startDate || null,
      anniversaryDate: form.anniversaryDate || null,
      note: form.note?.trim() || null,
    })
    .returning({ id: contracts.id });
  const newId = row?.id ?? null;
  if (newId) {
    try { await logActivity("contract", newId, "create", { segment: form.segment, contactId }); } catch {}
  }
  return newId;
}

export async function updateContract(
  id: string,
  form: {
    segment?: string;
    partnerId?: string;
    productId?: string;
    partnerName?: string;
    productName?: string;
    premiumAmount?: string;
    premiumAnnual?: string;
    contractNumber?: string;
    startDate?: string;
    anniversaryDate?: string;
    note?: string;
  }
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  let partnerName: string | null | undefined = form.partnerName != null ? (form.partnerName?.trim() || null) : undefined;
  let productName: string | null | undefined = form.productName != null ? (form.productName?.trim() || null) : undefined;
  if (form.partnerId != null && (partnerName === undefined || partnerName === null || partnerName === "")) {
    const [p] = await db.select({ name: partners.name }).from(partners).where(eq(partners.id, form.partnerId)).limit(1);
    if (p) partnerName = p.name;
  }
  if (form.productId != null && (productName === undefined || productName === null || productName === "")) {
    const [pr] = await db.select({ name: products.name }).from(products).where(eq(products.id, form.productId)).limit(1);
    if (pr) productName = pr.name;
  }
  await db
    .update(contracts)
    .set({
      ...(form.segment != null && { segment: form.segment }),
      ...(form.partnerId != null && { partnerId: form.partnerId || null }),
      ...(form.productId != null && { productId: form.productId || null }),
      ...(partnerName !== undefined && { partnerName }),
      ...(productName !== undefined && { productName }),
      ...(form.premiumAmount != null && { premiumAmount: form.premiumAmount || null }),
      ...(form.premiumAnnual != null && { premiumAnnual: form.premiumAnnual || null }),
      ...(form.contractNumber != null && { contractNumber: form.contractNumber?.trim() || null }),
      ...(form.startDate != null && { startDate: form.startDate || null }),
      ...(form.anniversaryDate != null && { anniversaryDate: form.anniversaryDate || null }),
      ...(form.note != null && { note: form.note?.trim() || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, id)));
  try { await logActivity("contract", id, "update", { fields: Object.keys(form) }); } catch {}
}

export async function deleteContract(id: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .delete(contracts)
    .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.id, id)));
  try { await logActivity("contract", id, "delete"); } catch {}
}
