import type { ContractRow } from "@/app/actions/contracts";

export const FRESHNESS_THRESHOLDS = {
  analysisOutdatedMonths: 12,
  serviceAttentionDays: 180,
  noActivityRiskDays: 120,
  fixationAlertDays: 90,
  anniversaryAlertDays: 90,
  reviewDueSoonDays: 60,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

export function getMonthsSince(date: Date | null): number | null {
  if (!date) return null;
  const now = new Date();
  let months =
    (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth());
  if (now.getDate() < date.getDate()) months -= 1;
  return Math.max(0, months);
}

export function isAnalysisOutdated(updatedAt: Date | null): boolean {
  const months = getMonthsSince(updatedAt);
  if (months == null) return true;
  return months > FRESHNESS_THRESHOLDS.analysisOutdatedMonths;
}

export function isServiceOverdue(nextServiceDue: string | null): boolean {
  const due = parseDate(nextServiceDue);
  if (!due) return false;
  return due.getTime() < new Date().getTime();
}

export function isNoContactRisk(lastServiceDate: string | null): boolean {
  const last = parseDate(lastServiceDate);
  if (!last) return true;
  return daysBetween(last, new Date()) > FRESHNESS_THRESHOLDS.serviceAttentionDays;
}

export function getDaysSince(dateInput: string | Date | null): number | null {
  const date = parseDate(dateInput);
  if (!date) return null;
  return daysBetween(date, new Date());
}

export type UpcomingContractDate = {
  segment: string;
  date: string;
  daysUntil: number;
};

export function getUpcomingDates(
  contracts: ContractRow[],
  thresholdDays: number,
  mode: "anniversary" | "fixation" = "anniversary"
): UpcomingContractDate[] {
  const now = new Date();
  const result: UpcomingContractDate[] = [];

  for (const c of contracts) {
    const baseDate =
      mode === "anniversary"
        ? parseDate(c.anniversaryDate)
        : parseDate(c.anniversaryDate);

    if (!baseDate) continue;

    const next = new Date(baseDate);
    next.setFullYear(now.getFullYear());
    if (next < now) next.setFullYear(now.getFullYear() + 1);

    const daysUntil = daysBetween(now, next);
    if (daysUntil < 0 || daysUntil > thresholdDays) continue;

    if (mode === "fixation" && c.segment !== "HYPO") continue;

    result.push({
      segment: c.segment,
      date: next.toISOString().slice(0, 10),
      daysUntil,
    });
  }

  return result.sort((a, b) => a.daysUntil - b.daysUntil);
}
