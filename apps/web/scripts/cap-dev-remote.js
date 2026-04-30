/**
 * Sync Capacitor with dev server URL = this machine's LAN IP (for remote device / cloud emulator).
 * Usage: pnpm cap:dev:remote   (from apps/web)
 */
const os = require("os");
const { execSync } = require("child_process");
const { ensureNativeLoginUrl } = require("./capacitor-dev-url");

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

const ip = getLocalIp();
const url = ensureNativeLoginUrl(`http://${ip}:3000`);
console.log("Using CAPACITOR_SERVER_URL =", url);
execSync("npx cap sync", {
  stdio: "inherit",
  env: { ...process.env, CAPACITOR_SERVER_URL: url },
});
execSync("node scripts/fix-cap-spm-app-identity-alias.mjs", { stdio: "inherit" });
