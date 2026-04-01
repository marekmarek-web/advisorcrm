import { MortgageCalculatorPage } from "@/app/portal/calculators/_components/mortgage/MortgageCalculatorPage";
import { requireAuth } from "@/lib/auth/require-auth";

export default async function ClientMortgageCalculatorPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  return <MortgageCalculatorPage audience="client" />;
}
