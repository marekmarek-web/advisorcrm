"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutAndRedirectClient } from "@/lib/auth/sign-out-client";

export function SignOutButton({
  variant = "link",
}: {
  /** `link` — subtle text link (sidebar footer); `danger` — full-width danger button (profile page). */
  variant?: "link" | "danger";
}) {
  const router = useRouter();
  async function signOut() {
    await signOutAndRedirectClient(router);
  }

  if (variant === "danger") {
    return (
      <button
        type="button"
        onClick={signOut}
        className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-sm font-black hover:bg-rose-100 hover:border-rose-300 transition-all"
      >
        <LogOut size={16} />
        Odhlásit se
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="text-slate-500 hover:text-slate-700 flex items-center gap-1.5 text-sm"
    >
      <LogOut size={14} />
      Odhlásit se
    </button>
  );
}
