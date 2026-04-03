import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

/** GitHub Actions: `next dev` is slow and can hit the 180s boot timeout; use production server after `pnpm build`. */
const ci = !!process.env.CI;
const webServerCommand = ci ? "pnpm start" : "pnpm dev";

const advisorE2E = !!(
  process.env.E2E_ADVISOR_EMAIL?.trim() && process.env.E2E_ADVISOR_PASSWORD
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: advisorE2E
        ? /portal-ai-assistant-smoke\.spec\.ts$|advisor-auth\.setup\.ts$/
        : undefined,
      use: { ...devices["Desktop Chrome"] },
    },
    ...(advisorE2E
      ? [
          {
            name: "setup",
            testMatch: /advisor-auth\.setup\.ts$/,
          },
          {
            name: "chromium-advisor",
            dependencies: ["setup"],
            testMatch: /portal-ai-assistant-smoke\.spec\.ts$/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: "playwright/.auth/advisor.json",
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !ci,
    timeout: ci ? 120_000 : 180_000,
  },
});
