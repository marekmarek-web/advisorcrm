"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { revokeStoredPushToken } from "@/lib/push/usePushNotifications";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await revokeStoredPushToken();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={signOut}
      className="text-slate-500 hover:text-slate-700"
    >
      Odhlásit se
    </button>
  );
}
