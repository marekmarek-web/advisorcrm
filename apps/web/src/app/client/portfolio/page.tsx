import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import { getClientPortfolioForContact } from "@/app/actions/contracts";
import { getClientVisiblePortfolioDocumentNames } from "@/app/actions/documents";
import { PortfolioPageContent } from "./PortfolioPageContent";

export default async function ClientPortfolioPage() {
  const auth = await requireClientZoneAuth();
  if (!auth.contactId) return null;

  const contracts = await getClientPortfolioForContact(auth.contactId);
  const sourceDocIds = [
    ...new Set(contracts.map((c) => c.sourceDocumentId).filter((id): id is string => !!id)),
  ];
  const visibleSourceDocs =
    sourceDocIds.length > 0
      ? await getClientVisiblePortfolioDocumentNames(auth.contactId, sourceDocIds)
      : {};
  return <PortfolioPageContent contracts={contracts} visibleSourceDocs={visibleSourceDocs} />;
}
