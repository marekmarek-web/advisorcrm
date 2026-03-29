import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_DURATION_MS,
  addMsToLocalDateTime,
  addOneCalendarDayYmd,
  allDayGoogleRangeToDbInstants,
  hasExplicitIsoOffset,
  localDateTimeInputToUtcIso,
  parseNaiveLocalDateTimeToLocalDate,
  reminderIsoBeforeStartUtc,
} from "../date-utils";

describe("DEFAULT_EVENT_DURATION_MS", () => {
  it("is 60 minutes", () => {
    expect(DEFAULT_EVENT_DURATION_MS).toBe(60 * 60 * 1000);
  });
});

describe("parseNaiveLocalDateTimeToLocalDate", () => {
  it("parses YYYY-MM-DDTHH:mm as local components", () => {
    const d = parseNaiveLocalDateTimeToLocalDate("2024-06-15T14:45");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(15);
    expect(d!.getHours()).toBe(14);
    expect(d!.getMinutes()).toBe(45);
  });

  it("rejects invalid calendar dates", () => {
    expect(parseNaiveLocalDateTimeToLocalDate("2024-02-30T12:00")).toBeNull();
  });
});

describe("localDateTimeInputToUtcIso", () => {
  it("returns Z-suffixed ISO for valid naive input", () => {
    const iso = localDateTimeInputToUtcIso("2024-06-15T12:00");
    expect(iso).toMatch(/Z$/);
    expect(iso).toBeDefined();
    const back = new Date(iso!);
    expect(back.getUTCHours()).toBeDefined();
  });
});

describe("addMsToLocalDateTime", () => {
  it("adds 30 minutes in local space", () => {
    const next = addMsToLocalDateTime("2024-06-15T14:00", 30 * 60 * 1000);
    expect(next).toBe("2024-06-15T14:30");
  });
});

describe("hasExplicitIsoOffset", () => {
  it("accepts Z and numeric offsets", () => {
    expect(hasExplicitIsoOffset("2024-01-01T12:00:00.000Z")).toBe(true);
    expect(hasExplicitIsoOffset("2024-01-01T12:00:00+01:00")).toBe(true);
    expect(hasExplicitIsoOffset("2024-01-01T12:00:00-0500")).toBe(true);
  });
  it("rejects naive ISO", () => {
    expect(hasExplicitIsoOffset("2024-01-01T12:00:00")).toBe(false);
    expect(hasExplicitIsoOffset("2024-01-01T12:00")).toBe(false);
  });
});

describe("addOneCalendarDayYmd", () => {
  it("advances one day", () => {
    expect(addOneCalendarDayYmd("2024-01-15")).toBe("2024-01-16");
    expect(addOneCalendarDayYmd("2024-12-31")).toBe("2025-01-01");
  });
  it("returns null for bad input", () => {
    expect(addOneCalendarDayYmd("nope")).toBeNull();
  });
});

describe("allDayGoogleRangeToDbInstants", () => {
  it("maps single-day Google range (exclusive end) to noon anchors", () => {
    const r = allDayGoogleRangeToDbInstants("2024-01-15", "2024-01-16");
    expect(r).not.toBeNull();
    expect(r!.startAt.toISOString()).toBe("2024-01-15T12:00:00.000Z");
    expect(r!.endAt.toISOString()).toBe("2024-01-15T12:00:00.000Z");
  });
  it("maps multi-day inclusive range", () => {
    const r = allDayGoogleRangeToDbInstants("2024-01-15", "2024-01-18");
    expect(r!.endAt.toISOString()).toBe("2024-01-17T12:00:00.000Z");
  });
});

describe("reminderIsoBeforeStartUtc", () => {
  it("subtracts minutes from UTC instant", () => {
    const r = reminderIsoBeforeStartUtc("2024-06-15T10:30:00.000Z", 15);
    expect(r).toBe("2024-06-15T10:15:00.000Z");
  });
  it("returns undefined when minutes is 0", () => {
    expect(reminderIsoBeforeStartUtc("2024-06-15T10:30:00.000Z", 0)).toBeUndefined();
  });
});
