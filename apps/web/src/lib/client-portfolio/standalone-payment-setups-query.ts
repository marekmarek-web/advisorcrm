import { clientPaymentSetups } from "db";
import { and, eq, inArray } from "db";
import type { TenantContextDb } from "@/lib/db/with-tenant-context";
import type { PaymentSetupForPortfolioRow } from "@/lib/client-portfolio/payment-setup-portfolio-synth";

/**
 * Platební pokyny viditelné klientovi, které nemají odpovídající publikovanou smlouvu
 * se stejným číslem smlouvy — ty se v portfoliu/kPI započítají samostatně.
 * `contactIds` může být jeden kontakt (portfolio) nebo členové domácnosti (pokrytí).
 */
export async function selectStandalonePaymentSetupsForClientContact(
  tx: TenantContextDb,
  params: { tenantId: string; contactIds: string[]; contractNumbersWithPublishedRows: Set<string> }
): Promise<PaymentSetupForPortfolioRow[]> {
  const { tenantId, contactIds, contractNumbersWithPublishedRows } = params;
  const idCond =
    contactIds.length === 1
      ? eq(clientPaymentSetups.contactId, contactIds[0]!)
      : inArray(clientPaymentSetups.contactId, contactIds);

  const rows = await tx
    .select({
      id: clientPaymentSetups.id,
      sourceContractReviewId: clientPaymentSetups.sourceContractReviewId,
      status: clientPaymentSetups.status,
      paymentType: clientPaymentSetups.paymentType,
      providerName: clientPaymentSetups.providerName,
      productName: clientPaymentSetups.productName,
      contractNumber: clientPaymentSetups.contractNumber,
      accountNumber: clientPaymentSetups.accountNumber,
      variableSymbol: clientPaymentSetups.variableSymbol,
      paymentInstructionsText: clientPaymentSetups.paymentInstructionsText,
      amount: clientPaymentSetups.amount,
      frequency: clientPaymentSetups.frequency,
      firstPaymentDate: clientPaymentSetups.firstPaymentDate,
      segment: clientPaymentSetups.segment,
      createdAt: clientPaymentSetups.createdAt,
      updatedAt: clientPaymentSetups.updatedAt,
    })
    .from(clientPaymentSetups)
    .where(
      and(
        eq(clientPaymentSetups.tenantId, tenantId),
        idCond,
        eq(clientPaymentSetups.status, "active"),
        eq(clientPaymentSetups.visibleToClient, true)
      )
    );

  return rows.filter((p) => {
    const n = p.contractNumber?.trim();
    if (n && contractNumbersWithPublishedRows.has(n)) return false;
    return true;
  }) as PaymentSetupForPortfolioRow[];
}
