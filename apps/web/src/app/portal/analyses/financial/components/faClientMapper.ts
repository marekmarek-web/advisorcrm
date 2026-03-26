import type { ClientInfo } from "@/lib/analyses/financial/types";
import { splitFullName, parseFaBirthDateToIso } from "@/lib/analyses/financial/faNameUtils";

export { splitFullName, parseFaBirthDateToIso } from "@/lib/analyses/financial/faNameUtils";

/** Map FA ClientInfo to createContact form fields. */
export function mapFaClientToContactForm(client: ClientInfo) {
  const { firstName, lastName } = splitFullName(client.name);
  const birthDate = parseFaBirthDateToIso(client.birthDate);

  const notes: string[] = [];
  if (client.sports?.trim()) notes.push(`Sporty: ${client.sports.trim()}`);

  return {
    firstName,
    lastName,
    email: client.email?.trim() || undefined,
    phone: client.phone?.trim() || undefined,
    title: client.occupation?.trim() || undefined,
    personalId: (client.birthNumber ?? "")?.trim() || undefined,
    birthDate: birthDate ?? undefined,
    notes: notes.length ? notes.join("\n") : undefined,
    lifecycleStage: "client",
  };
}
