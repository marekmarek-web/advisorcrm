import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { getWorkspaceBillingSnapshot } from "@/lib/stripe/workspace-billing";
import { db, tenants } from "db";
import { eq } from "db";
import { SetupView } from "./SetupView";

export default async function SetupPage() {
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

  const billing = await getWorkspaceBillingSnapshot({
    tenantId: auth.tenantId,
    roleName: auth.roleName,
  });

  return (
    <SetupView
      initial={{
        userId: auth.userId,
        email,
        fullName,
        roleName: auth.roleName,
        tenantName,
        billing,
      }}
    />
  );
}
