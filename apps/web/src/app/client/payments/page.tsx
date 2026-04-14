import { ClientPaymentsView } from "./payments-client";
import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import {
  getPaymentInstructionsForContact,
  type PaymentInstruction,
} from "@/app/actions/payment-pdf";

export default async function ClientPaymentsPage() {
  const auth = await requireClientZoneAuth();
  if (!auth.contactId) return null;

  let paymentInstructions: PaymentInstruction[] = [];
  let paymentsLoadFailed = false;
  try {
    paymentInstructions = await getPaymentInstructionsForContact(auth.contactId);
  } catch {
    paymentsLoadFailed = true;
    paymentInstructions = [];
  }

  return (
    <ClientPaymentsView paymentInstructions={paymentInstructions} paymentsLoadFailed={paymentsLoadFailed} />
  );
}
