"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import {
  contacts,
  opportunities,
  contracts,
  events,
  tasks,
} from "db";
import { eq, and, isNotNull, gte, or, desc, asc, inArray } from "db";
import type {
  ReferralSummary,
  ReferredContactRow,
  ReferralRequestSignal,
  ReferralRequestSignalsResult,
} from "@/lib/referral/types";
import { isReferralConverted, REFERRAL_REQUEST_SIGNAL_LABELS } from "@/lib/referral/types";
import { getContact } from "./contacts";

const WON_DEAL_DAYS = 60;
const MEETING_RECENT_DAYS = 14;
const REFERRAL_REQUEST_TASK_MONTHS = 6;
const CONTRACT_ANNIVERSARY_DAYS = 60;
const LONG_RELATIONSHIP_YEARS = 1;
const RECENT_ACTIVITY_DAYS = 90;

/** Keywords in task title that indicate a referral request task. */
const REFERRAL_TASK_KEYWORDS = ["doporučení", "referral", "doporučen"];

function taskTitleIsReferralRequest(title: string | null): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return REFERRAL_TASK_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Get referral summary for a contact: who referred them, whom they referred, counts, value.
 * Tenant-scoped; Client role only for own contactId.
 */
export async function getReferralSummaryForContact(
  contactId: string
): Promise<ReferralSummary | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  if (auth.roleName === "Client" && auth.contactId !== contactId) throw new Error("Forbidden");

  const contact = await getContact(contactId);
  if (!contact) return null;

  const tenantId = auth.tenantId;

  // Referred-by: from contact
  const referredByContactId = contact.referralContactId ?? null;
  const referredByContactName = contact.referralContactName ?? null;
  const referredBySourceText = contact.referralSource?.trim() || null;

  // Referred contacts: those who have referral_contact_id = this contact
  const referredList = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      createdAt: contacts.createdAt,
      lifecycleStage: contacts.lifecycleStage,
    })
    .from(contacts)
    .where(
      and(eq(contacts.tenantId, tenantId), eq(contacts.referralContactId, contactId))
    )
    .orderBy(desc(contacts.createdAt));

  if (referredList.length === 0) {
    return {
      referredByContactId,
      referredByContactName,
      referredBySourceText,
      givenCount: 0,
      convertedCount: 0,
      lastReferralAt: null,
      valueCzk: null,
      referredContacts: [],
    };
  }

  const referredIds = referredList.map((r) => r.id);

  // Won opportunities per contact (for converted + value)
  const wonOpps = await db
    .select({
      contactId: opportunities.contactId,
      expectedValue: opportunities.expectedValue,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.closedAs, "won"),
        isNotNull(opportunities.closedAt),
        inArray(opportunities.contactId, referredIds)
      )
    );
  const wonByContact = new Map<string, { hasWon: boolean; value: number }>();
  for (const o of wonOpps) {
    const cid = o.contactId;
    if (!cid) continue;
    const value = o.expectedValue ? Number(o.expectedValue) : 0;
    const existing = wonByContact.get(cid);
    if (existing) {
      existing.hasWon = true;
      existing.value += value;
    } else {
      wonByContact.set(cid, { hasWon: true, value });
    }
  }

  // Contracts per contact (for converted)
  const contractCounts = await db
    .select({ contactId: contracts.contactId })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, tenantId),
        inArray(contracts.contactId, referredIds)
      )
    );
  const hasContractSet = new Set(contractCounts.map((c) => c.contactId).filter(Boolean) as string[]);

  const referredContacts: ReferredContactRow[] = referredList.map((r) => {
    const hasWonOpportunity = wonByContact.get(r.id)?.hasWon ?? false;
    const hasContract = hasContractSet.has(r.id);
    const converted = isReferralConverted({
      lifecycleStage: r.lifecycleStage ?? null,
      hasWonOpportunity,
      hasContract,
    });
    const valueCzk = wonByContact.get(r.id)?.value ?? (hasContract ? null : null);
    return {
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ") || "—",
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      converted,
      valueCzk: valueCzk != null ? valueCzk : null,
    };
  });

  const convertedCount = referredContacts.filter((c) => c.converted).length;
  const lastReferralAt =
    referredList.length > 0 && referredList[0].createdAt
      ? (referredList[0].createdAt instanceof Date
          ? referredList[0].createdAt.toISOString()
          : String(referredList[0].createdAt))
      : null;
  const valueCzk = referredContacts.reduce(
    (sum, c) => sum + (c.valueCzk ?? 0),
    0
  );

  return {
    referredByContactId,
    referredByContactName,
    referredBySourceText,
    givenCount: referredList.length,
    convertedCount,
    lastReferralAt,
    valueCzk: valueCzk > 0 ? valueCzk : null,
    referredContacts,
  };
}

/**
 * Get signals for "good moment to ask for referral".
 * Returns at most one primary signal; suppressReason if we should not suggest (e.g. already asked recently).
 */
export async function getReferralRequestSignals(
  contactId: string
): Promise<ReferralRequestSignalsResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  if (auth.roleName === "Client" && auth.contactId !== contactId) throw new Error("Forbidden");

  const contact = await getContact(contactId);
  if (!contact) return { signals: [], suppressReason: "Kontakt nenalezen." };

  const tenantId = auth.tenantId;
  const now = new Date();

  // Only suggest for clients (lifecycle_stage client or has contract)
  const hasContract = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, tenantId),
        eq(contracts.contactId, contactId)
      )
    )
    .limit(1);
  const isClient =
    contact.lifecycleStage === "client" || (hasContract.length > 0);
  if (!isClient) {
    return { signals: [], suppressReason: "Signály pro žádost o referral (nový kontakt) jsou jen u klientů." };
  }

  // Recently asked: open task with referral-like title in last N months
  const cutoffTasks = new Date(now);
  cutoffTasks.setMonth(cutoffTasks.getMonth() - REFERRAL_REQUEST_TASK_MONTHS);
  const recentTasks = await db
    .select({ id: tasks.id, title: tasks.title, completedAt: tasks.completedAt, createdAt: tasks.createdAt })
    .from(tasks)
    .where(
      and(
        eq(tasks.tenantId, tenantId),
        eq(tasks.contactId, contactId),
        gte(tasks.createdAt, cutoffTasks)
      )
    );
  const hasRecentOpenReferralTask = recentTasks.some(
    (t) =>
      taskTitleIsReferralRequest(t.title) &&
      !t.completedAt
  );
  if (hasRecentOpenReferralTask) {
    return { signals: [], suppressReason: "Úkol o doporučení už existuje." };
  }

  const signals: ReferralRequestSignal[] = [];

  // 1. Won deal recent (60 days)
  const wonCutoff = new Date(now);
  wonCutoff.setDate(wonCutoff.getDate() - WON_DEAL_DAYS);
  const wonRecent = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.contactId, contactId),
        eq(opportunities.closedAs, "won"),
        isNotNull(opportunities.closedAt),
        gte(opportunities.closedAt, wonCutoff)
      )
    )
    .limit(1);
  if (wonRecent.length > 0) {
    signals.push({
      type: "won_deal_recent",
      label: REFERRAL_REQUEST_SIGNAL_LABELS.won_deal_recent,
      description: "Obchod byl nedávno uzavřen — typický čas na žádost o referral (nový kontakt).",
    });
  }

  // 2. Meeting recent (14 days)
  const meetingCutoff = new Date(now);
  meetingCutoff.setDate(meetingCutoff.getDate() - MEETING_RECENT_DAYS);
  const meetingRecent = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.contactId, contactId),
        gte(events.startAt, meetingCutoff),
        or(
          eq(events.eventType, "schuzka"),
          eq(events.eventType, "followup"),
          eq(events.eventType, "kafe")
        )
      )
    )
    .limit(1);
  if (meetingRecent.length > 0 && signals.length === 0) {
    signals.push({
      type: "meeting_recent",
      label: REFERRAL_REQUEST_SIGNAL_LABELS.meeting_recent,
      description: "Nedávná schůzka — můžete využít k žádosti o referral (nový kontakt).",
    });
  }

  // 3. Service current: last_service_date in last 6 months
  if (contact.lastServiceDate && signals.length === 0) {
    const lastService = new Date(contact.lastServiceDate);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    if (lastService >= sixMonthsAgo) {
      signals.push({
        type: "service_current",
        label: REFERRAL_REQUEST_SIGNAL_LABELS.service_current,
        description: "Servis je v pořádku — typický čas na žádost o referral (nový kontakt).",
      });
    }
  }

  // 4. Contract anniversary in next 60 days
  if (signals.length === 0 && hasContract.length > 0) {
    const anniversaries = await db
      .select({ anniversaryDate: contracts.anniversaryDate })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, tenantId),
          eq(contracts.contactId, contactId)
        )
      );
    const todayStr = now.toISOString().slice(0, 10);
    const future = new Date(now);
    future.setDate(future.getDate() + CONTRACT_ANNIVERSARY_DAYS);
    const futureStr = future.toISOString().slice(0, 10);
    const inWindow = anniversaries.some((a) => {
      const d = a.anniversaryDate;
      if (!d) return false;
      return d >= todayStr && d <= futureStr;
    });
    if (inWindow) {
      signals.push({
        type: "contract_anniversary_soon",
        label: REFERRAL_REQUEST_SIGNAL_LABELS.contract_anniversary_soon,
        description: "Blíží se výročí smlouvy — typický čas na žádost o referral (nový kontakt).",
      });
    }
  }

  // 5. Long relationship + recent activity (first contract > 1 year, event in last 90 days)
  if (signals.length === 0) {
    const firstContract = await db
      .select({ startDate: contracts.startDate })
      .from(contracts)
      .where(
        and(
          eq(contracts.tenantId, tenantId),
          eq(contracts.contactId, contactId)
        )
      )
      .orderBy(asc(contracts.startDate))
      .limit(1);
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - LONG_RELATIONSHIP_YEARS);
    const oneYearStr = oneYearAgo.toISOString().slice(0, 10);
    const hasLongRelationship =
      firstContract.length > 0 &&
      firstContract[0].startDate != null &&
      firstContract[0].startDate <= oneYearStr;

    const activityCutoff = new Date(now);
    activityCutoff.setDate(activityCutoff.getDate() - RECENT_ACTIVITY_DAYS);
    const recentEvent = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.tenantId, tenantId),
          eq(events.contactId, contactId),
          gte(events.startAt, activityCutoff)
        )
      )
      .limit(1);

    if (hasLongRelationship && recentEvent.length > 0) {
      signals.push({
        type: "long_relationship_recent_activity",
        label: REFERRAL_REQUEST_SIGNAL_LABELS.long_relationship_recent_activity,
        description: "Dlouhodobý vztah a nedávná aktivita — typický čas na žádost o referral (nový kontakt).",
      });
    }
  }

  return { signals, suppressReason: null };
}
