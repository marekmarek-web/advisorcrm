"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard } from "lucide-react";
import type {
  CheckoutCatalogSnapshot,
  PlanInterval,
  PlanTier,
  StripeBillingContext,
  WorkspaceBillingSnapshot,
} from "@/lib/stripe/billing-types";

type Props = {
  billing: WorkspaceBillingSnapshot | undefined;
  billingContext: StripeBillingContext;
  /** Výchozí true – v Nastavení často false (vlastní nadpis karty). */
  showTitle?: boolean;
  className?: string;
};

const TIER_COPY: Record<
  PlanTier,
  { title: string; blurb: string; monthKc: number; yearKc: number }
> = {
  starter: {
    title: "Starter",
    blurb: "1 uživatel · AI review smluv · kalkulačky",
    monthKc: 1490,
    yearKc: 14304,
  },
  pro: {
    title: "Pro",
    blurb: "Klientská zóna · finanční analýzy · pokročilé AI",
    monthKc: 1990,
    yearKc: 19104,
  },
  team: {
    title: "Team",
    blurb: "Vše z Pro · tým · sdílení · manažerské přehledy",
    monthKc: 2490,
    yearKc: 23904,
  },
};

function firstTierSupporting(
  catalog: CheckoutCatalogSnapshot,
  interval: PlanInterval
): PlanTier | null {
  for (const row of catalog.tiers) {
    if (interval === "month" && row.month) return row.tier;
    if (interval === "year" && row.year) return row.tier;
  }
  return null;
}

function tierSupports(catalog: CheckoutCatalogSnapshot, tier: PlanTier, interval: PlanInterval): boolean {
  const row = catalog.tiers.find((t) => t.tier === tier);
  if (!row) return false;
  return interval === "month" ? row.month : row.year;
}

type StripeRoutePayload = { url?: string; error?: string; detail?: string };

async function parseStripeRouteResponse(res: Response): Promise<StripeRoutePayload & { httpOk: boolean }> {
  const text = await res.text();
  if (!text.trim()) {
    return {
      httpOk: res.ok,
      error: res.ok ? undefined : `Prázdná odpověď serveru (HTTP ${res.status}).`,
    };
  }
  try {
    const data = JSON.parse(text) as StripeRoutePayload;
    return { httpOk: res.ok, url: data.url, error: data.error, detail: data.detail };
  } catch {
    return {
      httpOk: false,
      error:
        res.status >= 500
          ? "Server vrátil neočekávanou odpověď. Zkontrolujte log vývoje nebo nasazení."
          : `Neplatná odpověď serveru (HTTP ${res.status}).`,
    };
  }
}

function formatStripeClientError(data: StripeRoutePayload): string {
  const parts = [data.error, data.detail].filter((s): s is string => Boolean(s?.trim()));
  return parts.join(" — ") || "Požadavek se nepodařilo dokončit.";
}

export function WorkspaceStripeBilling({
  billing,
  billingContext,
  showTitle = true,
  className = "",
}: Props) {
  const searchParams = useSearchParams();
  const billingQuery = searchParams.get("billing");
  const [billingAction, setBillingAction] = useState<null | "checkout" | "portal">(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const cat = billing?.checkoutCatalog;
  const usePicker = Boolean(cat?.useTierPicker);

  const [interval, setInterval] = useState<PlanInterval>("month");
  const [tier, setTier] = useState<PlanTier>("pro");

  useEffect(() => {
    if (!cat || !usePicker) return;
    const t = firstTierSupporting(cat, interval);
    if (t) setTier(t);
  }, [cat, usePicker, interval]);

  useEffect(() => {
    if (!cat || !usePicker) return;
    if (!tierSupports(cat, tier, interval)) {
      const t = firstTierSupporting(cat, interval);
      if (t) setTier(t);
    }
  }, [cat, usePicker, tier, interval]);

  const canSubmitCheckout = useMemo(() => {
    if (!billing?.checkoutAvailable) return false;
    if (!cat) return false;
    if (!usePicker) return true;
    return tierSupports(cat, tier, interval);
  }, [billing?.checkoutAvailable, cat, usePicker, tier, interval]);

  if (!billing) return null;

  async function startStripeCheckout() {
    setBillingError(null);
    setBillingAction("checkout");
    try {
      const payload: Record<string, unknown> = { billingContext };
      if (usePicker) {
        payload.tier = tier;
        payload.interval = interval;
      }
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseStripeRouteResponse(res);
      if (!data.httpOk || !data.url) {
        setBillingError(formatStripeClientError(data));
        return;
      }
      window.location.href = data.url;
    } catch {
      setBillingError("Síťová chyba.");
    } finally {
      setBillingAction(null);
    }
  }

  async function openStripePortal() {
    setBillingError(null);
    setBillingAction("portal");
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingContext }),
      });
      const data = await parseStripeRouteResponse(res);
      if (!data.httpOk || !data.url) {
        setBillingError(formatStripeClientError(data));
        return;
      }
      window.location.href = data.url;
    } catch {
      setBillingError("Síťová chyba.");
    } finally {
      setBillingAction(null);
    }
  }

  const trialDays = cat?.trialPeriodDays ?? 14;

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      {showTitle ? (
        <div className="flex items-center gap-3">
          <CreditCard size={24} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
          <h3 className="text-base font-black text-[color:var(--wp-text)]">Předplatné Aidvisora</h3>
        </div>
      ) : null}
      {billingQuery === "success" ? (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          Platba proběhla. Stav předplatného se během chvile aktualizuje po potvrzení ze Stripe.
        </p>
      ) : null}
      {billingQuery === "cancel" ? (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          Checkout byl zrušen. Můžete to zkusit znovu kdykoli.
        </p>
      ) : null}
      {billingError ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{billingError}</p>
      ) : null}
      {trialDays > 0 && billing.checkoutAvailable ? (
        <p className="max-w-xl text-sm text-[color:var(--wp-text-secondary)]">
          <span className="font-semibold text-[color:var(--wp-text)]">{trialDays} dní zdarma</span>, poté pravidelné účtování
          podle zvoleného tarifu ve Stripe.
        </p>
      ) : null}
      <dl className="grid max-w-xl gap-2 text-sm text-[color:var(--wp-text-secondary)]">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-[color:var(--wp-text)]">Stav</dt>
          <dd>{billing.subscriptionStatus ?? "—"}</dd>
        </div>
        {billing.plan ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold text-[color:var(--wp-text)]">Plán</dt>
            <dd>{billing.plan}</dd>
          </div>
        ) : null}
        {billing.currentPeriodEnd ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold text-[color:var(--wp-text)]">Aktuální období do</dt>
            <dd>
              {new Date(billing.currentPeriodEnd).toLocaleDateString("cs-CZ", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </dd>
          </div>
        ) : null}
      </dl>

      {usePicker && cat ? (
        <div className="space-y-4 max-w-2xl">
          <div className="flex flex-wrap gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-1">
            <button
              type="button"
              onClick={() => setInterval("month")}
              disabled={!cat.tiers.some((r) => r.month)}
              className={`min-h-[44px] flex-1 rounded-lg px-4 text-sm font-bold transition-colors ${
                interval === "month"
                  ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm"
                  : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] disabled:opacity-40"
              }`}
            >
              Měsíčně
            </button>
            <button
              type="button"
              onClick={() => setInterval("year")}
              disabled={!cat.tiers.some((r) => r.year)}
              className={`min-h-[44px] flex-1 rounded-lg px-4 text-sm font-bold transition-colors ${
                interval === "year"
                  ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm"
                  : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] disabled:opacity-40"
              }`}
            >
              Ročně <span className="text-emerald-600 font-black">−20 %</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cat.tiers.map((row) => {
              const ok = interval === "month" ? row.month : row.year;
              const copy = TIER_COPY[row.tier];
              const kc = interval === "month" ? copy.monthKc : copy.yearKc;
              const suffix = interval === "month" ? "Kč / měs." : "Kč / rok";
              const selected = tier === row.tier && ok;
              return (
                <button
                  key={row.tier}
                  type="button"
                  disabled={!ok}
                  onClick={() => ok && setTier(row.tier)}
                  className={`min-h-[44px] rounded-2xl border p-4 text-left transition-colors ${
                    selected
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20 dark:bg-indigo-950/35 dark:ring-indigo-400/25"
                      : ok
                        ? "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] hover:border-[color:var(--wp-border-strong)]"
                        : "cursor-not-allowed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] opacity-50"
                  }`}
                >
                  <div className="font-black text-[color:var(--wp-text)]">{copy.title}</div>
                  <div className="mt-1 text-lg font-black text-indigo-600 dark:text-indigo-300">
                    {kc.toLocaleString("cs-CZ")} {suffix}
                  </div>
                  <p className="mt-2 text-xs leading-snug text-[color:var(--wp-text-secondary)]">{copy.blurb}</p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!billing.canManage ? (
        <p className="max-w-xl text-sm text-[color:var(--wp-text-secondary)]">
          Předplatné může spravovat administrátor nebo ředitel workspace.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          {billing.checkoutAvailable ? (
            <button
              type="button"
              onClick={() => void startStripeCheckout()}
              disabled={billingAction !== null || !canSubmitCheckout}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors min-h-[44px] disabled:opacity-60"
            >
              <CreditCard size={18} />
              {billingAction === "checkout" ? "Přesměrování…" : "Zahájit předplatné"}
            </button>
          ) : (
            <p className="max-w-md self-center text-sm text-[color:var(--wp-text-secondary)]">
              Nové předplatné není nakonfigurováno: nastavte{" "}
              <code className="rounded bg-[color:var(--wp-surface-muted)] px-1 text-xs text-[color:var(--wp-text)]">STRIPE_SECRET_KEY</code> a buď šest proměnných{" "}
              <code className="rounded bg-[color:var(--wp-surface-muted)] px-1 text-xs text-[color:var(--wp-text)]">STRIPE_PRICE_*_*</code>, nebo legacy{" "}
              <code className="rounded bg-[color:var(--wp-surface-muted)] px-1 text-xs text-[color:var(--wp-text)]">STRIPE_PRICE_ID</code>.
            </p>
          )}
          {billing.portalAvailable ? (
            <button
              type="button"
              onClick={() => void openStripePortal()}
              disabled={billingAction !== null}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-5 py-2.5 text-sm font-bold text-[color:var(--wp-text)] transition-colors hover:bg-[color:var(--wp-surface-card)] disabled:opacity-60"
            >
              Spravovat platby a faktury
            </button>
          ) : billing.stripeCustomerId ? null : (
            <p className="self-center text-sm text-[color:var(--wp-text-secondary)]">
              Customer Portal je dostupný po prvním dokončeném předplatném.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
