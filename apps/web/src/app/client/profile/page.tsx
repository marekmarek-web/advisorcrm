import { requireAuth } from "@/lib/auth/require-auth";
import { redirect } from "next/navigation";
import { db, contacts, and, eq } from "db";
import { getClientHouseholdForContact } from "@/app/actions/households";
import { ProfileClientView } from "./ProfileClientView";

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

export default async function ClientProfilePage() {
  let auth;
  try {
    auth = await requireAuth();
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect("/prihlaseni?error=auth_error");
  }
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  let profile: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    street: string | null;
    city: string | null;
    zip: string | null;
  } | null = null;
  let household: Awaited<ReturnType<typeof getClientHouseholdForContact>> = null;
  try {
    [profile, household] = await Promise.all([
      db
        .select({
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          street: contacts.street,
          city: contacts.city,
          zip: contacts.zip,
        })
        .from(contacts)
        .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, auth.contactId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getClientHouseholdForContact(auth.contactId),
    ]);
  } catch {
    profile = null;
    household = null;
  }

  if (!profile) return null;

  const safeProfile = {
    ...profile,
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
  };

  return <ProfileClientView profile={safeProfile} household={household} />;
}
