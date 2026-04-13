import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getMembership, getDemoClientContactId } from "./get-membership";
import { clientZoneSkipPendingPasswordGate } from "@/lib/auth/client-zone-pending-gate";
import type { RoleName } from "@/shared/rolePermissions";
import { db, clientInvitations, and, gt, isNull, sql } from "db";
import {
  isDemoMode,
  DEMO_TENANT_ID,
  DEMO_USER_ID,
  DEMO_ROLE_ADMIN_ID,
  DEMO_ROLE_CLIENT_ID,
} from "./demo";
import { buildClientInvitePasswordSetupSearch } from "@/lib/auth/client-invite-url";

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

async function findPendingClientPasswordChangeRedirect(email: string | null | undefined): Promise<string | null> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const rows = await db
      .select({ token: clientInvitations.token })
      .from(clientInvitations)
      .where(
        and(
          sql`lower(${clientInvitations.email}) = ${normalizedEmail}`,
          gt(clientInvitations.expiresAt, new Date()),
          isNull(clientInvitations.revokedAt),
          isNull(clientInvitations.acceptedAt),
          isNull(clientInvitations.passwordChangedAt),
        ),
      )
      .limit(1);
    const inviteToken = rows[0]?.token?.trim();
    return inviteToken
      ? `/prihlaseni/nastavit-heslo?${buildClientInvitePasswordSetupSearch(inviteToken)}`
      : null;
  } catch (err) {
    const message = String((err as { message?: string } | null)?.message ?? err).toLowerCase();
    if (message.includes("client_invitations") && message.includes("password_changed_at")) {
      return null;
    }
    throw err;
  }
}

/** Deduped within one RSC/request; use from server components and server actions. */
export const getCachedSupabaseUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Deduped per userId within one RSC/request. */
export const getCachedMembership = cache(async (userId: string) => {
  return getMembership(userId);
});

/** Use in Server Components and Server Actions. Gets session, then membership; redirects to /login if unauthenticated, throws if no tenant membership. */
async function requireAuthUncached(): Promise<AuthContext> {
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
        const m = await getCachedMembership(uid);
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
  const user = await getCachedSupabaseUser();
  if (!user) {
    redirect("/");
  }
  const m = await getCachedMembership(user.id);
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

/** Deduped within one RSC/request — layout + page + parallel server calls share one resolution. */
export const requireAuth = cache(requireAuthUncached);

/**
 * Canonical client auth guard for all routes under /client (server pages and the mobile SPA).
 *
 * Contract:
 * - Returns AuthContext only when `roleName === "Client"` AND `contactId` is set.
 * - Non-Client users → redirect to `/portal`.
 * - Unauthenticated users → redirect to `/prihlaseni`.
 * - Pending password-change invitations → redirect to password setup.
 * - Client without linked contact → redirect to `/prihlaseni?error=auth_error`.
 *
 * Usage:
 * - Every server-rendered `/client/.../page.tsx` MUST call `requireClientZoneAuth()`.
 * - The `/client/layout.tsx` ALSO calls it as a top-level gate.
 * - `loadClientPortalSessionBundle()` calls it internally (dashboard + mobile SPA).
 * - Server actions serving client reads use `requireAuthInAction()` + manual
 *   `auth.roleName !== "Client"` guard to early-return or throw.
 *
 * Do NOT use `requireAuth()` in client pages — it would redirect no-membership
 * users to `/register/complete` (advisor workspace creation).
 */
async function requireClientZoneAuthUncached(): Promise<AuthContext> {
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
        // fall through
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
        const m = await getCachedMembership(uid);
        if (m?.roleName === "Client" && m.contactId) {
          return {
            userId: uid,
            tenantId: m.tenantId,
            roleId: m.roleId,
            roleName: m.roleName as RoleName,
            contactId: m.contactId ?? null,
          };
        }
      } catch {
        // fall through
      }
    }
    redirect("/portal");
  }

  const user = await getCachedSupabaseUser();
  if (!user) {
    redirect("/prihlaseni?error=auth_error");
  }
  const m = await getCachedMembership(user.id);
  if (m && (m.roleName as string) !== "Client") {
    redirect("/portal");
  }
  const pendingPasswordChangeRedirect = clientZoneSkipPendingPasswordGate(m)
    ? null
    : await findPendingClientPasswordChangeRedirect(user.email);
  if (pendingPasswordChangeRedirect) {
    redirect(pendingPasswordChangeRedirect);
  }
  if (!m) {
    redirect("/prihlaseni?error=client_no_access");
  }
  if ((m.roleName as string) !== "Client") {
    redirect("/portal");
  }
  if (!m.contactId) {
    redirect("/prihlaseni?error=auth_error");
  }
  return {
    userId: user.id,
    tenantId: m.tenantId,
    roleId: m.roleId,
    roleName: m.roleName as RoleName,
    contactId: m.contactId ?? null,
  };
}

export const requireClientZoneAuth = cache(requireClientZoneAuthUncached);

/** For Server Actions: pass auth from form/action; in RSC use requireAuth() and pass tenantId to client. */
async function requireAuthInActionUncached(): Promise<AuthContext> {
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
        const m = await getCachedMembership(uid);
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
  const user = await getCachedSupabaseUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  const m = await getCachedMembership(user.id);
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

/** Deduped within one RSC/request so parallel server actions avoid repeated session/membership work. */
export const requireAuthInAction = cache(requireAuthInActionUncached);
