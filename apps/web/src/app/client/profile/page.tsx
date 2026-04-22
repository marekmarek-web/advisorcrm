import Link from "next/link";
import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import { contacts, and, eq } from "db";
import { withTenantContext } from "@/lib/db/with-tenant-context";
import { getClientHouseholdForContact } from "@/app/actions/households";
import { ProfileClientView } from "./ProfileClientView";

function ProfileErrorCard({ reason }: { reason: string }) {
  return (
    <div className="bg-white rounded-[24px] border border-rose-100 p-8 shadow-sm max-w-2xl mx-auto my-8 text-center space-y-3">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 grid place-items-center text-rose-500">
        <span className="text-xl" aria-hidden>
          ⚠️
        </span>
      </div>
      <h2 className="text-lg font-black text-[color:var(--wp-text)]">Profil se nepodařilo načíst</h2>
      <p className="text-sm text-[color:var(--wp-text-secondary)]">
        {reason} Zkuste stránku obnovit. Pokud se chyba opakuje, kontaktujte poradce.
      </p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Link
          href="/client/profile"
          className="inline-flex min-h-[44px] items-center rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700"
        >
          Zkusit znovu
        </Link>
        <Link
          href="/client"
          className="inline-flex min-h-[44px] items-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-4 text-sm font-bold text-[color:var(--wp-text)] hover:bg-[color:var(--wp-main-scroll-bg)]"
        >
          Zpět na přehled
        </Link>
      </div>
    </div>
  );
}

export default async function ClientProfilePage() {
  const auth = await requireClientZoneAuth();
  if (!auth.contactId) {
    return <ProfileErrorCard reason="Chybí propojení účtu na klienta." />;
  }

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
  let loadError: Error | null = null;
  try {
    [profile, household] = await Promise.all([
      withTenantContext({ tenantId: auth.tenantId, userId: auth.userId }, (tx) =>
        tx
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
          .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, auth.contactId!)))
          .limit(1)
          .then((rows) => rows[0] ?? null),
      ),
      getClientHouseholdForContact(auth.contactId),
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e : new Error(String(e));
    profile = null;
    household = null;
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(loadError, { tags: { area: "client-profile", scope: "load" } });
    } catch {
      // ignore
    }
    // eslint-disable-next-line no-console
    console.error("[ClientProfilePage] load failed", loadError);
  }

  if (!profile) {
    return (
      <ProfileErrorCard
        reason={loadError ? "Došlo k chybě při načítání údajů." : "Profil není zatím k dispozici."}
      />
    );
  }

  const safeProfile = {
    ...profile,
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
  };

  return <ProfileClientView profile={safeProfile} household={household} />;
}
