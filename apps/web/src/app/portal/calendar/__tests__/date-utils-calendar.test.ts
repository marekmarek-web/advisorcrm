import { describe, expect, it } from "vitest";
import {
  addCalendarDaysYyyyMmDd,
  addMsToLocalDateTime,
  formatCalendarDateInTimeZone,
  formatDateDisplayCs,
  formatDateDisplayCsFromYyyyMmDd,
  localDateTimeInputToUtcIso,
  parseInstantFromClientPayload,
  parseLocalDateTimeInputToUtcMs,
  reminderUtcIsoFromLocalStart,
} from "../date-utils";

describe("calendar datetime-local ↔ UTC (Prague wall time)", () => {
  it("parses naive local string to same UTC ms in Node as browser local interpretation", () => {
    const ms = parseLocalDateTimeInputToUtcMs("2026-06-15T14:45");
    expect(ms).not.toBeNull();
    const d = new Date(2026, 5, 15, 14, 45, 0, 0);
    expect(ms).toBe(d.getTime());
  });

  it("localDateTimeInputToUtcIso round-trips wall time", () => {
    const iso = localDateTimeInputToUtcIso("2026-06-15T14:45");
    expect(iso).toMatch(/Z$/);
    const back = new Date(iso!);
    expect(back.getHours()).toBe(14);
    expect(back.getMinutes()).toBe(45);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(5);
    expect(back.getDate()).toBe(15);
  });

  it("parseInstantFromClientPayload treats bare datetime as local wall", () => {
    const d = parseInstantFromClientPayload("2026-06-15T14:45");
    expect(d.getHours()).toBe(14);
  });

  it("parseInstantFromClientPayload keeps Z ISO as absolute instant", () => {
    const d = parseInstantFromClientPayload("2026-06-15T12:45:00.000Z");
    expect(d.toISOString()).toBe("2026-06-15T12:45:00.000Z");
  });

  it("reminderUtcIsoFromLocalStart is minutes before local start", () => {
    const r = reminderUtcIsoFromLocalStart("2026-06-15T14:45", 15);
    const start = parseInstantFromClientPayload("2026-06-15T14:45").getTime();
    const rem = new Date(r!).getTime();
    expect(start - rem).toBe(15 * 60_000);
  });

  it("addMsToLocalDateTime uses local interpretation", () => {
    const next = addMsToLocalDateTime("2026-06-15T14:45", 30 * 60_000);
    expect(next).toBe("2026-06-15T15:15");
  });
});

describe("Czech date display helpers", () => {
  it("formatDateDisplayCs uses d. m. yyyy", () => {
    expect(formatDateDisplayCs(new Date(2026, 2, 28))).toBe("28. 3. 2026");
  });

  it("formatDateDisplayCsFromYyyyMmDd parses key to d. m. yyyy", () => {
    expect(formatDateDisplayCsFromYyyyMmDd("2026-03-28")).toBe("28. 3. 2026");
  });
});

describe("all-day Google civil dates", () => {
  it("addCalendarDaysYyyyMmDd adds one day", () => {
    expect(addCalendarDaysYyyyMmDd("2026-03-28", 1)).toBe("2026-03-29");
  });

  it("formatCalendarDateInTimeZone uses Europe/Prague for instant", () => {
    const d = new Date("2026-03-28T23:30:00.000Z");
    const civil = formatCalendarDateInTimeZone(d, "Europe/Prague");
    expect(civil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
