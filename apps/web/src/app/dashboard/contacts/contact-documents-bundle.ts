import { getDocumentsForContact } from "@/app/actions/documents";
import { getContractsByContact } from "@/app/actions/contracts";
import type { DocumentRow } from "@/app/actions/documents";
import type { ContractRow } from "@/app/actions/contracts";

export async function fetchContactDocumentsBundle(contactId: string): Promise<{
  docs: DocumentRow[];
  contracts: ContractRow[];
}> {
  const [docs, contracts] = await Promise.all([
    getDocumentsForContact(contactId),
    getContractsByContact(contactId),
  ]);
  return { docs, contracts };
}
