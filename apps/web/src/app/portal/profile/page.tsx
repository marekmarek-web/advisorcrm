import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { db, tenants } from "db";
import { eq } from "db";
import { Breadcrumbs } from "@/app/components/Breadcrumbs";
import { PortalProfileForm } from "./PortalProfileForm";

export default async function ProfilePage() {
  const auth = await requireAuth();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "";
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? null;

  const [tenantRow] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, auth.tenantId))
    .limit(1);
  const tenantName = tenantRow?.name ?? "—";

  return (
    <div className="p-4 max-w-[800px] mx-auto">
      <Breadcrumbs items={[{ label: "Profil" }]} />
      <div className="rounded-xl border border-slate-200 bg-white p-6 mt-4">
        <h1 className="text-xl font-semibold text-slate-800 mb-6">Profil uživatele</h1>
        <PortalProfileForm
          initial={{
            email,
            fullName,
            roleName: auth.roleName,
            tenantName,
          }}
        />
      </div>
    </div>
  );
}
