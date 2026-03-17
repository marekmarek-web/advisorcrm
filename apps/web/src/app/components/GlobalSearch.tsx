"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import Link from "next/link";
import { globalSearch, type SearchResult } from "@/app/actions/search";

const EMPTY: SearchResult = {
  contacts: [],
  contracts: [],
  opportunities: [],
  events: [],
};

export type GlobalSearchHandle = { open: () => void };

export const GlobalSearch = forwardRef<GlobalSearchHandle, object>(function GlobalSearch(_, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setResults(EMPTY);
    }
  }, [open]);

  const search = useCallback((q: string) => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!q.trim()) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await globalSearch(q);
        setResults(data);
      } catch {
        setResults(EMPTY);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    search(v);
  }

  function close() {
    setOpen(false);
  }

  const hasResults =
    results.contacts.length > 0 ||
    results.contracts.length > 0 ||
    results.opportunities.length > 0 ||
    results.events.length > 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="fixed inset-0 bg-black/40" aria-hidden />
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-lg border border-monday-border bg-monday-surface shadow-2xl"
        style={{ borderRadius: "var(--wp-radius-sm)" }}
      >
        <div className="flex items-center gap-2 border-b border-monday-border px-4 py-3">
          <svg
            className="h-4 w-4 shrink-0 text-monday-text/50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            placeholder="Hledat kontakty, smlouvy, případy…"
            className="flex-1 bg-transparent text-sm text-monday-text placeholder:text-monday-text/40 outline-none"
          />
          <kbd className="hidden sm:inline-block border border-monday-border px-1.5 py-0.5 text-[10px] text-monday-text/50" style={{ borderRadius: "var(--wp-radius-xs)" }}>
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {loading && (
            <p className="px-3 py-4 text-center text-xs text-monday-text/50">
              Hledám…
            </p>
          )}

          {!loading && query.trim() && !hasResults && (
            <p className="px-3 py-4 text-center text-xs text-monday-text/50">
              Žádné výsledky
            </p>
          )}

          {!loading && hasResults && (
            <>
              <ResultGroup title="Kontakty">
                {results.contacts.map((c) => (
                  <ResultLink
                    key={c.id}
                    href={`/portal/contacts/${c.id}`}
                    onClick={close}
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.email && (
                      <span className="ml-2 text-monday-text/50">
                        {c.email}
                      </span>
                    )}
                  </ResultLink>
                ))}
              </ResultGroup>

              <ResultGroup title="Smlouvy">
                {results.contracts.map((c) => (
                  <ResultLink
                    key={c.id}
                    href={`/portal/contacts/${c.contactId}`}
                    onClick={close}
                  >
                    {c.label || "Smlouva"}
                  </ResultLink>
                ))}
              </ResultGroup>

              <ResultGroup title="Případy">
                {results.opportunities.map((o) => (
                  <ResultLink
                    key={o.id}
                    href="/portal/pipeline"
                    onClick={close}
                  >
                    {o.title}
                  </ResultLink>
                ))}
              </ResultGroup>

              <ResultGroup title="Události">
                {results.events.map((ev) => (
                  <ResultLink
                    key={ev.id}
                    href="/portal/calendar"
                    onClick={close}
                  >
                    <span>{ev.title}</span>
                    <span className="ml-2 text-monday-text/50 text-[11px]">
                      {new Date(ev.startAt).toLocaleDateString("cs-CZ")}
                    </span>
                  </ResultLink>
                ))}
              </ResultGroup>
            </>
          )}

          {!loading && !query.trim() && (
            <p className="px-3 py-4 text-center text-xs text-monday-text/50">
              Začněte psát pro vyhledávání…
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

function ResultGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  if (!children || (Array.isArray(children) && children.length === 0))
    return null;
  return (
    <div className="mb-1">
      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-monday-text/40">
        {title}
      </p>
      {children}
    </div>
  );
}

function ResultLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center px-3 py-2 text-sm text-monday-text hover:bg-monday-row-hover transition-colors"
      style={{ borderRadius: "var(--wp-radius-sm)" }}
    >
      {children}
    </Link>
  );
}
