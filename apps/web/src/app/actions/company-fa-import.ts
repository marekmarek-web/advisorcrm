"use server";

import { db } from "db";
import { contacts } from "db";
import { eq, and, or, sql } from "db";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { createCompany } from "./companies";
import { getCompanyByIco } from "./companies";
import { upsertCompanyPersonLinks } from "./company-person-links";
import { createCompanyAnalysis, getCompanyAnalysis, saveCompanyAnalysisDraft, createAnalysisVersion } from "./company-financial-analyses";
import { buildCompanyFaImportPreview } from "@/lib/analyses/company-fa/importPreview";
import { validateCompanyFaImportPayload } from "@/lib/analyses/company-fa/importValidate";
import type { CompanyFaPayload, CompanyFaImportPreview, CompanyFaImportResult, CompanyFaImportOptions } from "@/lib/analyses/company-fa/types";
import { analysisImportJobs } from "db";

export type { CompanyFaImportPreview, CompanyFaImportResult };

/**
 * Validate raw JSON and return normalized payload or errors.
 */
export async function validateCompanyFaImport(raw: unknown): Promise<
  | { success: true; normalized: CompanyFaPayload }
  | { success: false; errors: string[] }
> {
  await requireAuthInAction();
  return validateCompanyFaImportPayload(raw);
}

/**
 * Build import preview: look up company by ICO, suggest contacts by director name, return preview for UI.
 */
export async function getCompanyFaImportPreview(normalizedPayload: CompanyFaPayload): Promise<CompanyFaImportPreview> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const { company, directors } = normalizedPayload;
  let suggestedCompanyId: string | null = null;
  if (company.ico?.trim()) {
    const existing = await getCompanyByIco(company.ico.trim());
    if (existing) suggestedCompanyId = existing.id;
  }

  const directorContactSuggestions: { index: number; contactId: string }[] = [];
  for (let i = 0; i < directors.length; i++) {
    const name = (directors[i]?.name ?? "").trim();
    if (!name) continue;
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          or(
            sql`${contacts.firstName} ILIKE ${`%${parts[0]}%`}`,
            sql`${contacts.lastName} ILIKE ${`%${parts[0]}%`}`
          )
        )
      )
      .limit(5);
    if (rows.length >= 1) {
      directorContactSuggestions.push({ index: i, contactId: rows[0].id });
    }
  }

  return buildCompanyFaImportPreview(normalizedPayload, {
    suggestedCompanyId,
    directorContactSuggestions,
    analysisChoice: "new",
  });
}

/**
 * Execute import: create or link company, upsert person links, create analysis or new version, log import job.
 */
export async function executeCompanyFaImport(
  normalizedPayload: CompanyFaPayload,
  options: CompanyFaImportOptions
): Promise<CompanyFaImportResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const jobPayload = {
    tenantId: auth.tenantId,
    status: "pending" as const,
    analysisId: null as string | null,
    rawPayload: normalizedPayload as unknown as Record<string, unknown>,
    errors: null as string[] | null,
    completedAt: null as Date | null,
  };

  const [jobRow] = await db.insert(analysisImportJobs).values(jobPayload).returning({ id: analysisImportJobs.id });
  const jobId = jobRow?.id;

  try {
    let companyId: string;
    if (options.createNewCompany || !options.suggestedCompanyId) {
      companyId = await createCompany({
        ico: normalizedPayload.company.ico || null,
        name: normalizedPayload.company.name || "Nová firma",
        industry: normalizedPayload.company.industry || null,
        employees: normalizedPayload.company.employees ?? null,
        cat3: normalizedPayload.company.cat3 ?? null,
        avgWage: normalizedPayload.company.avgWage ?? null,
        topClient: normalizedPayload.company.topClient ?? null,
      });
    } else {
      companyId = options.suggestedCompanyId;
    }

    const links = normalizedPayload.directors.map((d, i) => ({
      contactId: options.directorContactIds?.[i] ?? null,
      roleType: "director" as const,
      ownershipPercent: d.share ?? null,
      salaryFromCompanyMonthly: d.netIncome ?? null,
      dividendRelation: null,
      guaranteesCompanyLiabilities: false,
    }));
    await upsertCompanyPersonLinks(companyId, links);

    let analysisId: string;
    let version: number | undefined;

    if (options.linkToAnalysisId) {
      const existing = await getCompanyAnalysis(options.linkToAnalysisId);
      if (!existing) throw new Error("Analysis not found");
      analysisId = existing.id;
      version = await createAnalysisVersion(options.linkToAnalysisId, normalizedPayload);
      await saveCompanyAnalysisDraft(options.linkToAnalysisId, normalizedPayload);
    } else {
      const primaryContactId =
        normalizedPayload.directors.length > 0 && options.directorContactIds?.[0]
          ? options.directorContactIds[0]
          : null;
      analysisId = await createCompanyAnalysis({
        companyId,
        primaryContactId,
        payload: normalizedPayload,
        sourceType: "imported_json",
      });
    }

    const { extractAndUpsertSharedFactsFromCompany } = await import("./shared-facts");
    await extractAndUpsertSharedFactsFromCompany(companyId, normalizedPayload, analysisId, "json_import");

    if (jobId) {
      await db
        .update(analysisImportJobs)
        .set({
          status: "success",
          analysisId,
          errors: null,
          completedAt: new Date(),
        })
        .where(eq(analysisImportJobs.id, jobId));
    }

    return { analysisId, companyId, version };
  } catch (err) {
    const errors = err instanceof Error ? [err.message] : [String(err)];
    if (jobId) {
      await db
        .update(analysisImportJobs)
        .set({
          status: "failed",
          errors: errors as unknown as typeof analysisImportJobs.$inferInsert.errors,
          completedAt: new Date(),
        })
        .where(eq(analysisImportJobs.id, jobId));
    }
    throw new Error(errors.join("; "));
  }
}
