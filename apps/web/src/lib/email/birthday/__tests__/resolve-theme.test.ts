import { describe, it, expect, vi, beforeEach } from "vitest";

const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn<() => boolean>() }));

vi.mock("fs", () => ({
  existsSync: existsSyncMock,
}));

import { resolveEffectiveBirthdayTheme } from "../resolve-theme";

describe("resolveEffectiveBirthdayTheme", () => {
  beforeEach(() => {
    existsSyncMock.mockReturnValue(false);
  });

  it("falls back to premium_dark when gif requested but file missing", () => {
    const r = resolveEffectiveBirthdayTheme("birthday_gif");
    expect(r.theme).toBe("premium_dark");
    expect(r.asset).toBeNull();
  });

  it("uses birthday_gif when file exists", () => {
    existsSyncMock.mockReturnValue(true);
    const r = resolveEffectiveBirthdayTheme("birthday_gif");
    expect(r.theme).toBe("birthday_gif");
    expect(r.asset).toBe("/birthday-freepik.png");
  });

  it("keeps premium_dark", () => {
    existsSyncMock.mockReturnValue(true);
    const r = resolveEffectiveBirthdayTheme("premium_dark");
    expect(r.theme).toBe("premium_dark");
    expect(r.asset).toBeNull();
  });
});
