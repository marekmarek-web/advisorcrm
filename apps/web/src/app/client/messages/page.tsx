import { requireAuth } from "@/lib/auth/require-auth";
import { ChatThread } from "@/app/components/ChatThread";

export default async function ClientMessagesPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-monday-text">Zprávy</h1>
      <ChatThread contactId={auth.contactId} currentUserType="client" />
    </div>
  );
}
