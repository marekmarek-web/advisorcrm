/**
 * H7: advisor-facing messages must never expose internal tokens, raw JSON, or raw ID lines.
 */
import { describe, it, expect } from "vitest";
import { sanitizeAssistantMessageForAdvisor } from "../assistant-message-sanitizer";

const FORBIDDEN = [
  "[RESULT:",
  "[TOOL:",
  "[requires_confirmation]",
  "[confirmed]",
  "[client:",
  "[contact:",
  "contactId:",
  "dealId:",
  "taskId:",
  '"count":',
] as const;

describe("sanitizeAssistantMessageForAdvisor (H7)", () => {
  it.each([
    {
      name: "RESULT block with JSON",
      raw: 'Text\n[RESULT:getFoo] {"a":1,"b":"x"}\nTail',
    },
    {
      name: "TOOL marker with params",
      raw: 'Ahoj [TOOL:getClientSummary {"contactId": "abc"}] konec',
    },
    {
      name: "status brackets",
      raw: "Hotovo.\n[requires_confirmation]\nDalší řádek",
    },
    {
      name: "entity ref tags",
      raw: "Klient [client:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa] je připraven.",
    },
    {
      name: "raw id lines",
      raw: "Shrnutí:\ncontactId: 11111111-1111-1111-1111-111111111111\ndone",
    },
  ])("strips $name", ({ raw }) => {
    const out = sanitizeAssistantMessageForAdvisor(raw);
    for (const token of FORBIDDEN) {
      expect(out, `must not contain ${token}`).not.toContain(token);
    }
  });

  it("preserves ordinary user-facing Czech text", () => {
    const raw = "Dobrý den, máte 3 úkoly na dnes.";
    expect(sanitizeAssistantMessageForAdvisor(raw)).toBe(raw);
  });

  it("handles empty string", () => {
    expect(sanitizeAssistantMessageForAdvisor("")).toBe("");
  });
});
