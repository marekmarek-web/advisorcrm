/**
 * Export governance (Plan 7D.2).
 * Permission checks, PII masking, and audit trail for report exports.
 */

import type { RoleName } from "@/lib/auth/get-membership";
import type { ReportType, ReportPayload } from "./reporting-service";

const EXPORT_PERMISSIONS: Record<ReportType, RoleName[]> = {
  advisor_weekly: ["Admin", "Director", "Manager", "Advisor"],
  manager_team: ["Admin", "Director", "Manager"],
  executive_monthly: ["Admin", "Director"],
  pipeline_quality: ["Admin", "Director"],
  payment_readiness: ["Admin", "Director", "Manager"],
  assistant_adoption: ["Admin", "Director", "Manager"],
};

const PII_FIELDS = ["email", "phone", "address", "birthDate", "personalId", "bankAccount"];

export function canExport(roleName: RoleName, reportType: ReportType): boolean {
  const allowed = EXPORT_PERMISSIONS[reportType];
  return allowed ? allowed.includes(roleName) : false;
}

export function maskSensitiveFields(
  data: Record<string, unknown>,
  roleName: RoleName,
): Record<string, unknown> {
  if (roleName === "Admin" || roleName === "Director") return data;

  const masked = { ...data };
  for (const key of Object.keys(masked)) {
    if (PII_FIELDS.includes(key)) {
      masked[key] = "***";
    }
    if (typeof masked[key] === "object" && masked[key] !== null && !Array.isArray(masked[key])) {
      masked[key] = maskSensitiveFields(masked[key] as Record<string, unknown>, roleName);
    }
  }
  return masked;
}

export async function logExport(
  tenantId: string,
  userId: string,
  reportType: ReportType,
  format: "csv" | "json",
): Promise<void> {
  try {
    const { auditLog } = await import("@/lib/audit");
    await auditLog({
      tenantId,
      userId,
      action: `export:${reportType}`,
      entityType: "report",
      entityId: reportType,
      metadata: { format, exportedAt: new Date().toISOString() },
    });
  } catch { /* best-effort */ }
}

export function formatCsv(payload: ReportPayload): string {
  const lines: string[] = [];
  lines.push(`# ${payload.title}`);
  lines.push(`# Generated: ${payload.generatedAt.toISOString()}`);
  lines.push("");

  for (const section of payload.sections) {
    lines.push(`## ${section.title}`);
    const entries = Object.entries(section.data);
    if (entries.length > 0) {
      lines.push(entries.map(([k]) => k).join(","));
      lines.push(entries.map(([, v]) => String(v ?? "")).join(","));
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatJson(payload: ReportPayload): string {
  return JSON.stringify(payload, null, 2);
}
