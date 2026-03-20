import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getMembership, getDemoClientContactId } from "./get-membership";
import type { RoleName } from "./get-membership";
import {
  isDemoMode,
  DEMO_TENANT_ID,
  DEMO_USER_ID,
  DEMO_ROLE_ADMIN_ID,
  DEMO_ROLE_CLIENT_ID,
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
    // Na /client vždy zobraz klientský portál (první kontakt tenanta). Jinak by DEV_CONTRACTS_USER_ID vrátil Admin a layout by přesměroval na /portal.
    const headersList = await headers();
    if (headersList.get("x-demo-client-zone") === "1") {
      try {
        const demoContactId =
          process.env.DEMO_CLIENT_CONTACT_ID?.trim() ||
          (await getDemoClientContactId(DEMO_TENANT_ID));
        if (demoContactId) {
          return {
            userId: DEMO_USER_ID,
            tenantId: DEMO_TENANT_ID,
            roleId: DEMO_ROLE_CLIENT_ID,
            roleName: "Client" as RoleName,
            contactId: demoContactId,
          };
        }
      } catch {
        // fallback na Admin demo kontext
      }
    }
    const devUserId =
      process.env.NEXT_PUBLIC_DEV_CONTRACTS_USER_ID ?? process.env.DEV_CONTRACTS_USER_ID;
    const allowDevBypass =
      process.env.NODE_ENV === "development" &&
      process.env.VERCEL_ENV !== "production" &&
      devUserId?.trim();
    if (allowDevBypass) {
      try {
        const uid = devUserId!.trim();
        const m = await getMembership(uid);
        if (m) {
          return {
            userId: uid,
            tenantId: m.tenantId,
            roleId: m.roleId,
            roleName: m.roleName as RoleName,
            contactId: m.contactId ?? null,
          };
        }
      } catch {
        // DB nedostupná nebo membership neexistuje – použij demo kontext
      }
    }
    return getDemoAuthContext();
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
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
    const headersList = await headers();
    if (headersList.get("x-demo-client-zone") === "1") {
      try {
        const demoContactId =
          process.env.DEMO_CLIENT_CONTACT_ID?.trim() ||
          (await getDemoClientContactId(DEMO_TENANT_ID));
        if (demoContactId) {
          return {
            userId: DEMO_USER_ID,
            tenantId: DEMO_TENANT_ID,
            roleId: DEMO_ROLE_CLIENT_ID,
            roleName: "Client" as RoleName,
            contactId: demoContactId,
          };
        }
      } catch {
        // fallback na Admin demo kontext
      }
    }
    const devUserId =
      process.env.NEXT_PUBLIC_DEV_CONTRACTS_USER_ID ?? process.env.DEV_CONTRACTS_USER_ID;
    const allowDevBypass =
      process.env.NODE_ENV === "development" &&
      process.env.VERCEL_ENV !== "production" &&
      devUserId?.trim();
    if (allowDevBypass) {
      try {
        const uid = devUserId!.trim();
        const m = await getMembership(uid);
        if (m) {
          return {
            userId: uid,
            tenantId: m.tenantId,
            roleId: m.roleId,
            roleName: m.roleName as RoleName,
            contactId: m.contactId ?? null,
          };
        }
      } catch {
        // fallback na demo kontext
      }
    }
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
