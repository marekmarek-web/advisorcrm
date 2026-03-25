import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { AiAssistantChatScreen } from "../mobile/screens/AiAssistantChatScreen";

export default async function PortalAiPage() {
  try {
    const auth = await requireAuth();
    if (auth.roleName === "Client") redirect("/client");
  } catch {
    redirect("/prihlaseni?next=/portal/ai");
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full max-w-3xl mx-auto p-4">
      <AiAssistantChatScreen />
    </div>
  );
}
