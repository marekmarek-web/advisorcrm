import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { db, contacts, clientPaymentSetups, eq, and, desc } from "db";
import { resolvePaymentSetupClientVisibility } from "@/lib/ai/payment-publish-bridge";

/**
 * Phase 3E — Payment publish bridge: see `resolvePaymentSetupClientVisibility` in payment-publish-bridge.ts.
 */

export const dynamic = "force-dynamic";

/**
 * Plan 3 §11.5 — list payment setups for a contact (advisor workspace).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const { contactId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getMembership(user.id);
  if (!membership || !hasPermission(membership.roleName as RoleName, "contacts:read")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, membership.tenantId)))
    .limit(1);

  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  const rows = await db
    .select({
      id: clientPaymentSetups.id,
      status: clientPaymentSetups.status,
      paymentType: clientPaymentSetups.paymentType,
      providerName: clientPaymentSetups.providerName,
      productName: clientPaymentSetups.productName,
      contractNumber: clientPaymentSetups.contractNumber,
      beneficiaryName: clientPaymentSetups.beneficiaryName,
      accountNumber: clientPaymentSetups.accountNumber,
      bankCode: clientPaymentSetups.bankCode,
      iban: clientPaymentSetups.iban,
      bic: clientPaymentSetups.bic,
      variableSymbol: clientPaymentSetups.variableSymbol,
      specificSymbol: clientPaymentSetups.specificSymbol,
      constantSymbol: clientPaymentSetups.constantSymbol,
      amount: clientPaymentSetups.amount,
      currency: clientPaymentSetups.currency,
      frequency: clientPaymentSetups.frequency,
      firstPaymentDate: clientPaymentSetups.firstPaymentDate,
      dueDayOfMonth: clientPaymentSetups.dueDayOfMonth,
      paymentInstructionsText: clientPaymentSetups.paymentInstructionsText,
      confidence: clientPaymentSetups.confidence,
      needsHumanReview: clientPaymentSetups.needsHumanReview,
      sourceContractReviewId: clientPaymentSetups.sourceContractReviewId,
      createdAt: clientPaymentSetups.createdAt,
      updatedAt: clientPaymentSetups.updatedAt,
    })
    .from(clientPaymentSetups)
    .where(
      and(eq(clientPaymentSetups.tenantId, membership.tenantId), eq(clientPaymentSetups.contactId, contactId))
    )
    .orderBy(desc(clientPaymentSetups.createdAt));

  const items = rows.map((r) => ({
    ...r,
    /** Phase 3E: explicit client visibility tier. Phase 5 will use this to decide portal exposure. */
    clientVisibility: resolvePaymentSetupClientVisibility(r.status),
  }));

  return NextResponse.json({ items });
}
