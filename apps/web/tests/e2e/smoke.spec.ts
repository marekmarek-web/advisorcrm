import { test, expect } from "@playwright/test";

test.describe("public smoke", () => {
  test("home responds", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.ok() || res?.status() === 307 || res?.status() === 308).toBeTruthy();
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/prihlaseni");
    await expect(page.locator("body")).toBeVisible();
  });

  /** Backtest: OAuth UI je na /prihlaseni (WebLoginView); celý Apple tok vyžaduje živou konfiguraci Supabase + Apple. */
  test("prihlaseni exposes Google and Apple OAuth buttons", async ({ page }) => {
    await page.goto("/prihlaseni");
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Apple/i })).toBeVisible();
  });
});
