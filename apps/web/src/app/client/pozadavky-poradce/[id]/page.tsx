import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getClientMaterialRequestDetail } from "@/app/actions/advisor-material-requests";
import { materialRequestStatusLabel } from "@/lib/advisor-material-requests/display";
import { ClientMaterialRequestRespondForm } from "./ClientMaterialRequestRespondForm";

export default async function ClientAdvisorMaterialRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const { id } = await params;
  const detail = await getClientMaterialRequestDetail(id);
  if (!detail) notFound();

  function priorityCs(p: string): string {
    const m: Record<string, string> = {
      low: "Nízká",
      normal: "Běžná",
      high: "Vysoká",
    };
    return m[p] ?? p;
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <Link href="/client/pozadavky-poradce" className="text-sm font-bold text-indigo-600 hover:underline">
        ← Zpět na seznam
      </Link>
      <header>
        <h1 className="text-2xl font-black text-slate-900">{detail.title}</h1>
        <p className="text-sm text-slate-500 mt-2">
          {detail.categoryLabel} · {materialRequestStatusLabel(detail.status)} · priorita {priorityCs(detail.priority)}
          {detail.dueAt ? ` · termín ${new Date(detail.dueAt).toLocaleDateString("cs-CZ")}` : ""}
        </p>
        {detail.description ? (
          <p className="mt-4 text-slate-700 whitespace-pre-wrap">{detail.description}</p>
        ) : null}

        {/* 5F: cross-link to related client request (opportunity) when linked */}
        {detail.opportunityId ? (
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-indigo-800 font-medium">
              Tento požadavek je navázán na váš případ.
            </p>
            <Link
              href="/client/requests"
              className="text-sm font-bold text-indigo-700 hover:text-indigo-900 whitespace-nowrap"
            >
              Moje požadavky →
            </Link>
          </div>
        ) : null}
      </header>

      <section aria-label="Historie">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">Komunikace</h2>
        <ul className="space-y-3">
          {detail.messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-xl px-3 py-2 text-sm ${
                m.authorRole === "advisor"
                  ? "bg-indigo-50 border border-indigo-100"
                  : "bg-slate-50 border border-slate-200"
              }`}
            >
              <p className="text-[10px] font-bold text-slate-400 mb-1">
                {m.authorRole === "advisor" ? "Poradce" : "Vy"} ·{" "}
                {new Date(m.createdAt).toLocaleString("cs-CZ")}
              </p>
              <p className="whitespace-pre-wrap text-slate-800">{m.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide mb-3">Přílohy</h2>
        {detail.attachments.length === 0 ? (
          <p className="text-sm text-slate-500">Zatím žádné přílohy.</p>
        ) : (
          <ul className="space-y-2">
            {detail.attachments.map((a) => (
              <li key={a.documentId}>
                <a
                  href={`/api/documents/${a.documentId}/download`}
                  className="text-sm font-bold text-indigo-600 hover:underline break-all"
                >
                  {a.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.status !== "closed" && detail.status !== "done" ? (
        <ClientMaterialRequestRespondForm requestId={detail.id} />
      ) : (
        <p className="text-sm text-slate-500">Tento požadavek je uzavřený.</p>
      )}
    </div>
  );
}
