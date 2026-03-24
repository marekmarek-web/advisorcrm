"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard } from "lucide-react";
import type { StripeBillingContext, WorkspaceBillingSnapshot } from "@/lib/stripe/billing-types";

type Props = {
  billing: WorkspaceBillingSnapshot | undefined;
  billingContext: StripeBillingContext;
  /** Výchozí true – v Nastavení často false (vlastní nadpis karty). */
  showTitle?: boolean;
  className?: string;
};

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

  if (!billing) return null;

  async function startStripeCheckout() {
    setBillingError(null);
    setBillingAction("checkout");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingContext }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setBillingError(data.error ?? "Checkout se nepodařilo spustit.");
        return;
      }
      if (data.url) window.location.href = data.url;
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
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setBillingError(data.error ?? "Portál se nepodařilo otevřít.");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setBillingError("Síťová chyba.");
    } finally {
      setBillingAction(null);
    }
  }

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      {showTitle ? (
        <div className="flex items-center gap-3">
          <CreditCard size={24} className="text-slate-400 shrink-0" />
          <h3 className="text-base font-black text-slate-900">Předplatné Aidvisora</h3>
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
      <dl className="grid gap-2 text-sm text-slate-600 max-w-xl">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-slate-700">Stav</dt>
          <dd>{billing.subscriptionStatus ?? "—"}</dd>
        </div>
        {billing.plan ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold text-slate-700">Plán (Stripe)</dt>
            <dd>{billing.plan}</dd>
          </div>
        ) : null}
        {billing.currentPeriodEnd ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold text-slate-700">Aktuální období do</dt>
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
      {!billing.canManage ? (
        <p className="text-sm text-slate-500 max-w-xl">
          Předplatné může spravovat administrátor nebo ředitel workspace.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          {billing.checkoutAvailable ? (
            <button
              type="button"
              onClick={() => void startStripeCheckout()}
              disabled={billingAction !== null}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors min-h-[44px] disabled:opacity-60"
            >
              <CreditCard size={18} />
              {billingAction === "checkout" ? "Přesměrování…" : "Zahájit předplatné"}
            </button>
          ) : (
            <p className="text-sm text-slate-500 self-center">
              Nové předplatné není na serveru nakonfigurováno (chybí STRIPE_PRICE_ID).
            </p>
          )}
          {billing.portalAvailable ? (
            <button
              type="button"
              onClick={() => void openStripePortal()}
              disabled={billingAction !== null}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-800 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors min-h-[44px] disabled:opacity-60"
            >
              Spravovat platby a faktury
            </button>
          ) : billing.stripeCustomerId ? null : (
            <p className="text-sm text-slate-500 self-center">
              Customer Portal je dostupný po prvním dokončeném předplatném.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
