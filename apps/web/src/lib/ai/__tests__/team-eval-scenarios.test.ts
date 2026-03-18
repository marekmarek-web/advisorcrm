import { describe, it, expect } from "vitest";
import { renderTeamAiPromptVariables } from "../context/team-context-render";
import { teamEvalFixtures } from "./team-eval-fixtures";

describe("Team AI eval scenarios", () => {
  it("sparse data team yields data-gap wording and no speculation", () => {
    const vars = renderTeamAiPromptVariables(teamEvalFixtures.sparseDataTeam as Parameters<typeof renderTeamAiPromptVariables>[0]);
    expect(vars.team_overview).toContain("žádná data");
    expect(vars.team_kpis).toContain("KPI nejsou k dispozici");
    expect(vars.team_members).toMatch(/Žádní členové|chybí data/);
    expect(vars.period_label).toBe("tento měsíc");
    // No motivational/psychological speculation
    expect(vars.team_overview.toLowerCase()).not.toMatch(/pravděpodobně|možná se cítí|motivac|spekulac/);
  });

  it("healthy team yields full KPI and member lines", () => {
    const vars = renderTeamAiPromptVariables(teamEvalFixtures.healthyTeam);
    expect(vars.team_overview).toContain("5");
    expect(vars.team_kpis).toContain("120");
    expect(vars.team_kpis).toContain("Jednotky");
    expect(vars.team_members).toContain("Anna");
    expect(vars.team_members).toContain("Bruno");
    expect(vars.team_alerts).toContain("Žádná aktivní upozornění");
    expect(vars.newcomer_adaptation).toContain("žádní nováčci");
  });

  it("mixed team with one risky member includes alerts and risk in context", () => {
    const vars = renderTeamAiPromptVariables(teamEvalFixtures.mixedTeamOneRisky as Parameters<typeof renderTeamAiPromptVariables>[0]);
    expect(vars.team_overview).toContain("Rizikoví");
    expect(vars.team_alerts).toContain("critical");
    expect(vars.team_alerts).toContain("Rizikový Radek");
    expect(vars.team_members).toContain("riziko: critical");
  });

  it("newcomer struggling includes adaptation checklist and warnings", () => {
    const vars = renderTeamAiPromptVariables(teamEvalFixtures.newcomerStruggling);
    expect(vars.newcomer_adaptation).toContain("Nový Honza");
    expect(vars.newcomer_adaptation).toContain("25");
    expect(vars.newcomer_adaptation).toContain("Začíná");
    expect(vars.newcomer_adaptation).toMatch(/chybí|splněno/);
    expect(vars.team_alerts).toContain("Nováček");
  });

  it("performance drop yields negative trends and goal progress", () => {
    const vars = renderTeamAiPromptVariables(teamEvalFixtures.performanceDrop as Parameters<typeof renderTeamAiPromptVariables>[0]);
    expect(vars.team_kpis).toMatch(/-25|-15/);
    expect(vars.team_kpis).toContain("42");
    expect(vars.team_members).toContain("riziko: warning");
  });

  it("all scenarios return required six prompt variables", () => {
    const required = ["team_overview", "team_kpis", "team_members", "team_alerts", "newcomer_adaptation", "period_label"];
    for (const [name, raw] of Object.entries(teamEvalFixtures)) {
      const vars = renderTeamAiPromptVariables(raw);
      for (const key of required) {
        expect(vars, `fixture ${name} missing ${key}`).toHaveProperty(key);
        expect(typeof vars[key]).toBe("string");
        expect(vars[key].length).toBeGreaterThan(0);
      }
    }
  });
});
