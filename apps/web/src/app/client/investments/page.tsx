import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { getClientFinancialSummaryForContact } from "@/app/actions/client-financial-summary";

function formatMoney(value: number): string {
  return value.toLocaleString("cs-CZ", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default async function ClientInvestmentsPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const summary = await getClientFinancialSummaryForContact(auth.contactId);
  const hasData = summary.status === "completed" || summary.status === "exported";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-monday-text">
        Investice a finanční přehled
      </h1>

      {!hasData ? (
        <div className="rounded-xl border border-monday-border bg-monday-surface p-6 text-center">
          <p className="text-monday-text-muted text-sm mb-2">
            Připravujeme váš přehled. Finanční přehled zatím není k dispozici.
          </p>
          <p className="text-monday-text-muted text-sm mb-4">
            Máte dotaz? Napište poradci a domluvte si schůzku.
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
          {summary.updatedAt && (
            <p className="text-sm text-monday-text-muted">
              Stav k{" "}
              {new Date(summary.updatedAt).toLocaleDateString("cs-CZ", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              . Údaje ověřte u poradce.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-monday-border bg-monday-surface p-4">
              <h2 className="text-sm font-medium text-monday-text-muted mb-1">
                Aktiva
              </h2>
              <p className="text-lg font-semibold text-monday-text">
                {formatMoney(summary.assets)} Kč
              </p>
            </div>
            <div className="rounded-xl border border-monday-border bg-monday-surface p-4">
              <h2 className="text-sm font-medium text-monday-text-muted mb-1">
                Závazky
              </h2>
              <p className="text-lg font-semibold text-monday-text">
                {formatMoney(summary.liabilities)} Kč
              </p>
            </div>
            <div className="rounded-xl border border-monday-border bg-monday-surface p-4">
              <h2 className="text-sm font-medium text-monday-text-muted mb-1">
                Čisté jmění
              </h2>
              <p className="text-lg font-semibold text-monday-text">
                {formatMoney(summary.netWorth)} Kč
              </p>
            </div>
            <div className="rounded-xl border border-monday-border bg-monday-surface p-4">
              <h2 className="text-sm font-medium text-monday-text-muted mb-1">
                Rezerva
              </h2>
              <p className="text-lg font-semibold text-monday-text">
                {summary.reserveOk ? "V pořádku" : `Chybí ${formatMoney(summary.reserveGap)} Kč`}
              </p>
            </div>
          </div>

          {summary.priorities.length > 0 && (
            <div className="rounded-xl border border-monday-border bg-monday-surface p-4">
              <h2 className="text-sm font-medium text-monday-text-muted mb-2">
                Prioritní cíle
              </h2>
              <ul className="list-disc list-inside text-sm text-monday-text space-y-1">
                {summary.priorities.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.gaps.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <h2 className="text-sm font-medium text-amber-800 mb-2">
                Doporučení
              </h2>
              <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
                {summary.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
              <Link
                href="/client/messages"
                className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline"
              >
                Konzultovat s poradcem →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
