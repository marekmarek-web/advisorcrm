import Link from "next/link";
import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import { listClientMaterialRequests } from "@/app/actions/advisor-material-requests";
import { materialRequestStatusLabel } from "@/lib/advisor-material-requests/display";

export default async function ClientAdvisorMaterialRequestsPage() {
  const auth = await requireClientZoneAuth();
  if (!auth.contactId) return null;

  const rows = await listClientMaterialRequests();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-[color:var(--wp-text)]">Požadavky od poradce</h1>
        <p className="text-[color:var(--wp-text-secondary)] text-sm mt-1">
          Zde najdete úkoly a žádosti o podklady od vašeho poradce.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[color:var(--wp-text-secondary)] text-sm">Zatím žádné požadavky.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/client/pozadavky-poradce/${r.id}`}
                className="block rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white p-4 shadow-sm hover:border-indigo-200 min-h-[44px]"
              >
                <p className="font-bold text-[color:var(--wp-text)]">{r.title}</p>
                <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">
                  {r.categoryLabel} · {materialRequestStatusLabel(r.status)}
                  {r.dueAt ? ` · do ${new Date(r.dueAt).toLocaleDateString("cs-CZ")}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
