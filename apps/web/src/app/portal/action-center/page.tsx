import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  getActionCenterItems,
  serializeActionCenterItemsForClient,
} from "@/lib/execution/action-center";
import { ActionCenterPortalClient } from "./ActionCenterPortalClient";

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

export default async function PortalActionCenterPage() {
  let auth;
  try {
    auth = await requireAuth();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect("/prihlaseni?next=/portal/action-center");
  }
  if (auth.roleName === "Client") redirect("/client");

  const rows = await getActionCenterItems(auth.tenantId, auth.userId);
  const initialItems = serializeActionCenterItemsForClient(rows);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full p-4">
      <ActionCenterPortalClient initialItems={initialItems} hydratedFromServer />
    </div>
  );
}
