"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { getHouseholdForContact } from "@/app/actions/households";
import { getServiceInputData } from "@/lib/service-engine/data";
import {
  computeServiceRecommendations,
  computeServiceStatus,
} from "@/lib/service-engine/rules";
import type { ServiceRecommendation, ServiceStatus } from "@/lib/service-engine/types";
import { db } from "db";
import { contacts, contracts, tasks } from "db";
import { eq, and, isNull, sql } from "drizzle-orm";

/**
 * Get service recommendations and status for one contact. Tenant-scoped; requires contacts:read.
 */
export async function getServiceRecommendationsForContact(
  contactId: string
): Promise<{ recommendations: ServiceRecommendation[]; status: ServiceStatus }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const [inputData, household] = await Promise.all([
    getServiceInputData(auth.tenantId, contactId),
    getHouseholdForContact(contactId),
  ]);

  const householdId = household?.id ?? null;
  const recommendations = computeServiceRecommendations(
    contactId,
    householdId,
    inputData
  );
  const status = computeServiceStatus(inputData, recommendations);

  return { recommendations, status };
}

/**
 * Get service status only for one contact.
 */
export async function getServiceStatusForContact(
  contactId: string
): Promise<ServiceStatus> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const [inputData, household] = await Promise.all([
    getServiceInputData(auth.tenantId, contactId),
    getHouseholdForContact(contactId),
  ]);

  const householdId = household?.id ?? null;
  const recommendations = computeServiceRecommendations(
    contactId,
    householdId,
    inputData
  );
  return computeServiceStatus(inputData, recommendations);
}

export type ServiceRecommendationWithContact = ServiceRecommendation & {
  contactFirstName: string;
  contactLastName: string;
};

/**
 * Get top service recommendations for dashboard (overdue + due_soon). Runs engine for contacts that have service due, anniversaries, or overdue tasks. Limit to avoid heavy load.
 */
export async function getServiceRecommendationsForDashboard(
  limit: number = 15
): Promise<ServiceRecommendationWithContact[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const in7Str = in7.toISOString().slice(0, 10);
  const in60 = new Date(today);
  in60.setDate(in60.getDate() + 60);
  const in60Str = in60.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  // Contact IDs: service due (overdue or next 7 days), contract anniversary in 60 days, or overdue task
  const [serviceDueRows, anniversaryRows, overdueTaskRows] = await Promise.all([
    db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          sql`${contacts.nextServiceDue} IS NOT NULL`,
          sql`${contacts.nextServiceDue}::date <= ${in7Str}::date`
        )
      )
      .limit(30),
    db
      .select({
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contracts)
      .innerJoin(contacts, eq(contracts.contactId, contacts.id))
      .where(
        and(
          eq(contracts.tenantId, auth.tenantId),
          sql`${contracts.anniversaryDate}::date >= ${todayStr}::date`,
          sql`${contracts.anniversaryDate}::date <= ${in60Str}::date`
        )
      )
      .limit(30),
    db
      .select({
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(tasks)
      .innerJoin(contacts, eq(tasks.contactId, contacts.id))
      .where(
        and(
          eq(tasks.tenantId, auth.tenantId),
          isNull(tasks.completedAt),
          sql`${tasks.dueDate}::date < ${sevenDaysAgoStr}::date`
        )
      )
      .limit(20),
  ]);

  const contactIdSet = new Set<string>();
  const contactNames: Record<string, { firstName: string; lastName: string }> = {};
  for (const r of serviceDueRows) {
    contactIdSet.add(r.id);
    contactNames[r.id] = { firstName: r.firstName, lastName: r.lastName };
  }
  for (const r of anniversaryRows) {
    contactIdSet.add(r.contactId);
    contactNames[r.contactId] = { firstName: r.firstName, lastName: r.lastName };
  }
  for (const r of overdueTaskRows) {
    contactIdSet.add(r.contactId);
    contactNames[r.contactId] = { firstName: r.firstName, lastName: r.lastName };
  }

  const contactIds = Array.from(contactIdSet).slice(0, 25);
  const allRecs: ServiceRecommendationWithContact[] = [];

  for (const cid of contactIds) {
    const inputData = await getServiceInputData(auth.tenantId, cid);
    const household = await getHouseholdForContact(cid);
    const householdId = household?.id ?? null;
    const recs = computeServiceRecommendations(cid, householdId, inputData);
    const names = contactNames[cid] ?? { firstName: "", lastName: "" };
    for (const r of recs) {
      if (r.urgency === "overdue" || r.urgency === "due_soon") {
        allRecs.push({
          ...r,
          contactFirstName: names.firstName,
          contactLastName: names.lastName,
        });
      }
    }
  }

  allRecs.sort((a, b) => {
    const uOrder = (u: string) => (u === "overdue" ? 0 : 1);
    const c = uOrder(a.urgency) - uOrder(b.urgency);
    if (c !== 0) return c;
    const da = a.dueDate ?? "";
    const db = b.dueDate ?? "";
    return da.localeCompare(db);
  });

  return allRecs.slice(0, limit);
}
