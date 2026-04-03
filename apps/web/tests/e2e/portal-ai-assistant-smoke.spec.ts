/**
 * Authenticated portal smoke for the floating AI assistant entry point.
 *
 * Set `E2E_ADVISOR_EMAIL` + `E2E_ADVISOR_PASSWORD` for a real advisor account to run
 * the signed-in path (`advisor-auth.setup.ts` + `chromium-advisor` project). Without them, the test is skipped.
 */
import { expect, test } from "@playwright/test";

const advisorE2E = !!(
  process.env.E2E_ADVISOR_EMAIL?.trim() && process.env.E2E_ADVISOR_PASSWORD
);

test.describe("portal AI assistant (optional auth)", () => {
  test("floating assistant button is visible on portal after advisor login", async ({ page }) => {
    if (!advisorE2E) {
      test.skip();
      return;
    }
    await page.goto("/portal/today");
    await expect(page.getByRole("button", { name: "Otevřít AI asistenta" })).toBeVisible();
  });
});
