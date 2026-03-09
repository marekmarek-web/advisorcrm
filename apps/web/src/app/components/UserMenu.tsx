"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function getInitials(email: string | undefined): string {
  if (!email) return "?";
  const part = email.split("@")[0];
  const parts = part.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return part.slice(0, 2).toUpperCase();
}

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState("?");
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setInitials(getInitials(user?.email));
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
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {initials}
      </button>
      {open && (
        <div className="wp-dropdown absolute right-0 top-full mt-1 w-48">
          <Link
            href="/portal/profile"
            className="wp-dropdown-item block text-slate-700"
            onClick={() => setOpen(false)}
          >
            Profil
          </Link>
          <Link
            href="/portal/setup"
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            onClick={() => setOpen(false)}
          >
            Nastavení
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="wp-dropdown-item block w-full text-left text-slate-700"
          >
            Odhlásit se
          </button>
        </div>
      )}
    </div>
  );
}
