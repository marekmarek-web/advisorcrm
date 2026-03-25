import { describe, it, expect } from "vitest";
import {
  DR_PLAYBOOKS,
  getPlaybook,
  getPlaybookByTrigger,
  getPlaybooksForProvider,
  getPlaybookSummaries,
  getAutomatedSteps,
  getManualSteps,
  estimateRecoveryTime,
} from "../dr-playbooks";

describe("DR_PLAYBOOKS registry", () => {
  it("contains playbooks for all critical trigger types", () => {
    const triggers = DR_PLAYBOOKS.map((p) => p.trigger);
    expect(triggers).toContain("ai_service_down");
    expect(triggers).toContain("storage_unavailable");
    expect(triggers).toContain("email_delivery_failure");
    expect(triggers).toContain("security_breach");
  });

  it("all playbooks have defined steps", () => {
    DR_PLAYBOOKS.forEach((p) => {
      expect(p.steps.length).toBeGreaterThan(0);
    });
  });

  it("all playbooks have RPO and RTO defined", () => {
    DR_PLAYBOOKS.forEach((p) => {
      expect(p.recoveryObjectives.rpo).toBeTruthy();
      expect(p.recoveryObjectives.rto).toBeTruthy();
    });
  });

  it("steps have sequential order numbers", () => {
    DR_PLAYBOOKS.forEach((p) => {
      const sorted = [...p.steps].sort((a, b) => a.order - b.order);
      sorted.forEach((step, i) => {
        expect(step.order).toBe(i + 1);
      });
    });
  });
});

describe("getPlaybook", () => {
  it("returns playbook by ID", () => {
    const p = getPlaybook("pb-ai-down");
    expect(p).toBeDefined();
    expect(p!.trigger).toBe("ai_service_down");
  });

  it("returns undefined for unknown ID", () => {
    expect(getPlaybook("nonexistent")).toBeUndefined();
  });
});

describe("getPlaybookByTrigger", () => {
  it("returns correct playbook for trigger", () => {
    const p = getPlaybookByTrigger("security_breach");
    expect(p).toBeDefined();
    expect(p!.playbookId).toBe("pb-security-breach");
  });
});

describe("getPlaybooksForProvider", () => {
  it("returns playbooks affecting email", () => {
    const playbooks = getPlaybooksForProvider("email");
    expect(playbooks.length).toBeGreaterThan(0);
    playbooks.forEach((p) => expect(p.affectedProviders).toContain("email"));
  });
});

describe("getPlaybookSummaries", () => {
  it("returns summary for all playbooks", () => {
    const summaries = getPlaybookSummaries();
    expect(summaries.length).toBe(DR_PLAYBOOKS.length);
    summaries.forEach((s) => {
      expect(s.playbookId).toBeTruthy();
      expect(s.stepCount).toBeGreaterThan(0);
    });
  });
});

describe("getAutomatedSteps", () => {
  it("returns only automated steps in order", () => {
    const playbook = getPlaybook("pb-ai-down")!;
    const automated = getAutomatedSteps(playbook);
    expect(automated.every((s) => s.automated)).toBe(true);
    for (let i = 1; i < automated.length; i++) {
      expect(automated[i].order).toBeGreaterThan(automated[i - 1].order);
    }
  });
});

describe("getManualSteps", () => {
  it("returns only manual steps in order", () => {
    const playbook = getPlaybook("pb-security-breach")!;
    const manual = getManualSteps(playbook);
    expect(manual.every((s) => !s.automated)).toBe(true);
  });
});

describe("estimateRecoveryTime", () => {
  it("sums all step durations", () => {
    const playbook = getPlaybook("pb-ai-down")!;
    const expected = playbook.steps.reduce((sum, s) => sum + s.estimatedMinutes, 0);
    expect(estimateRecoveryTime("pb-ai-down")).toBe(expected);
  });

  it("returns null for unknown playbook", () => {
    expect(estimateRecoveryTime("nonexistent")).toBeNull();
  });
});
