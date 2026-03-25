import { createClient } from "@/lib/supabase/server";

/**
 * Supabase session user id for App Router API routes (reads auth cookies).
 * Use with {@link getMembership} — same pattern as the rest of the app (no Clerk).
 */
export async function getAuthenticatedApiUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.id) return null;
    return user.id;
  } catch {
    return null;
  }
}
