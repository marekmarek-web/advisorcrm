import Link from "next/link";
import { CheckCircle2, Clock, Plus } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { getClientRequests } from "@/app/actions/client-portal-requests";
import { RequestsPageClientActions } from "./requests-client-actions";

export default async function ClientRequestsPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const requestsList = await getClientRequests();
  const openRequests = requestsList.filter((item) => item.statusKey !== "done");
  const closedRequests = requestsList.filter((item) => item.statusKey === "done");

  return (
    <div className="space-y-8 client-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight">
          Moje požadavky
        </h2>
        <RequestsPageClientActions />
      </div>

      {requestsList.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-10 text-center">
          <p className="text-slate-500 font-medium mb-2">Zatím nemáte žádné požadavky.</p>
          <p className="text-slate-500 text-sm mb-4">
            Vytvořte nový požadavek — uloží se do poradenského portálu (pipeline). Při nastaveném e-mailu pro
            oznámení dostane tým i upozornění e-mailem.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {openRequests.map((r) => (
            <div
              key={r.id}
              className="bg-white p-6 rounded-[24px] border border-indigo-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-100 flex-shrink-0">
                  <Clock size={20} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 block mb-1">
                    {r.statusLabel}
                  </span>
                  <h3 className="font-bold text-lg text-slate-900">{r.title}</h3>
                  <p className="text-sm font-medium text-slate-500 mt-1">{r.caseTypeLabel}</p>
                  {r.description && (
                    <p className="text-sm text-slate-500 mt-2">{r.description}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-2">
                    Aktualizováno{" "}
                    {new Date(r.updatedAt).toLocaleDateString("cs-CZ", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {closedRequests.map((r) => (
            <div
              key={r.id}
              className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 opacity-80"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100 flex-shrink-0">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block mb-1">
                    {r.statusLabel}
                  </span>
                  <h3 className="font-bold text-lg text-slate-900">{r.title}</h3>
                  <p className="text-sm font-medium text-slate-500 mt-1">{r.caseTypeLabel}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    Dokončeno{" "}
                    {new Date(r.updatedAt).toLocaleDateString("cs-CZ", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {requestsList.length > 0 && (
            <div className="pt-2">
              <Link
                href="/client/messages"
                className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700"
              >
                <Plus size={14} />
                Potřebujete detail? Napište poradci
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
