"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { revokeAllStoredPushTokens, revokeStoredPushToken } from "@/lib/push/usePushNotifications";
import clsx from "clsx";
import { displayNameFromUserMetadata, getUserMenuInitials } from "@/lib/user-initials";

type UserMenuProps = {
  /** Kulatý trigger 48px jako main banner txt. */
  variant?: "default" | "portalHeader";
};

const itemClass =
  "flex w-full min-h-[44px] items-center px-4 py-3 text-sm font-semibold text-[color:var(--wp-text)] transition-colors hover:bg-[color:var(--wp-surface-muted)]";

export function UserMenu({ variant = "default" }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState("?");
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      const displayName = displayNameFromUserMetadata(user?.user_metadata as Record<string, unknown> | undefined);
      setInitials(getUserMenuInitials({ displayName, email: user?.email ?? null }));
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClose() {
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onMouseDownOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDownOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDownOutside);
    };
  }, [open]);

  async function signOut() {
    const supabase = createClient();
    await revokeStoredPushToken();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function signOutAllDevices() {
    const supabase = createClient();
    await revokeAllStoredPushTokens();
    await supabase.auth.signOut({ scope: "global" });
    router.push("/");
    router.refresh();
  }

  const triggerClass =
    variant === "portalHeader"
      ? clsx(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black transition-all",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wp-focus-ring-color)] focus-visible:ring-offset-2",
          "border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-raised)] text-[color:var(--wp-text-secondary)] shadow-sm",
          "hover:scale-105 hover:bg-[color:var(--wp-surface-muted)] dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15",
          "ring-offset-2 ring-offset-[color:var(--wp-portal-header-bg)]",
          open && "ring-2 ring-[color:var(--wp-focus-ring-color)] ring-offset-2",
        )
      : "flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-wp-surface-muted text-sm font-medium text-wp-text-secondary hover:bg-wp-surface-raised focus:outline-none focus:ring-2 focus:ring-[color:var(--wp-focus-ring-color)] focus:ring-offset-2 dark:bg-white/10 dark:text-white dark:hover:bg-white/20";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Profil a nastavení"
      >
        {initials}
      </button>
      {open && (
        <div
          className="absolute right-0 z-dropdown min-w-[min(var(--wp-profile-menu-width),calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-[24px] border border-[color:var(--wp-dropdown-border)] bg-[color:var(--wp-dropdown-surface)] py-2 shadow-2xl backdrop-blur-xl"
          style={{
            top: "calc(100% + 12px)",
            boxShadow: "var(--wp-shadow-dropdown-strong, var(--wp-dropdown-shadow))",
          }}
          role="menu"
        >
          <Link href="/portal/profile" className={itemClass} onClick={() => setOpen(false)} role="menuitem">
            Profil
          </Link>
          <Link href="/portal/setup" className={itemClass} onClick={() => setOpen(false)} role="menuitem">
            Nastavení
          </Link>
          <div className="my-1 border-t border-[color:var(--wp-border)]" aria-hidden />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className={clsx(itemClass, "text-left")}
            role="menuitem"
          >
            Odhlásit se
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOutAllDevices();
            }}
            className={clsx(itemClass, "text-left text-[color:var(--wp-text-secondary)]")}
            role="menuitem"
          >
            Odhlásit všechna zařízení
          </button>
        </div>
      )}
    </div>
  );
}
