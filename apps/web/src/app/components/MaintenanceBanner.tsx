/**
 * Delta A23 — Global maintenance banner.
 *
 * Server komponenta, čte `MAINTENANCE_MODE` kill-switch z Edge Config.
 * Při aktivaci zobrazí zabudovaný banner nad portal/client layoutem. Nic nerozbije
 * uživatelskou session; slouží ke komunikaci nad rámec routing-level blockování.
 */

import { getKillSwitch } from "@/lib/ops/kill-switch";

export async function MaintenanceBanner(): Promise<JSX.Element | null> {
  const active = await getKillSwitch("MAINTENANCE_MODE", false);
  if (!active) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[9997] w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900 shadow-sm"
    >
      <span className="mr-2">⚠</span>
      Probíhá krátká údržba systému. Některé funkce mohou být dočasně nedostupné.
      Sledujte <a href="https://status.aidvisora.cz" className="underline">status.aidvisora.cz</a>.
    </div>
  );
}
