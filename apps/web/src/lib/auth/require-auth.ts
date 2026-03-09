import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "./get-membership";
import type { RoleName } from "./get-membership";
import {
  isDemoMode,
  DEMO_TENANT_ID,
  DEMO_USER_ID,
  DEMO_ROLE_ADMIN_ID,
} from "./demo";

export type AuthContext = {
  userId: string;
  tenantId: string;
  roleId: string;
  roleName: RoleName;
  /** Pouze u role Client – kontakt vázaný na přihlášeného uživatele (Client Zone). */
  contactId?: string | null;
};

function getDemoAuthContext(): AuthContext {
  return {
    userId: DEMO_USER_ID,
    tenantId: DEMO_TENANT_ID,
    roleId: DEMO_ROLE_ADMIN_ID,
    roleName: "Admin" as RoleName,
    contactId: null,
  };
}

/** Use in Server Components and Server Actions. Gets session, then membership; redirects to /login if unauthenticated, throws if no tenant membership. */
export async function requireAuth(): Promise<AuthContext> {
  if (isDemoMode()) {
    return getDemoAuthContext();
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const m = await getMembership(user.id);
  if (!m) {
    redirect("/register/complete");
  }
  if ((m.roleName as string) === "Client" && !m.contactId) {
    throw new Error("Unauthorized: Client role without linked contact");
  }
  return {
    userId: user.id,
    tenantId: m.tenantId,
    roleId: m.roleId,
    roleName: m.roleName as RoleName,
    contactId: m.contactId ?? null,
  };
}

/** For Server Actions: pass auth from form/action; in RSC use requireAuth() and pass tenantId to client. */
export async function requireAuthInAction(): Promise<AuthContext> {
  if (isDemoMode()) {
    return getDemoAuthContext();
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  const m = await getMembership(user.id);
  if (!m) {
    redirect("/register/complete");
  }
  if ((m.roleName as string) === "Client" && !m.contactId) {
    throw new Error("Unauthorized: Client role without linked contact");
  }
  return {
    userId: user.id,
    tenantId: m.tenantId,
    roleId: m.roleId,
    roleName: m.roleName as RoleName,
    contactId: m.contactId ?? null,
  };
}
