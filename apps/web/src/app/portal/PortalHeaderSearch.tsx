"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import Link from "next/link";
import { globalSearch, type SearchResult } from "@/app/actions/search";

const EMPTY_RESULTS: SearchResult = {
  contacts: [],
  contracts: [],
  opportunities: [],
  events: [],
};

export type PortalHeaderSearchHandle = { focus: () => void };

/** Na stránce Zápisky řídí vyhledávání v zápiscích. Jinde funguje inline dropdown bez otevírání okna. Cmd/Ctrl+K fokusuje input. */
export const PortalHeaderSearch = forwardRef<PortalHeaderSearchHandle | null, object>(function PortalHeaderSearch(_, ref) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNotesPage = pathname === "/portal/notes";

  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchResult>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlQ = searchParams.get("q") ?? "";

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        inputRef.current?.focus();
        if (value.trim()) setDropdownOpen(true);
      },
    }),
    [value]
  );

  useEffect(() => {
    setValue(urlQ);
  }, [urlQ]);

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setResults(EMPTY_RESULTS);
      setDropdownOpen(false);
      return;
    }
    setLoading(true);
    setDropdownOpen(true);
    globalSearch(q)
      .then(setResults)
      .catch(() => setResults(EMPTY_RESULTS))
      .finally(() => setLoading(false));
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);
      if (isNotesPage) {
        const next = new URLSearchParams(searchParams.toString());
        if (v.trim()) next.set("q", v);
        else next.delete("q");
        router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
        return;
      }
      if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (!v.trim()) {
        setResults(EMPTY_RESULTS);
        setDropdownOpen(false);
        return;
      }
      timerRef.current = setTimeout(() => runSearch(v), 300);
    },
    [isNotesPage, pathname, router, searchParams, runSearch]
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const closeAndNavigate = useCallback((href: string) => {
    setValue("");
    setResults(EMPTY_RESULTS);
    setDropdownOpen(false);
    router.push(href);
  }, [router]);

  const placeholder = isNotesPage
    ? "Hledat v zápiscích (klient, název, obsah)…"
    : "Hledat kontakty, smlouvy, případy…";

  const hasResults =
    results.contacts.length > 0 ||
    results.contracts.length > 0 ||
    results.opportunities.length > 0 ||
    results.events.length > 0;

  const showDropdown = !isNotesPage && dropdownOpen && value.trim().length > 0;

  const firstResultHref =
    !loading && hasResults
      ? results.contacts[0]
        ? `/portal/contacts/${results.contacts[0].id}`
        : results.contracts[0]
          ? `/portal/contacts/${results.contracts[0].contactId}`
          : results.opportunities[0]
            ? "/portal/pipeline"
            : results.events[0]
              ? "/portal/calendar"
              : null
      : null;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter" || isNotesPage) return;
      if (firstResultHref) {
        e.preventDefault();
        closeAndNavigate(firstResultHref);
      }
    },
    [isNotesPage, firstResultHref, closeAndNavigate]
  );

  return (
    <div ref={wrapperRef} className="wp-search-wrapper flex relative min-w-0 flex-1 min-h-[44px]">
      <input
        ref={inputRef}
        className="wp-search-input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => !isNotesPage && value.trim() && setDropdownOpen(true)}
        readOnly={false}
        aria-label="Hledat"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
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

      {showDropdown && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-[9999] max-h-[70vh] overflow-y-auto border border-monday-border bg-monday-surface shadow-xl rounded-[var(--wp-radius-sm)]"
        >
          {loading && (
            <p className="px-4 py-3 text-xs text-monday-text/50">Hledám…</p>
          )}
          {!loading && !hasResults && (
            <p className="px-4 py-3 text-xs text-monday-text/50">Žádné výsledky</p>
          )}
          {!loading && hasResults && (
            <div className="p-2">
              {results.contacts.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-monday-text/40">Kontakty</p>
                  {results.contacts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/portal/contacts/${c.id}`}
                      onClick={() => closeAndNavigate(`/portal/contacts/${c.id}`)}
                      className="flex items-center px-2 py-2 text-sm text-monday-text hover:bg-monday-row-hover rounded-[var(--wp-radius-sm)]"
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.email && <span className="ml-2 text-monday-text/50">{c.email}</span>}
                    </Link>
                  ))}
                </div>
              )}
              {results.contracts.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-monday-text/40">Smlouvy</p>
                  {results.contracts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/portal/contacts/${c.contactId}`}
                      onClick={() => closeAndNavigate(`/portal/contacts/${c.contactId}`)}
                      className="flex px-2 py-2 text-sm text-monday-text hover:bg-monday-row-hover rounded-[var(--wp-radius-sm)]"
                    >
                      {c.label || "Smlouva"}
                    </Link>
                  ))}
                </div>
              )}
              {results.opportunities.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-monday-text/40">Případy</p>
                  {results.opportunities.map((o) => (
                    <Link
                      key={o.id}
                      href="/portal/pipeline"
                      onClick={() => closeAndNavigate("/portal/pipeline")}
                      className="flex px-2 py-2 text-sm text-monday-text hover:bg-monday-row-hover rounded-[var(--wp-radius-sm)]"
                    >
                      {o.title}
                    </Link>
                  ))}
                </div>
              )}
              {results.events.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-monday-text/40">Události</p>
                  {results.events.map((ev) => (
                    <Link
                      key={ev.id}
                      href="/portal/calendar"
                      onClick={() => closeAndNavigate("/portal/calendar")}
                      className="flex px-2 py-2 text-sm text-monday-text hover:bg-monday-row-hover rounded-[var(--wp-radius-sm)]"
                    >
                      <span>{ev.title}</span>
                      <span className="ml-2 text-monday-text/50 text-[11px]">
                        {new Date(ev.startAt).toLocaleDateString("cs-CZ")}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
