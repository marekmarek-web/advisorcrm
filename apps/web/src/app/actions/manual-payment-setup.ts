"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db, contacts, clientPaymentSetups, eq, and } from "db";

export type ManualPaymentSetupInput = {
  contactId: string;
  providerName: string;
  productName?: string;
  segment: string;
  accountNumber: string;
  iban?: string;
  variableSymbol: string;
  constantSymbol?: string;
  specificSymbol?: string;
  amount?: string;
  frequency?: string;
  firstPaymentDate?: string;
  visibleToClient: boolean;
};

export type ManualPaymentSetupResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createManualPaymentSetup(
  input: ManualPaymentSetupInput
): Promise<ManualPaymentSetupResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { ok: false, error: "Nemáte oprávnění vytvářet platební instrukce." };
  }

  const { contactId } = input;

  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, auth.tenantId)))
    .limit(1);

  if (!contact) {
    return { ok: false, error: "Kontakt nenalezen." };
  }

  const providerName = input.providerName.trim();
  if (!providerName) return { ok: false, error: "Název instituce je povinný." };

  const accountNumber = (input.iban?.trim() || input.accountNumber?.trim()) || null;
  if (!accountNumber) return { ok: false, error: "Číslo účtu nebo IBAN je povinné." };

  const variableSymbol = input.variableSymbol?.trim() || null;
  if (!variableSymbol) return { ok: false, error: "Variabilní symbol je povinný." };

  // Parse amount: strip non-numeric characters except decimal separator
  let amountValue: string | null = null;
  if (input.amount?.trim()) {
    const numeric = parseFloat(input.amount.replace(/[^\d.,]/g, "").replace(",", "."));
    if (!isNaN(numeric) && numeric > 0) {
      amountValue = String(numeric);
    }
  }

  // Determine if we store as iban field vs accountNumber/bankCode
  const ibanVal = input.iban?.trim() || null;
  let accountNumberField: string | null = null;
  let bankCodeField: string | null = null;

  if (!ibanVal && accountNumber) {
    const slashIdx = accountNumber.indexOf("/");
    if (slashIdx !== -1) {
      accountNumberField = accountNumber.substring(0, slashIdx).trim();
      bankCodeField = accountNumber.substring(slashIdx + 1).trim();
    } else {
      accountNumberField = accountNumber;
    }
  }

  const [inserted] = await db
    .insert(clientPaymentSetups)
    .values({
      tenantId: auth.tenantId,
      contactId,
      status: "active",
      paymentType: mapSegmentToPaymentType(input.segment),
      segment: input.segment,
      providerName,
      productName: input.productName?.trim() || null,
      accountNumber: accountNumberField,
      bankCode: bankCodeField,
      iban: ibanVal,
      variableSymbol,
      constantSymbol: input.constantSymbol?.trim() || null,
      specificSymbol: input.specificSymbol?.trim() || null,
      amount: amountValue,
      currency: "CZK",
      frequency: input.frequency?.trim() || null,
      firstPaymentDate: input.firstPaymentDate?.trim() || null,
      needsHumanReview: false,
      visibleToClient: input.visibleToClient,
    })
    .returning({ id: clientPaymentSetups.id });

  if (!inserted) return { ok: false, error: "Nepodařilo se uložit platební instrukci." };

  return { ok: true, id: inserted.id };
}

export async function deleteManualPaymentSetup(
  id: string,
  contactId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }

  await db
    .delete(clientPaymentSetups)
    .where(
      and(
        eq(clientPaymentSetups.id, id),
        eq(clientPaymentSetups.tenantId, auth.tenantId),
        eq(clientPaymentSetups.contactId, contactId)
      )
    );

  return { ok: true };
}

export async function updatePaymentSetupVisibility(
  id: string,
  contactId: string,
  visibleToClient: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { ok: false, error: "Nemáte oprávnění." };
  }

  await db
    .update(clientPaymentSetups)
    .set({ visibleToClient, updatedAt: new Date() })
    .where(
      and(
        eq(clientPaymentSetups.id, id),
        eq(clientPaymentSetups.tenantId, auth.tenantId),
        eq(clientPaymentSetups.contactId, contactId)
      )
    );

  return { ok: true };
}

function mapSegmentToPaymentType(
  segment: string
): "insurance" | "investment" | "pension" | "contribution" | "loan" | "other" {
  switch (segment) {
    case "ZP":
    case "MAJ":
    case "ODP":
    case "AUTO_PR":
    case "AUTO_HAV":
    case "CEST":
    case "FIRMA_POJ":
      return "insurance";
    case "INV":
    case "DIP":
      return "investment";
    case "DPS":
      return "pension";
    case "HYPO":
    case "UVER":
      return "loan";
    default:
      return "other";
  }
}
