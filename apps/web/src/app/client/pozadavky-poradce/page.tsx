import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { listClientMaterialRequests } from "@/app/actions/advisor-material-requests";

export default async function ClientAdvisorMaterialRequestsPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const rows = await listClientMaterialRequests();

  function statusCs(s: string): string {
    const m: Record<string, string> = {
      new: "Nový",
      seen: "Zobrazeno",
      answered: "Odpovězeno",
      needs_more: "Čeká na doplnění",
      done: "Splněno",
      closed: "Uzavřeno",
    };
    return m[s] ?? s;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Požadavky od poradce</h1>
        <p className="text-slate-600 text-sm mt-1">
          Zde najdete úkoly a žádosti o podklady od vašeho poradce.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-slate-500 text-sm">Zatím žádné požadavky.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/client/pozadavky-poradce/${r.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 min-h-[44px]"
              >
                <p className="font-bold text-slate-900">{r.title}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {r.categoryLabel} · {statusCs(r.status)}
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
