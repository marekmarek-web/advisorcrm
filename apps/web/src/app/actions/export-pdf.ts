"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { contacts, households, householdMembers, opportunities, opportunityStages } from "db";
import { eq, and, isNull } from "db";

export type ClientSummary = {
  contact: { firstName: string; lastName: string; email: string | null; phone: string | null };
  householdName: string | null;
  openOpportunities: { title: string; stageName: string }[];
};

export async function getClientSummary(contactId: string): Promise<ClientSummary | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const [c] = await db.select().from(contacts).where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, contactId))).limit(1);
  if (!c) return null;

  const member = await db.select({ householdId: householdMembers.householdId, name: households.name }).from(householdMembers).innerJoin(households, eq(householdMembers.householdId, households.id)).where(eq(householdMembers.contactId, contactId)).limit(1);
  const householdName = member[0]?.name ?? null;

  const opps = await db.select({ title: opportunities.title, stageId: opportunities.stageId, name: opportunityStages.name }).from(opportunities).innerJoin(opportunityStages, eq(opportunities.stageId, opportunityStages.id)).where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.contactId, contactId), isNull(opportunities.closedAt)));
  const openOpportunities = opps.map((o) => ({ title: o.title, stageName: o.name }));

  return {
    contact: { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone },
    householdName,
    openOpportunities,
  };
}
