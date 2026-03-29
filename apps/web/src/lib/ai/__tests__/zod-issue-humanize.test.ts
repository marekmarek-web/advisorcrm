import { describe, expect, it } from "vitest";
import { summarizeZodIssuesForAdvisor } from "../zod-issue-humanize";

describe("summarizeZodIssuesForAdvisor", () => {
  it("returns default when empty", () => {
    expect(summarizeZodIssuesForAdvisor([])).toMatch(/Struktura odpovědi AI/);
  });

  it("describes invalid enum without echoing raw expected values in primary line", () => {
    const msg = summarizeZodIssuesForAdvisor([
      {
        code: "invalid_value",
        path: ["documentClassification", "lifecycleStatus"],
        message: "Invalid option: expected one of \"final_contract\"|\"proposal\"",
      } as import("zod").ZodIssue,
    ]);
    expect(msg).toMatch(/lifecycleStatus/);
    expect(msg).toMatch(/povolených variant/);
  });
});
