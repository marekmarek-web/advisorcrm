import {
  listEmailCampaignsFull,
  getSegmentCounts,
} from "@/app/actions/email-campaigns";
import { getCachedSupabaseUser, requireAuthInAction } from "@/lib/auth/require-auth";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { EmailCampaignsClient } from "./EmailCampaignsClient";

export const dynamic = "force-dynamic";

export default async function EmailCampaignsPage() {
  let rows: Awaited<ReturnType<typeof listEmailCampaignsFull>> = [];
  let segments: Awaited<ReturnType<typeof getSegmentCounts>> = [];
  let forbidden = false;
  try {
    const [r, s] = await Promise.all([listEmailCampaignsFull(), getSegmentCounts()]);
    rows = r;
    segments = s;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("oprávnění") || msg.includes("Nemáte")) forbidden = true;
    rows = [];
    segments = [];
  }

  if (forbidden) {
    return (
      <div className="p-4 md:p-6">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Tuto stránku mohou používat uživatelé s oprávněním ke kontaktům.
        </p>
      </div>
    );
  }

  const user = await getCachedSupabaseUser();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    typeof meta.full_name === "string" && meta.full_name.trim()
      ? (meta.full_name as string).trim()
      : typeof meta.name === "string" && (meta.name as string).trim()
        ? (meta.name as string).trim()
        : null;
  const fromName = fullName ?? user?.email ?? "";

  // Feature flag stavy pro gating editorových tlačítek (AI / A/B / Doporučení).
  let flags = {
    aiEnabled: false,
    abEnabled: false,
    referralsEnabled: false,
    automationsEnabled: false,
  };
  try {
    const auth = await requireAuthInAction();
    flags = {
      aiEnabled: isFeatureEnabled("email_campaigns_v2_ai", auth.tenantId),
      abEnabled: isFeatureEnabled("email_campaigns_v2_ab", auth.tenantId),
      referralsEnabled: isFeatureEnabled("email_campaigns_v2_referrals", auth.tenantId),
      automationsEnabled: isFeatureEnabled("email_campaigns_v2_automations", auth.tenantId),
    };
  } catch {
    // pokud auth selže, nech všechny flag v default off (bezpečně)
  }

  return (
    <EmailCampaignsClient
      initialRows={rows}
      initialSegments={segments}
      fromName={fromName}
      flags={flags}
    />
  );
}
