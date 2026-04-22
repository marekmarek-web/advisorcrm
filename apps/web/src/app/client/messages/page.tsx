import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import { getAssignedAdvisorForClient } from "@/app/actions/client-dashboard";
import { ClientChatWrapper } from "../ClientChatWrapper";

export default async function ClientMessagesPage() {
  const auth = await requireClientZoneAuth();
  if (!auth.contactId) return null;

  const advisor = await getAssignedAdvisorForClient(auth.contactId).catch(() => null);

  return (
    <div className="max-w-5xl mx-auto w-full flex-1 min-h-[480px] flex flex-col bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden client-fade-in">
      <div className="px-8 py-5 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center font-black text-sm shadow-md">
            {advisor?.initials ?? "VP"}
          </div>
          <div>
            <h2 className="font-bold text-lg text-[color:var(--wp-text)] leading-tight">
              {advisor?.fullName ?? "Váš poradce"}
            </h2>
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Váš poradce
            </p>
          </div>
        </div>
      </div>
      <ClientChatWrapper contactId={auth.contactId} />
    </div>
  );
}
