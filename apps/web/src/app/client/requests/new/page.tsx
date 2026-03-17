import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { ClientRequestForm } from "./ClientRequestForm";

export default async function NewClientRequestPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) redirect("/client");

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-monday-text">
        Nový požadavek
      </h1>
      <p className="text-sm text-monday-text-muted">
        Popište, co chcete řešit. Váš poradce požadavek převezme a bude vás
        kontaktovat.
      </p>
      <ClientRequestForm />
    </div>
  );
}
