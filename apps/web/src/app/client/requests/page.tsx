import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { getClientRequests } from "@/app/actions/client-portal-requests";

export default async function ClientRequestsPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const requestsList = await getClientRequests();

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-monday-text">
          Moje požadavky
        </h1>
        <Link
          href="/client/requests/new"
          className="inline-flex items-center justify-center rounded-[var(--wp-radius-sm)] bg-monday-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity min-h-[44px] w-full sm:w-auto"
        >
          Mám nový požadavek
        </Link>
      </div>

      {requestsList.length === 0 ? (
        <div className="rounded-xl border border-monday-border bg-monday-surface p-6 text-center">
          <p className="text-monday-text-muted text-sm mb-2">
            Nemáte žádné aktivní požadavky.
          </p>
          <p className="text-monday-text-muted text-sm mb-4">
            Můžete zadat nový požadavek – například hypotéku, investice,
            pojištění, změnu situace nebo servis smlouvy.
          </p>
          <Link
            href="/client/requests/new"
            className="inline-flex items-center justify-center rounded-[var(--wp-radius-sm)] bg-monday-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Mám nový požadavek
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requestsList.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-monday-border bg-monday-surface p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="font-medium text-monday-text">{r.title}</span>
                <span className="rounded bg-monday-blue/10 px-2.5 py-0.5 text-xs font-medium text-monday-blue">
                  {r.statusLabel}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-monday-text-muted">
                <span>{r.caseTypeLabel}</span>
                <span>
                  Aktualizováno:{" "}
                  {new Date(r.updatedAt).toLocaleDateString("cs-CZ", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              {r.description && (
                <p className="mt-2 text-sm text-monday-text-muted border-t border-monday-border pt-2">
                  {r.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
