"use client";

import { useEffect, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { AiReviewProvenanceBadge } from "@/app/components/aidvisora/AiReviewProvenanceBadge";

type PaymentSetupRow = {
  id: string;
  status: string;
  paymentType: string;
  providerName: string | null;
  productName: string | null;
  contractNumber: string | null;
  iban: string | null;
  accountNumber: string | null;
  variableSymbol: string | null;
  amount: string | null;
  currency: string | null;
  frequency: string | null;
  firstPaymentDate: string | null;
  needsHumanReview: boolean | null;
  sourceContractReviewId: string | null;
};

export function ContactPaymentSetupsSection({ contactId }: { contactId: string }) {
  const [items, setItems] = useState<PaymentSetupRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${contactId}/payment-setups`, { credentials: "include" });
        const data = (await res.json()) as { items?: PaymentSetupRow[]; error?: string };
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Nepodařilo se načíst platební údaje.");
          return;
        }
        if (!cancelled) setItems(data.items ?? []);
      } catch {
        if (!cancelled) setError("Síťová chyba při načítání platebních údajů.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (error) {
    return (
      <section
        id="contact-payment-setups"
        className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-800"
      >
        {error}
      </section>
    );
  }

  if (items === null) {
    return (
      <section
        id="contact-payment-setups"
        className="flex items-center gap-2 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 text-sm text-[color:var(--wp-text-secondary)]"
      >
        <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
        Načítám platební údaje…
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section
        id="contact-payment-setups"
        className="rounded-2xl border border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 p-4 text-sm text-[color:var(--wp-text-secondary)]"
      >
        <div className="mb-1 flex items-center gap-2 font-semibold text-[color:var(--wp-text)]">
          <CreditCard className="h-5 w-5 shrink-0 text-[color:var(--wp-text-secondary)]" aria-hidden />
          Platební údaje z dokumentů
        </div>
        <p className="leading-snug">
          Zatím zde nejsou žádné uložené platební údaje z dokumentů ani z AI Review. Klient je má v přehledu plateb v klientské zóně, jakmile je systém má k dispozici.
        </p>
      </section>
    );
  }

  return (
    <section id="contact-payment-setups" className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-[color:var(--wp-text-secondary)]" aria-hidden />
        <h2 className="text-base font-semibold text-[color:var(--wp-text)]">Platební údaje (z dokumentů)</h2>
      </div>
      <ul className="space-y-3">
        {items.map((row) => (
          <li
            key={row.id}
            className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80 p-3 text-sm text-[color:var(--wp-text)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {row.providerName ?? "Instituce neuvedena"}
                {row.productName ? ` · ${row.productName}` : ""}
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {row.status}
                {row.needsHumanReview ? " · ke kontrole" : ""}
              </span>
            </div>
            <div className="mt-2 grid gap-1 text-xs text-[color:var(--wp-text-secondary)] sm:grid-cols-2">
              {row.contractNumber ? <div>Ref. smlouvy: {row.contractNumber}</div> : null}
              {row.iban ? <div>IBAN: {row.iban}</div> : null}
              {!row.iban && row.accountNumber ? <div>Účet: {row.accountNumber}</div> : null}
              {row.variableSymbol ? <div>VS: {row.variableSymbol}</div> : null}
              {row.amount ? (
                <div>
                  Částka: {row.amount} {row.currency ?? "CZK"}
                </div>
              ) : null}
              {row.frequency ? <div>Frekvence: {row.frequency}</div> : null}
              {row.firstPaymentDate ? <div>První platba: {row.firstPaymentDate}</div> : null}
            </div>
            {row.sourceContractReviewId ? (
              <div className="mt-2">
                <AiReviewProvenanceBadge
                  kind="auto_applied"
                  reviewId={row.sourceContractReviewId}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
