import { describe, expect, it } from "vitest";
import {
  digitsFromCzDateInput,
  formatCzDate,
  formatCzDateFromDigits,
  formatCzDateTyping,
  formatIsoDateForUiCs,
  normalizeDateForApi,
  parseCzDateToIso,
  validateCzDateComplete,
} from "../cz-date";

describe("formatCzDateFromDigits", () => {
  it("formats partial input progressively", () => {
    expect(formatCzDateFromDigits("")).toBe("");
    expect(formatCzDateFromDigits("0")).toBe("0");
    expect(formatCzDateFromDigits("04")).toBe("4");
    expect(formatCzDateFromDigits("040")).toBe("4. 0");
    expect(formatCzDateFromDigits("0405")).toBe("4. 5");
    expect(formatCzDateFromDigits("04052")).toBe("4. 5. 2");
    expect(formatCzDateFromDigits("040520")).toBe("4. 5. 20");
    expect(formatCzDateFromDigits("0405202")).toBe("4. 5. 202");
    expect(formatCzDateFromDigits("04052026")).toBe("4. 5. 2026");
  });

  it("uses smart day width (first digit >= 4 → 1 digit day)", () => {
    expect(formatCzDateFromDigits("442026")).toBe("4. 4. 2026");
    expect(formatCzDateFromDigits("452026")).toBe("4. 5. 2026");
  });

  it("uses smart month when 2-digit month would leave invalid year length", () => {
    expect(formatCzDateFromDigits("1212029")).toBe("12. 1. 2029");
  });

  it("handles full ISO-style digit run 01122026", () => {
    expect(formatCzDateFromDigits("01122026")).toBe("1. 12. 2026");
  });

  it("disambiguates 31 + year (prefer 1-digit day when 31+yyyy would swallow year)", () => {
    expect(formatCzDateFromDigits("312026")).toBe("3. 1. 2026");
  });

  it("keeps 31 when followed by more than 4 year digits context", () => {
    expect(formatCzDateFromDigits("31052026")).toBe("31. 5. 2026");
  });

  it("caps at 8 digits", () => {
    expect(formatCzDateFromDigits("040520261234")).toBe("4. 5. 2026");
  });
});

describe("digitsFromCzDateInput", () => {
  it("strips non-digits", () => {
    expect(digitsFromCzDateInput("4. 5. 2026")).toBe("452026");
  });

  it("groups by dots so 1.1 is not eleven", () => {
    expect(digitsFromCzDateInput("1.1")).toBe("11");
    expect(formatCzDateFromDigits(digitsFromCzDateInput("1.1"))).toBe("11");
    expect(formatCzDateTyping("1.1")).toBe("1. 1");
  });
});

describe("formatCzDateTyping", () => {
  it("keeps dot after day and month while typing", () => {
    expect(formatCzDateTyping("1.")).toBe("1. ");
    expect(formatCzDateTyping("1.1")).toBe("1. 1");
    expect(formatCzDateTyping("1.1.")).toBe("1. 1. ");
    expect(formatCzDateTyping("01.01.")).toBe("1. 1. ");
  });

  it("falls back to digit stream without dots", () => {
    expect(formatCzDateTyping("0405")).toBe("4. 5");
  });

  it("completes full date with dots", () => {
    expect(formatCzDateTyping("13.9.2026")).toBe("13. 9. 2026");
    expect(validateCzDateComplete(formatCzDateTyping("13.9.2026")).ok).toBe(true);
  });
});

describe("formatIsoDateForUiCs", () => {
  it("shows Czech day-first order", () => {
    expect(formatIsoDateForUiCs("2026-05-04")).toBe("4. 5. 2026");
  });

  it("uses em dash when empty or invalid (no ISO leak)", () => {
    expect(formatIsoDateForUiCs("")).toBe("—");
    expect(formatIsoDateForUiCs(null)).toBe("—");
    expect(formatIsoDateForUiCs("2026-13-40")).toBe("—");
  });
});

describe("formatCzDate / parseCzDateToIso", () => {
  it("round-trips valid dates", () => {
    expect(formatCzDate("2026-05-04")).toBe("4. 5. 2026");
    expect(parseCzDateToIso("4. 5. 2026")).toBe("2026-05-04");
    expect(parseCzDateToIso("04. 05. 2026")).toBe("2026-05-04");
  });

  it("rejects invalid calendar dates", () => {
    expect(parseCzDateToIso("31. 2. 2026")).toBeNull();
  });
});

describe("validateCzDateComplete", () => {
  it("accepts complete valid date", () => {
    expect(validateCzDateComplete("4. 5. 2026")).toEqual({ ok: true, iso: "2026-05-04" });
  });

  it("rejects incomplete or invalid", () => {
    expect(validateCzDateComplete("4. 5.").ok).toBe(false);
    expect(validateCzDateComplete("").ok).toBe(false);
  });
});

describe("normalizeDateForApi", () => {
  it("parses CZ display to ISO", () => {
    expect(normalizeDateForApi("1. 1. 2020")).toBe("2020-01-01");
  });
});
