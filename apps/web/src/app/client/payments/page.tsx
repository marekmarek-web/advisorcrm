import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { getPaymentInstructionsForContact } from "@/app/actions/payment-pdf";
import { segmentLabel } from "@/app/lib/segment-labels";

export default async function ClientPaymentsPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const paymentInstructions = await getPaymentInstructionsForContact(
    auth.contactId
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-monday-text">
        Platební instrukce
      </h1>
      <p className="text-sm text-monday-text-muted">
        Kam a co platit – přehled podle smluv. Pravidelné platby dle smlouvy
        ověřte u poradce.
      </p>

      {paymentInstructions.length === 0 ? (
        <div className="rounded-xl border border-monday-border bg-monday-surface p-6 text-center">
          <p className="text-monday-text-muted text-sm mb-2">
            Platební údaje připravujeme. Pro detail kontaktujte poradce.
          </p>
          <Link
            href="/client/messages"
            className="inline-block text-sm text-monday-blue font-medium hover:underline"
          >
            Napsat poradci →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {paymentInstructions.map((i, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-monday-border bg-monday-surface p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block rounded-[var(--wp-radius-sm)] bg-monday-blue/10 px-2.5 py-0.5 text-xs font-medium text-monday-blue">
                  {segmentLabel(i.segment)}
                </span>
                <span className="font-medium text-monday-text">
                  {i.partnerName}
                </span>
              </div>
              <dl className="grid gap-1.5 text-sm">
                <div>
                  <dt className="text-monday-text-muted inline">Účet: </dt>
                  <dd className="inline font-mono text-monday-text">
                    {i.accountNumber}
                  </dd>
                </div>
                {i.bank && (
                  <div>
                    <dt className="text-monday-text-muted inline">Banka: </dt>
                    <dd className="inline text-monday-text">{i.bank}</dd>
                  </div>
                )}
                {i.contractNumber && (
                  <div>
                    <dt className="text-monday-text-muted inline">
                      Číslo smlouvy:{" "}
                    </dt>
                    <dd className="inline font-mono text-monday-text">
                      {i.contractNumber}
                    </dd>
                  </div>
                )}
                {i.productName && (
                  <div>
                    <dt className="text-monday-text-muted inline">Produkt: </dt>
                    <dd className="inline text-monday-text">
                      {i.productName}
                    </dd>
                  </div>
                )}
                {i.note && (
                  <div>
                    <dt className="text-monday-text-muted inline">Poznámka: </dt>
                    <dd className="inline text-monday-text">{i.note}</dd>
                  </div>
                )}
              </dl>
            </div>
          ))}
          <p className="text-xs text-monday-text-muted">
            Údaje ověřte u poradce. Pravidelné platby a termíny mohou být upřesněny
            ve smlouvě.
          </p>
        </div>
      )}
    </div>
  );
}
