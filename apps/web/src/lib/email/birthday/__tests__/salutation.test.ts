import { describe, it, expect } from "vitest";
import {
  resolveBirthdaySalutation,
  defaultBirthdaySubject,
  defaultBirthdayBodyPlain,
  birthdayOpeningLinePlain,
} from "../salutation";

describe("birthday salutation", () => {
  it("uses safe fallback when no manual salutation", () => {
    const r = resolveBirthdaySalutation({});
    expect(r.openingLineHtml).toBe("Dobrý den,");
    expect(r.salutationShort).toBeNull();
    expect(defaultBirthdaySubject(null)).toBe("Všechno nejlepší k narozeninám");
    expect(birthdayOpeningLinePlain({})).toBe("Dobrý den,");
  });

  it("uses manual salutation and optional short for subject", () => {
    const r = resolveBirthdaySalutation({
      preferredSalutation: "pane Nováku,",
      preferredGreetingName: "pane Nováku",
    });
    expect(r.openingLineHtml).toBe("Dobrý den, pane Nováku,");
    expect(r.salutationShort).toBe("pane Nováku");
    expect(defaultBirthdaySubject("pane Nováku")).toBe("Všechno nejlepší k narozeninám, pane Nováku");
    const body = defaultBirthdayBodyPlain(birthdayOpeningLinePlain({ preferredSalutation: "pane Nováku," }));
    expect(body.startsWith("Dobrý den, pane Nováku,")).toBe(true);
  });
});
