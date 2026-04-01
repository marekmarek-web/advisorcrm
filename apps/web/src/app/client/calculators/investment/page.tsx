import { InvestmentCalculatorPage } from "@/app/portal/calculators/_components/investment/InvestmentCalculatorPage";
import { requireAuth } from "@/lib/auth/require-auth";

export default async function ClientInvestmentCalculatorPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  return <InvestmentCalculatorPage audience="client" />;
}
