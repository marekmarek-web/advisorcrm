"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { createResponse } from "@/lib/openai";
import { validateContactExtraction } from "@/lib/ai/extraction-schemas";

export type ExtractedContact = {
  companyName?: string;
  ico?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

export async function extractContactsFromText(text: string): Promise<ExtractedContact[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  if (!text.trim()) return [];

  const prompt = `Z následujícího textu vyber všechny firmy/kontakty. Pro každý kontakt vrať v JSON poli objekt s poli (pouze vyplněné): companyName, ico, firstName, lastName, phone, email. IČO uváděj jen číslicemi. Vrať pouze platné JSON pole, žádný jiný text. Příklad: [{"companyName":"Firma s.r.o.","ico":"12345678","firstName":"Jan","lastName":"Novák","phone":"+420 123 456 789","email":"jan@firma.cz"}]

Text:
${text.slice(0, 12000)}`;

  const raw = await createResponse(prompt);
  const validated = validateContactExtraction(raw);
  if (!validated.ok) {
    throw new Error(validated.error.message);
  }
  return validated.data;
}

export async function hasOpenAIKey(): Promise<boolean> {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
