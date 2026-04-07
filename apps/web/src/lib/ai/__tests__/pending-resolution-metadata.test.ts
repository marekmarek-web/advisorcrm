/**
 * Pending image intake resolution — DB metadata parse / hydrate helpers.
 */

import { describe, it, expect } from "vitest";
import type { AssistantSession } from "@/lib/ai/assistant-session";
import {
  applyPendingImageIntakeFromConversationMetadata,
  parsePendingImageIntakeFromMetadataValue,
  PENDING_IMAGE_INTAKE_METADATA_KEY,
  isPendingImageIntakeResolutionExpired,
} from "@/lib/ai/image-intake/pending-resolution-metadata";

function basePendingRecord(createdAt: string): Record<string, unknown> {
  return {
    intakeId: "img_test_1",
    factBundle: {
      facts: [
        {
          factType: "deadline_date",
          factKey: "due",
          value: "15. 3. 2025",
          normalizedValue: null,
          confidence: 0.9,
          evidence: null,
          isActionable: true,
          needsConfirmation: false,
          observedVsInferred: "observed",
        },
      ],
      missingFields: [],
      ambiguityReasons: [],
      extractionSource: "multimodal_pass",
    },
    actionPlan: {
      outputMode: "ambiguous_needs_input",
      recommendedActions: [],
      draftReplyText: null,
      whyThisAction: "missing client",
      whyNotOtherActions: null,
      needsAdvisorInput: true,
      safetyFlags: [],
    },
    bindingState: "insufficient_binding",
    candidates: [],
    imageNameSignal: null,
    inputType: "screenshot_client_communication",
    createdAt,
  };
}

function makeSession(): AssistantSession {
  return {
    sessionId: "sess-1",
    tenantId: "t1",
    userId: "u1",
    assistantMode: "quick_assistant",
    contextLock: { assistantMode: "quick_assistant" } as AssistantSession["contextLock"],
    lastSuggestedActions: [],
    lastWarnings: [],
    messageCount: 0,
    createdAt: new Date(),
  } as AssistantSession;
}

describe("parsePendingImageIntakeFromMetadataValue", () => {
  it("returns pending for valid record", () => {
    const raw = basePendingRecord(new Date().toISOString());
    const p = parsePendingImageIntakeFromMetadataValue(raw);
    expect(p).not.toBeNull();
    expect(p!.intakeId).toBe("img_test_1");
    expect(p!.factBundle.facts).toHaveLength(1);
    expect(p!.actionPlan.outputMode).toBe("ambiguous_needs_input");
  });

  it("returns null when expired", () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const p = parsePendingImageIntakeFromMetadataValue(basePendingRecord(old));
    expect(p).toBeNull();
  });

  it("returns null for invalid fact type", () => {
    const raw = basePendingRecord(new Date().toISOString());
    (raw.factBundle as Record<string, unknown>).facts = [
      {
        factType: "not_a_real_fact_type",
        factKey: "k",
        value: "v",
        normalizedValue: null,
        confidence: 1,
        evidence: null,
        isActionable: true,
        needsConfirmation: false,
        observedVsInferred: "observed",
      },
    ];
    expect(parsePendingImageIntakeFromMetadataValue(raw)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parsePendingImageIntakeFromMetadataValue(null)).toBeNull();
    expect(parsePendingImageIntakeFromMetadataValue("x")).toBeNull();
    expect(parsePendingImageIntakeFromMetadataValue({})).toBeNull();
  });
});

describe("applyPendingImageIntakeFromConversationMetadata", () => {
  it("hydrates session when memory has no pending", () => {
    const session = makeSession();
    const meta = {
      [PENDING_IMAGE_INTAKE_METADATA_KEY]: basePendingRecord(new Date().toISOString()),
    };
    applyPendingImageIntakeFromConversationMetadata(session, meta);
    expect(session.pendingImageIntakeResolution).not.toBeNull();
    expect(session.pendingImageIntakeResolution!.intakeId).toBe("img_test_1");
  });

  it("does not overwrite existing in-memory pending", () => {
    const session = makeSession();
    const existing = parsePendingImageIntakeFromMetadataValue(basePendingRecord(new Date().toISOString()))!;
    existing.intakeId = "already_in_ram";
    session.pendingImageIntakeResolution = existing;

    const other = basePendingRecord(new Date().toISOString());
    other.intakeId = "from_db";
    applyPendingImageIntakeFromConversationMetadata(session, {
      [PENDING_IMAGE_INTAKE_METADATA_KEY]: other,
    });
    expect(session.pendingImageIntakeResolution!.intakeId).toBe("already_in_ram");
  });
});

describe("isPendingImageIntakeResolutionExpired", () => {
  it("detects stale createdAt", () => {
    const p = parsePendingImageIntakeFromMetadataValue(
      basePendingRecord(new Date().toISOString()),
    )!;
    expect(isPendingImageIntakeResolutionExpired(p)).toBe(false);
    p.createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    expect(isPendingImageIntakeResolutionExpired(p)).toBe(true);
  });
});
