import { requireAuth } from "@/lib/auth/require-auth";
import { getContractsByContact } from "@/app/actions/contracts";
import { segmentLabel } from "@/app/lib/segment-labels";

export default async function ClientContractsPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const contractsList = await getContractsByContact(auth.contactId);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-monday-text">Moje smlouvy</h1>

      {contractsList.length === 0 ? (
        <div className="rounded-[var(--wp-radius-sm)] border border-monday-border bg-monday-surface p-6 text-center">
          <p className="text-monday-text-muted text-sm">Žádné smlouvy.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contractsList.map((c) => (
            <div
              key={c.id}
              className="rounded-[var(--wp-radius-sm)] border border-monday-border bg-monday-surface p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block rounded-[var(--wp-radius-sm)] bg-monday-blue/10 px-2.5 py-0.5 text-xs font-medium text-monday-blue">
                  {segmentLabel(c.segment)}
                </span>
                {c.partnerName && (
                  <span className="text-sm font-medium text-monday-text">{c.partnerName}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {c.productName && (
                  <div>
                    <span className="text-monday-text-muted">Produkt:</span>{" "}
                    <span className="text-monday-text">{c.productName}</span>
                  </div>
                )}
                {c.premiumAmount && (
                  <div>
                    <span className="text-monday-text-muted">Pojistné:</span>{" "}
                    <span className="text-monday-text">
                      {Number(c.premiumAmount).toLocaleString("cs-CZ")} Kč
                    </span>
                  </div>
                )}
                {c.contractNumber && (
                  <div>
                    <span className="text-monday-text-muted">Číslo smlouvy:</span>{" "}
                    <span className="text-monday-text font-mono">{c.contractNumber}</span>
                  </div>
                )}
                {c.startDate && (
                  <div>
                    <span className="text-monday-text-muted">Začátek:</span>{" "}
                    <span className="text-monday-text">
                      {new Date(c.startDate).toLocaleDateString("cs-CZ")}
                    </span>
                  </div>
                )}
                {c.anniversaryDate && (
                  <div>
                    <span className="text-monday-text-muted">Výročí:</span>{" "}
                    <span className="text-monday-text">
                      {new Date(c.anniversaryDate).toLocaleDateString("cs-CZ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
