"use server";

import { db, tasks, events } from "db";
import { eq, and, isNull, gte, lt } from "db";
import { getTasksByContactId } from "@/app/actions/tasks";
import { listEvents } from "@/app/actions/events";
import { getPipelineByContact } from "@/app/actions/pipeline";
import type { AiActionType } from "./action-suggestions";

export type DuplicateCheckResult = {
  risk: "none" | "possible" | "likely";
  existingItems: { type: string; id: string; title: string }[];
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTitleOverlap(a: string, b: string): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

export async function checkForDuplicates(
  contactId: string,
  actionType: AiActionType,
  title: string
): Promise<DuplicateCheckResult> {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    return { risk: "none", existingItems: [] };
  }

  if (actionType === "task" || actionType === "service_action") {
    const tasks = await getTasksByContactId(contactId);
    const serviceKeywords = ["servis", "revize", "vyroci", "fixace", "obnova"];
    const existingItems = tasks
      .filter((task) => !task.completedAt)
      .filter((task) => {
        if (actionType === "service_action") {
          const normalizedTaskTitle = normalizeText(task.title);
          const hasServiceKeyword = serviceKeywords.some((keyword) =>
            normalizedTaskTitle.includes(keyword)
          );
          return hasServiceKeyword && hasTitleOverlap(task.title, title);
        }
        return hasTitleOverlap(task.title, title);
      })
      .map((task) => ({ type: "task", id: task.id, title: task.title }));

    return {
      risk: existingItems.length > 0 ? "likely" : "none",
      existingItems,
    };
  }

  if (actionType === "meeting") {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    const events = await listEvents({
      contactId,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    const existingItems = events
      .filter((event) => hasTitleOverlap(event.title, title))
      .map((event) => ({ type: "event", id: event.id, title: event.title }));

    return {
      risk: existingItems.length > 0 ? "likely" : "possible",
      existingItems,
    };
  }

  const stages = await getPipelineByContact(contactId);
  const existingItems = stages
    .flatMap((stage) => stage.opportunities)
    .filter(
      (opportunity) =>
        hasTitleOverlap(opportunity.title, title) || hasTitleOverlap(opportunity.caseType, title)
    )
    .map((opportunity) => ({
      type: "opportunity",
      id: opportunity.id,
      title: opportunity.title,
    }));

  return {
    risk: existingItems.length > 0 ? "likely" : "possible",
    existingItems,
  };
}

/** Team/manager context: check duplicates for tasks or events in tenant (optional assignee), no contact. */
export async function checkTeamActionDuplicates(
  tenantId: string,
  assignedTo: string | null,
  actionType: AiActionType,
  title: string
): Promise<DuplicateCheckResult> {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return { risk: "none", existingItems: [] };

  if (actionType === "task" || actionType === "service_action") {
    const conditions = [
      eq(tasks.tenantId, tenantId),
      isNull(tasks.contactId),
      isNull(tasks.completedAt),
    ];
    if (assignedTo) conditions.push(eq(tasks.assignedTo, assignedTo));
    const rows = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(and(...conditions));
    const serviceKeywords = ["servis", "revize", "vyroci", "fixace", "obnova"];
    const existingItems = rows
      .filter((task) => {
        if (actionType === "service_action") {
          const normalizedTaskTitle = normalizeText(task.title);
          const hasServiceKeyword = serviceKeywords.some((k) => normalizedTaskTitle.includes(k));
          return hasServiceKeyword && hasTitleOverlap(task.title, title);
        }
        return hasTitleOverlap(task.title, title);
      })
      .map((task) => ({ type: "task", id: task.id, title: task.title }));

    return { risk: existingItems.length > 0 ? "likely" : "none", existingItems };
  }

  if (actionType === "meeting") {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    const conditions = [
      eq(events.tenantId, tenantId),
      isNull(events.contactId),
      gte(events.startAt, start),
      lt(events.startAt, end),
    ];
    if (assignedTo) conditions.push(eq(events.assignedTo, assignedTo));
    const rows = await db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(and(...conditions));
    const existingItems = rows
      .filter((event) => hasTitleOverlap(event.title, title))
      .map((event) => ({ type: "event", id: event.id, title: event.title }));

    return { risk: existingItems.length > 0 ? "likely" : "possible", existingItems };
  }

  return { risk: "none", existingItems: [] };
}
