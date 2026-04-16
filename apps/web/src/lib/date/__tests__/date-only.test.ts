import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DEFAULT_TASK_DUE_DAYS_FROM_NOW,
  defaultTaskDueDateYmd,
  localCalendarDatePlusDaysYmd,
  localCalendarTodayYmd,
} from "../date-only";

describe("defaultTaskDueDateYmd", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today + DEFAULT_TASK_DUE_DAYS_FROM_NOW in local YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 16, 12, 0, 0));
    expect(localCalendarTodayYmd()).toBe("2026-04-16");
    expect(defaultTaskDueDateYmd()).toBe(localCalendarDatePlusDaysYmd(DEFAULT_TASK_DUE_DAYS_FROM_NOW));
    expect(defaultTaskDueDateYmd()).toBe("2026-04-23");
  });
});
