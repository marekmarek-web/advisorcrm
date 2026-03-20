/**
 * Demo mode: when NEXT_PUBLIC_SKIP_AUTH=true, requireAuth returns this context
 * instead of using Supabase. Values must match packages/db/src/seed.ts.
 */
export const DEMO_TENANT_ID =
  process.env.DEMO_TENANT_ID ?? "00000000-0000-4000-8000-000000000001";
export const DEMO_USER_ID =
  process.env.DEMO_USER_ID ?? "demo-user-id-supabase-auth";
export const DEMO_ROLE_ADMIN_ID =
  process.env.DEMO_ROLE_ADMIN_ID ?? "00000000-0000-4000-8000-000000000002";
export const DEMO_ROLE_CLIENT_ID =
  process.env.DEMO_ROLE_CLIENT_ID ?? "00000000-0000-4000-8000-000000000006";

export function isDemoMode(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NEXT_PUBLIC_SKIP_AUTH === "true";
}
