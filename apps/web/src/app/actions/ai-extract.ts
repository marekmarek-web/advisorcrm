"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";

export type ExtractedContact = {
  companyName?: string;
  ico?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY není nastaven. Nastavte ho v Nastavení nebo v .env.");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Prázdná odpověď od OpenAI.");
  return content;
}

export async function extractContactsFromText(text: string): Promise<ExtractedContact[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  if (!text.trim()) return [];

  const prompt = `Z následujícího textu vyber všechny firmy/kontakty. Pro každý kontakt vrať v JSON poli objekt s poli (pouze vyplněné): companyName, ico, firstName, lastName, phone, email. IČO uváděj jen číslicemi. Vrať pouze platné JSON pole, žádný jiný text. Příklad: [{"companyName":"Firma s.r.o.","ico":"12345678","firstName":"Jan","lastName":"Novák","phone":"+420 123 456 789","email":"jan@firma.cz"}]

Text:
${text.slice(0, 12000)}`;

  const raw = await callOpenAI(prompt);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : raw;
  let arr: unknown[];
  try {
    arr = JSON.parse(jsonStr) as unknown[];
  } catch {
    throw new Error("AI vrátilo neplatný JSON. Zkuste zkrátit text.");
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
    .map((x) => ({
      companyName: typeof x.companyName === "string" ? x.companyName : undefined,
      ico: typeof x.ico === "string" ? x.ico : undefined,
      firstName: typeof x.firstName === "string" ? x.firstName : undefined,
      lastName: typeof x.lastName === "string" ? x.lastName : undefined,
      phone: typeof x.phone === "string" ? x.phone : undefined,
      email: typeof x.email === "string" ? x.email : undefined,
    }))
    .filter(
      (c) =>
        c.companyName || c.firstName || c.lastName || c.phone || c.email
    );
}

export async function hasOpenAIKey(): Promise<boolean> {
  return Boolean(process.env.OPENAI_API_KEY);
}
