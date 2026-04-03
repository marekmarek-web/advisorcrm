/**
 * Saves `playwright/.auth/advisor.json` for advisor E2E.
 * Only used when `E2E_ADVISOR_EMAIL` + `E2E_ADVISOR_PASSWORD` are set (see `playwright.config.ts` projects).
 */
import fs from "fs";
import path from "path";

import { test as setup } from "@playwright/test";

setup("advisor login → storage state", async ({ page }) => {
  const email = process.env.E2E_ADVISOR_EMAIL!.trim();
  const password = process.env.E2E_ADVISOR_PASSWORD!;

  const storageDir = path.join(process.cwd(), "playwright", ".auth");
  fs.mkdirSync(storageDir, { recursive: true });
  const storagePath = path.join(storageDir, "advisor.json");

  await page.goto("/prihlaseni", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: "Poradce" }).click({ timeout: 5000 }).catch(() => {});
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await page.waitForURL(/\/portal/, { timeout: 90_000 });
  await page.context().storageState({ path: storagePath });
});
