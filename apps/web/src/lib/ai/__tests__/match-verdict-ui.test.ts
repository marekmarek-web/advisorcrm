import { describe, it, expect } from "vitest";
import { approvedPendingApplyHint, buildMatchVerdictBanner } from "../document-messages";

describe("match verdict UI helpers", () => {
  it("buildMatchVerdictBanner: existing_match uses positive tone and name", () => {
    const b = buildMatchVerdictBanner("existing_match", { topCandidateName: "Jan Novák", topScorePct: 92 });
    expect(b?.tone).toBe("success");
    expect(b?.title).toContain("Jan Novák");
    expect(b?.body.length).toBeGreaterThan(10);
  });

  it("buildMatchVerdictBanner: ambiguous_match is blocking copy", () => {
    const b = buildMatchVerdictBanner("ambiguous_match");
    expect(b?.tone).toBe("danger");
    expect(b?.title.toLowerCase()).toContain("nejednoznač");
  });

  it("approvedPendingApplyHint: existing_match + resolved describes attach to existing", () => {
    const t = approvedPendingApplyHint("existing_match", true);
    expect(t).toContain("existující");
  });
});
