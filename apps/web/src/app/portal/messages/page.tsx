import { requireAuth } from "@/lib/auth/require-auth";
import { redirect } from "next/navigation";
import { PortalMessagesView } from "./PortalMessagesView";

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

export default async function PortalMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ contact?: string }>;
}) {
  let auth;
  try {
    auth = await requireAuth();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect("/prihlaseni?error=auth_error");
  }
  const { contact: contactParam } = await searchParams;

  if (auth.roleName === "Client") {
    redirect("/client/messages");
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <PortalMessagesView initialContactId={contactParam ?? null} />
    </div>
  );
}
