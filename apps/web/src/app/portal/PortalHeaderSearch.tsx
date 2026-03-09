"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/** Na stránce Zápisky (/portal/notes) řídí vyhledávání v zápiscích. Jinde klik/focus otevře GlobalSearch. */
export function PortalHeaderSearch({ onOpenGlobalSearch }: { onOpenGlobalSearch?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNotesPage = pathname === "/portal/notes";

  const [value, setValue] = useState("");
  const urlQ = searchParams.get("q") ?? "";

  useEffect(() => {
    setValue(urlQ);
  }, [urlQ]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);
      if (isNotesPage) {
        const next = new URLSearchParams(searchParams.toString());
        if (v.trim()) next.set("q", v); else next.delete("q");
        router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
      }
    },
    [isNotesPage, pathname, router, searchParams]
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (!isNotesPage && onOpenGlobalSearch) {
        e.target.blur();
        onOpenGlobalSearch();
      }
    },
    [isNotesPage, onOpenGlobalSearch]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      if (!isNotesPage && onOpenGlobalSearch) {
        e.preventDefault();
        onOpenGlobalSearch();
      }
    },
    [isNotesPage, onOpenGlobalSearch]
  );

  const placeholder = isNotesPage
    ? "Hledat v zápiscích (klient, název, obsah)…"
    : "Hledat…";

  return (
    <div className="wp-search-wrapper hidden sm:flex">
      <input
        className="wp-search-input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={handleFocus}
        onClick={handleClick}
        readOnly={!isNotesPage}
        aria-label="Hledat"
      />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        style={{ opacity: 0.5 }}
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    </div>
  );
}
