/**
 * Phase 3B-5: planner validation contract — missing fields vs draft / awaiting_confirmation.
 */
import { describe, it, expect } from "vitest";

import { emptyCanonicalIntent, type CanonicalIntent } from "../assistant-domain-model";
import type { EntityResolutionResult } from "../assistant-entity-resolution";
import {
  buildExecutionPlan,
  computeWriteActionMissingFields,
} from "../assistant-execution-plan";

const CONTACT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DOC_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const NOTE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function resolutionWithClient(extra: Partial<EntityResolutionResult> = {}): EntityResolutionResult {
  return {
    client: {
      entityType: "contact",
      entityId: CONTACT_ID,
      displayLabel: "Jan Test",
      confidence: 1,
      ambiguous: false,
      alternatives: [],
    },
    opportunity: null,
    document: null,
    contract: null,
    warnings: [],
    ...extra,
  };
}

function intent(partial: Partial<CanonicalIntent>) {
  return { ...emptyCanonicalIntent(), ...partial };
}

describe("computeWriteActionMissingFields", () => {
  it("scheduleCalendarEvent requires startAt or resolvedDate", () => {
    const m = computeWriteActionMissingFields("scheduleCalendarEvent", {
      contactId: CONTACT_ID,
    });
    expect(m).toContain("startAt|resolvedDate");
  });

  it("appendMeetingNote requires meetingNoteId", () => {
    const m = computeWriteActionMissingFields("appendMeetingNote", {
      contactId: CONTACT_ID,
      noteContent: "x",
    });
    expect(m).toContain("meetingNoteId");
  });

  it("classifyDocument requires documentType or classification", () => {
    const m = computeWriteActionMissingFields("classifyDocument", {
      documentId: DOC_ID,
    });
    expect(m).toContain("documentType|classification");
  });

  it("sendPortalMessage requires portalMessageBody or noteContent", () => {
    const m = computeWriteActionMissingFields("sendPortalMessage", {
      contactId: CONTACT_ID,
    });
    expect(m).toContain("portalMessageBody|noteContent");
  });

  it("updateTask requires taskId", () => {
    const m = computeWriteActionMissingFields("updateTask", {});
    expect(m).toContain("taskId");
  });
});

describe("buildExecutionPlan — missing fields → draft", () => {
  it("schedule_meeting without date stays draft", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "schedule_meeting",
        requestedActions: ["schedule_meeting"],
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("draft");
    const step = plan.steps.find((s) => s.action === "scheduleCalendarEvent");
    expect(step).toBeDefined();
    expect(computeWriteActionMissingFields(step!.action, step!.params)).toContain("startAt|resolvedDate");
  });

  it("append_note without meetingNoteId stays draft", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "append_note",
        requestedActions: ["append_note"],
        extractedFacts: [{ key: "noteContent", value: "doplněk", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("draft");
    const step = plan.steps[0];
    expect(step?.action).toBe("appendMeetingNote");
    expect(computeWriteActionMissingFields(step!.action, step!.params)).toContain("meetingNoteId");
  });

  it("classify_document with type resolves to awaiting_confirmation", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "classify_document",
        requestedActions: ["classify_document"],
        targetDocument: { ref: DOC_ID, resolved: true },
        extractedFacts: [{ key: "documentType", value: "hypoteka", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("awaiting_confirmation");
  });
});

describe("buildExecutionPlan — append_note with meetingNoteId", () => {
  it("is awaiting_confirmation when meetingNoteId present", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "append_note",
        requestedActions: ["append_note"],
        extractedFacts: [
          { key: "meetingNoteId", value: NOTE_ID, source: "user_text" },
          { key: "noteContent", value: "text", source: "user_text" },
        ],
      }),
      resolutionWithClient(),
    );
    expect(plan.status).toBe("awaiting_confirmation");
    expect(plan.steps[0]?.params.meetingNoteId).toBe(NOTE_ID);
  });
});
