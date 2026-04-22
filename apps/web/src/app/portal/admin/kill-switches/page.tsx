/**
 * Delta A23 — Admin overview pro Edge Config kill-switches.
 *
 * Read-only — update se dělá v Vercel Dashboardu nebo `vercel edge-config set`.
 * Stránka slouží jako jediný zdroj pravdy pro on-call: při incidentu vidí,
 * zda jsou kill-switche aktivní a které.
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { redirect } from "next/navigation";
import { ALL_FLAG_KEYS, getAllKillSwitches, type KillSwitchKey } from "@/lib/ops/kill-switch";

export const dynamic = "force-dynamic";

const FLAG_DESCRIPTIONS: Record<KillSwitchKey, string> = {
  MAINTENANCE_MODE:
    "Zobrazí globální maintenance banner ve všech layoutech. Nekompletně blokuje — pouze komunikuje.",
  AI_REVIEW_UPLOADS_DISABLED:
    "Zablokuje nahrávání nových smluv do AI review pipeline (např. při Anthropic outage).",
  DOCUMENT_UPLOADS_DISABLED:
    "Úplně vypne document upload endpointy pro advisor i klient portal.",
  PUSH_NOTIFICATIONS_DISABLED:
    "Zablokuje odesílání push notifikací přes FCM (např. při masovém misfire).",
  EMAIL_SENDING_DISABLED:
    "Vypne odesílání všech outbound mailů přes Resend (kritické — invoice, MFA, atd.).",
  STRIPE_CHECKOUT_DISABLED:
    "Vrátí 503 na /api/stripe/checkout. Existující subscriptions nejsou ovlivněny.",
  NEW_REGISTRATIONS_DISABLED: "Zablokuje registrační flow (/register).",
  CLIENT_INVITES_DISABLED: "Zablokuje vytváření klientských pozvánek (magic link).",
  AI_ASSISTANT_DISABLED: "Vypne AI asistenta v portálu (dashboard chat, plan/execute tooly).",
};

export default async function KillSwitchesAdminPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Admin") redirect("/portal/today");

  const states = await getAllKillSwitches();
  const anyActive = Object.values(states).some(Boolean);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-black tracking-tight">Kill-switches (Edge Config)</h1>
      <p className="mt-3 text-sm text-[color:var(--wp-text-secondary)]">
        Vzdálené feature flagy bez deploye. Update probíhá ve Vercel Dashboard → Storage →
        Edge Config → <code>aidvisora-ops</code>, nebo přes CLI:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
        vercel edge-config set MAINTENANCE_MODE true
        {"\n"}vercel edge-config set AI_REVIEW_UPLOADS_DISABLED false
      </pre>

      <div
        className={`mt-6 rounded-xl border p-4 text-sm font-semibold ${
          anyActive
            ? "border-rose-300 bg-rose-50 text-rose-900"
            : "border-emerald-300 bg-emerald-50 text-emerald-900"
        }`}
      >
        {anyActive
          ? "⚠ Některé kill-switche jsou aktivní — systém neběží v plné kapacitě."
          : "✓ Žádný kill-switch není aktivní. Systém běží normálně."}
      </div>

      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--wp-surface-card-border)] text-left text-xs uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
            <th className="py-2 pr-4">Klíč</th>
            <th className="py-2 pr-4">Stav</th>
            <th className="py-2">Popis</th>
          </tr>
        </thead>
        <tbody>
          {ALL_FLAG_KEYS.map((key) => (
            <tr key={key} className="border-b border-[color:var(--wp-surface-card-border)] align-top">
              <td className="py-3 pr-4 font-mono text-xs font-bold text-[color:var(--wp-text)]">{key}</td>
              <td className="py-3 pr-4">
                {states[key] ? (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-900">
                    AKTIVNÍ
                  </span>
                ) : (
                  <span className="rounded-full bg-[color:var(--wp-surface-muted)] px-2 py-0.5 text-xs font-bold text-[color:var(--wp-text-secondary)]">
                    off
                  </span>
                )}
              </td>
              <td className="py-3 text-[color:var(--wp-text-secondary)]">{FLAG_DESCRIPTIONS[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-8 text-xs text-[color:var(--wp-text-secondary)]">
        Cache: 10 s TTL. Po změně v Dashboardu se propagace do všech edge regionů projeví do
        1 minuty. Podrobnosti: <code>docs/security/edge-config-kill-switches.md</code>.
      </p>
    </div>
  );
}
