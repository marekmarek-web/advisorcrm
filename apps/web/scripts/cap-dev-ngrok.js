/**
 * Sync Capacitor with dev server URL from running ngrok (for remote/cloud device).
 * Prereqs: 1) pnpm dev  2) ngrok http 3000  3) pnpm cap:dev:ngrok
 */
const http = require("http");
const { execSync } = require("child_process");
const { ensureNativeLoginUrl } = require("./capacitor-dev-url");

const NGROK_API = "http://127.0.0.1:4040/api/tunnels";

function getNgrokUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get(NGROK_API, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const tunnels = json.tunnels || [];
          const tunnel = tunnels.find(
            (t) =>
              t.public_url?.startsWith("https://") &&
              (t.config?.addr?.includes("3000") || tunnels.length === 1)
          ) || tunnels.find((t) => t.public_url?.startsWith("https://"));
          if (tunnel?.public_url) resolve(tunnel.public_url);
          else reject(new Error("Žádný ngrok tunel (spusť: ngrok http 3000)"));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", () =>
      reject(
        new Error(
          "Ngrok neběží nebo není dostupný. Spusť v jiném terminálu: ngrok http 3000"
        )
      )
    );
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Timeout – spusť ngrok http 3000"));
    });
  });
}

getNgrokUrl()
  .then((url) => {
    const serverUrl = ensureNativeLoginUrl(url);
    console.log("Ngrok URL:", serverUrl);
    console.log("Spouštím cap sync...");
    execSync("npx cap sync", {
      stdio: "inherit",
      env: { ...process.env, CAPACITOR_SERVER_URL: serverUrl },
    });
    execSync("node scripts/fix-cap-spm-app-identity-alias.mjs", { stdio: "inherit" });
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
