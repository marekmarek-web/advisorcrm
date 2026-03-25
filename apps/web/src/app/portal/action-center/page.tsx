import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { ActionCenterScreen } from "../mobile/screens/ActionCenterScreen";

export default async function PortalActionCenterPage() {
  try {
    const auth = await requireAuth();
    if (auth.roleName === "Client") redirect("/client");
  } catch {
    redirect("/prihlaseni?next=/portal/action-center");
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full p-4">
      <ActionCenterScreen />
    </div>
  );
}
