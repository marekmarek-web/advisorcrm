"use server";

import * as XLSX from "xlsx";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import type { TenantContextDb } from "@/lib/db/with-tenant-context";
import { contacts } from "db";
import { eq } from "db";
import type { ContactRowInput, ColumnMapping } from "@/lib/contacts/import-types";
import { mapColumnsToContact } from "@/lib/contacts/map-columns-to-contact";

export type CsvImportResult = { imported: number; skipped: number; errors: { row: number; message: string }[] };

export type CsvPreview = {
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
  totalRows?: number;
  sheetNames?: string[];
  activeSheet?: string;
};

/** Shared insert logic: duplicate check by email/phone, then insert. Used by CSV, Excel and AI (PDF) flows. */
async function importContactRows(
  tx: TenantContextDb,
  rows: ContactRowInput[],
  tenantId: string,
): Promise<CsvImportResult> {
  const errors: { row: number; message: string }[] = [];
  let imported = 0;
  let skipped = 0;
  const existingByEmail = new Set<string>();
  const existingByPhone = new Set<string>();
  const existing = await tx
    .select({ email: contacts.email, phone: contacts.phone })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId));
  existing.forEach((c) => {
    if (c.email) existingByEmail.add(c.email.toLowerCase());
    if (c.phone) existingByPhone.add(c.phone.replace(/\s/g, ""));
  });
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const firstName = (r.firstName ?? "").trim();
    const lastName = (r.lastName ?? "").trim();
    const email = (r.email ?? "").trim() || null;
    const phone = (r.phone ?? "").trim() || null;
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
      await tx.insert(contacts).values({
        tenantId,
        firstName,
        lastName,
        email,
        phone,
        lifecycleStage: r.lifecycleStage ?? null,
        tags: r.tags?.length ? r.tags : null,
        notes: r.notes ?? null,
        leadSource: "import",
      });
      imported++;
      if (emailNorm) existingByEmail.add(emailNorm);
      if (phoneNorm) existingByPhone.add(phoneNorm);
    } catch (e) {
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : "Chyba zápisu." });
    }
  }
  return { imported, skipped, errors };
}

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
  let text = await file.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = (lines[0] ?? "").toLowerCase();
  const hasHeader =
    header.includes("jméno") ||
    header.includes("first") ||
    header.includes("email") ||
    header.includes("name");
  const start = hasHeader ? 1 : 0;
  const headers = parseCsvLine(lines[0] ?? "");
  const rows: string[][] = [];
  for (let i = start; i < Math.min(start + 10, lines.length); i++) {
    rows.push(parseCsvLine(lines[i]));
  }
  const totalRows = lines.length - start;
  return { headers, rows, hasHeader, totalRows };
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
  let text = await file.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const start = hasHeader ? 1 : 0;
  const rows: ContactRowInput[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    rows.push(mapColumnsToContact(cols, mapping));
  }
  return withTenantContextFromAuth(auth, (tx) => importContactRows(tx, rows, auth.tenantId));
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return String(v).trim();
}

function resolveSheetName(wb: XLSX.WorkBook, requested: unknown): string {
  const names = wb.SheetNames;
  if (!names.length) return "";
  if (typeof requested === "string" && requested.length > 0 && names.includes(requested)) {
    return requested;
  }
  return names[0] ?? "";
}

export async function getSpreadsheetPreview(formData: FormData): Promise<CsvPreview | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const file = formData.get("file") as File | null;
  if (!file) return null;
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = resolveSheetName(wb, formData.get("sheetName"));
  if (!sheetName) return null;
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (!raw.length) return null;
  const toRow = (row: unknown[]): string[] => row.map((c) => cellToString(c));
  const headers = toRow(raw[0] as unknown[]);
  const dataRows = raw.slice(1).filter((row) => row.some((c) => cellToString(c as unknown) !== ""));
  const totalRows = dataRows.length;
  const rows = dataRows.slice(0, 10).map((r) => toRow(r as unknown[]));
  return {
    headers,
    rows,
    hasHeader: true,
    totalRows,
    sheetNames: wb.SheetNames,
    activeSheet: sheetName,
  };
}

export async function importContactsFromSpreadsheet(formData: FormData, mapping: ColumnMapping): Promise<CsvImportResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const file = formData.get("file") as File | null;
  if (!file) return { imported: 0, skipped: 0, errors: [{ row: 0, message: "Soubor nebyl vybrán." }] };
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = resolveSheetName(wb, formData.get("sheetName"));
  if (!sheetName) return { imported: 0, skipped: 0, errors: [{ row: 0, message: "Prázdný sešit." }] };
  const ws = wb.Sheets[sheetName];
  if (!ws) return { imported: 0, skipped: 0, errors: [{ row: 0, message: "List nebyl nalezen." }] };
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (raw.length < 2) return { imported: 0, skipped: 0, errors: [] };
  const toRow = (row: unknown[]): string[] => row.map((c) => cellToString(c));
  const dataRows = raw.slice(1).filter((row) => row.some((c) => cellToString(c as unknown) !== ""));
  const rows: ContactRowInput[] = dataRows.map((r) => {
    const cols = toRow(r as unknown[]);
    return mapColumnsToContact(cols, mapping);
  });
  return withTenantContextFromAuth(auth, (tx) => importContactRows(tx, rows, auth.tenantId));
}
