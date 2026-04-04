import { describe, it, expect } from "vitest";
import { mapAssistantHistoryRowsToClientPayload } from "@/lib/ai/assistant-history-mapper";

describe("assistant-history-mapper", () => {
  it("maps user and assistant rows with execution snapshot", () => {
    const conversation = {
      id: "conv-1",
      channel: "web_drawer",
      lockedContactId: "contact-99",
      updatedAt: new Date("2026-01-01T12:00:00Z"),
    };
    const rows = [
      {
        id: "m1",
        role: "user" as const,
        content: "Ahoj",
        createdAt: new Date("2026-01-01T12:00:01Z"),
        meta: null,
        executionPlanSnapshot: null,
      },
      {
        id: "m2",
        role: "assistant" as const,
        content: "Čus",
        createdAt: new Date("2026-01-01T12:00:02Z"),
        meta: { warnings: ["w1"] },
        executionPlanSnapshot: {
          planId: "p1",
          intentType: "general_chat",
          productDomain: null,
          contactId: null,
          opportunityId: null,
          steps: [
            {
              stepId: "s1",
              action: "createTask",
              params: {},
              label: "Úkol",
              requiresConfirmation: true,
              isReadOnly: false,
              dependsOn: [],
              status: "requires_confirmation",
              result: null,
            },
          ],
          status: "awaiting_confirmation",
          createdAt: new Date("2026-01-01T12:00:02Z"),
        },
      },
    ];
    const out = mapAssistantHistoryRowsToClientPayload(rows, conversation);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "user", content: "Ahoj", stableKey: "m1" });
    const a = out[1];
    expect(a?.kind).toBe("assistant");
    if (a?.kind === "assistant") {
      expect(a.warnings).toEqual(["w1"]);
      expect(a.executionState?.status).toBe("awaiting_confirmation");
      expect(a.contextState?.lockedClientId).toBe("contact-99");
      const prev = a.executionState?.stepPreviews?.[0];
      expect(prev?.action).toBe("Úkol");
      expect(prev?.action).not.toBe("createTask");
      // Parita s live routerem: chybějící contactId → needs_input + varování
      expect(prev?.preflightStatus).toBe("needs_input");
      expect((prev?.validationWarnings?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it("sanitizes persisted assistant content and warnings (no internal tokens in UI)", () => {
    const conversation = {
      id: "conv-1",
      channel: "web_drawer",
      lockedContactId: null,
      updatedAt: new Date(),
    };
    const leak =
      "Hotovo.\n[RESULT:createTask]{\"ok\":true}\n[TOOL:foo]\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const rows = [
      {
        id: "m1",
        role: "assistant" as const,
        content: leak,
        createdAt: new Date(),
        meta: {
          warnings: ["Chyba u klienta aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
        },
        executionPlanSnapshot: null,
      },
    ];
    const out = mapAssistantHistoryRowsToClientPayload(rows, conversation);
    const a = out[0];
    expect(a?.kind).toBe("assistant");
    if (a?.kind === "assistant") {
      expect(a.content).not.toContain("[RESULT:");
      expect(a.content).not.toContain("[TOOL:");
      expect(a.content).not.toContain("bbbbbbbb-bbbb");
      expect(a.warnings.join(" ")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    }
  });
});
