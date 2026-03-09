"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { contacts } from "db";
import { eq } from "db";

export type CsvImportResult = { imported: number; skipped: number; errors: { row: number; message: string }[] };

export type ColumnMapping = { firstName: number; lastName: number; email: number; phone: number };
export type CsvPreview = { headers: string[]; rows: string[][]; hasHeader: boolean };

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if ((c === "," && !inQuotes) || c === "\n" || c === "\r") {
      result.push(current.trim());
      current = "";
      if (c !== ",") break;
    } else current += c;
  }
  result.push(current.trim());
  return result;
}

export async function getCsvPreview(formData: FormData): Promise<CsvPreview | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const file = formData.get("file") as File | null;
  if (!file) return null;
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = (lines[0] ?? "").toLowerCase();
  const hasHeader = header.includes("jméno") || header.includes("first") || header.includes("email") || header.includes("name");
  const start = hasHeader ? 1 : 0;
  const headers = parseCsvLine(lines[0] ?? "");
  const rows: string[][] = [];
  for (let i = start; i < Math.min(start + 10, lines.length); i++) {
    rows.push(parseCsvLine(lines[i]));
  }
  return { headers, rows, hasHeader };
}

export async function importContactsCsv(
  formData: FormData,
  mapping: ColumnMapping,
  hasHeader: boolean
): Promise<CsvImportResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const file = formData.get("file") as File | null;
  if (!file) return { imported: 0, skipped: 0, errors: [{ row: 0, message: "Soubor nebyl vybrán." }] };
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const errors: { row: number; message: string }[] = [];
  let imported = 0;
  let skipped = 0;
  const start = hasHeader ? 1 : 0;
  const existingByEmail = new Set<string>();
  const existingByPhone = new Set<string>();
  const existing = await db
    .select({ email: contacts.email, phone: contacts.phone })
    .from(contacts)
    .where(eq(contacts.tenantId, auth.tenantId));
  existing.forEach((c) => {
    if (c.email) existingByEmail.add(c.email.toLowerCase());
    if (c.phone) existingByPhone.add(c.phone.replace(/\s/g, ""));
  });
  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const get = (idx: number) => (cols[idx] ?? "").trim();
    const firstName = get(mapping.firstName);
    const lastName = get(mapping.lastName);
    const email = get(mapping.email) || null;
    const phone = get(mapping.phone) || null;
    if (!firstName && !lastName) continue;
    if (!firstName || !lastName) {
      errors.push({ row: i + 1, message: "Jméno a příjmení jsou povinné." });
      continue;
    }
    const emailNorm = email?.toLowerCase();
    const phoneNorm = phone?.replace(/\s/g, "");
    if ((emailNorm && existingByEmail.has(emailNorm)) || (phoneNorm && existingByPhone.has(phoneNorm))) {
      skipped++;
      continue;
    }
    try {
      await db.insert(contacts).values({ tenantId: auth.tenantId, firstName, lastName, email, phone });
      imported++;
      if (emailNorm) existingByEmail.add(emailNorm);
      if (phoneNorm) existingByPhone.add(phoneNorm);
    } catch (e) {
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : "Chyba zápisu." });
    }
  }
  return { imported, skipped, errors };
}
