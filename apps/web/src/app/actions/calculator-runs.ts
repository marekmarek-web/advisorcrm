"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { calculatorRuns, contacts } from "db";
import { eq, and, desc } from "db";

export type CalculatorRunType =
  | "mortgage"
  | "loan"
  | "investment"
  | "pension"
  | "life";

export type RecentCalculationRow = {
  id: string;
  calculatorType: CalculatorRunType;
  label: string | null;
  contactId: string | null;
  contactName: string | null;
  createdAt: string;
};

/**
 * Orientační propočty – ukládáme jen vstupy a výsledek pro vlastní archiv poradce.
 * Není to doporučení klientovi.
 */
export async function logCalculatorRun(params: {
  calculatorType: CalculatorRunType;
  label?: string | null;
  contactId?: string | null;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  let safeContactId: string | null = null;
  if (params.contactId) {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, params.contactId), eq(contacts.tenantId, auth.tenantId)))
      .limit(1);
    if (!contact) {
      throw new Error("Kontakt nepatří do vašeho workspace.");
    }
    safeContactId = contact.id;
  }

  const [row] = await db
    .insert(calculatorRuns)
    .values({
      tenantId: auth.tenantId,
      createdBy: auth.userId,
      calculatorType: params.calculatorType,
      label: params.label ?? null,
      contactId: safeContactId,
      inputs: params.inputs ?? null,
      outputs: params.outputs ?? null,
    })
    .returning({ id: calculatorRuns.id });
  return { id: row.id };
}

export async function getRecentCalculatorRuns(
  limit = 20
): Promise<RecentCalculationRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) {
    return [];
  }
  const rows = await db
    .select({
      id: calculatorRuns.id,
      calculatorType: calculatorRuns.calculatorType,
      label: calculatorRuns.label,
      contactId: calculatorRuns.contactId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      createdAt: calculatorRuns.createdAt,
    })
    .from(calculatorRuns)
    .leftJoin(contacts, eq(contacts.id, calculatorRuns.contactId))
    .where(
      and(
        eq(calculatorRuns.tenantId, auth.tenantId),
        eq(calculatorRuns.createdBy, auth.userId)
      )
    )
    .orderBy(desc(calculatorRuns.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    calculatorType: r.calculatorType as CalculatorRunType,
    label: r.label,
    contactId: r.contactId,
    contactName:
      r.firstName || r.lastName
        ? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
        : null,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}
