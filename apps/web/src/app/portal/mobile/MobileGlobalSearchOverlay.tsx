"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Search } from "lucide-react";
import { globalSearch, type SearchResult } from "@/app/actions/search";

const EMPTY: SearchResult = { contacts: [], contracts: [], opportunities: [], events: [], households: [], notes: [], docs: [] };

export function MobileGlobalSearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      setValue("");
      setResults(EMPTY);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    globalSearch(q)
      .then(setResults)
      .catch(() => setResults(EMPTY))
      .finally(() => setLoading(false));
  }, []);

  const onChange = useCallback(
    (v: string) => {
      setValue(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (!v.trim()) {
        setResults(EMPTY);
        setLoading(false);
        return;
      }
      timerRef.current = setTimeout(() => runSearch(v), 280);
    },
    [runSearch]
  );

  function go(href: string) {
    onClose();
    setValue("");
    setResults(EMPTY);
    router.push(href);
  }

  if (!open) return null;

  const hasAny =
    results.contacts.length +
      results.contracts.length +
      results.opportunities.length +
      results.events.length +
      results.households.length +
      results.notes.length +
      results.docs.length >
    0;

  return (
    <div className="fixed inset-0 z-[150] bg-[color:var(--wp-surface-card)] flex flex-col animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Hledání">
      <div className="pt-[calc(var(--safe-area-top)+0.75rem)] px-3 pb-3 border-b border-[color:var(--wp-surface-card-border)] flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3">
          <Search size={18} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Hledat kontakty, smlouvy, případy…"
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-[color:var(--wp-text)] outline-none placeholder:text-[color:var(--wp-text-tertiary)]"
          />
          {loading ? <Loader2 size={18} className="text-indigo-500 animate-spin shrink-0" /> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] grid place-items-center active:scale-95 transition-transform"
          aria-label="Zavřít"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {!value.trim() ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)] text-center py-8">Začněte psát pro vyhledávání v Aidvisory.</p>
        ) : !loading && !hasAny ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)] text-center py-8">Žádné výsledky.</p>
        ) : null}

        {results.contacts.length > 0 ? (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Kontakty</h3>
            <ul className="space-y-1">
              {results.contacts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => go(`/portal/contacts/${c.id}`)}
                    className="w-full text-left min-h-[44px] px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text)] active:bg-[color:var(--wp-surface-muted)]"
                  >
                    {c.name}
                    {c.email ? <span className="block text-xs font-normal text-[color:var(--wp-text-secondary)]">{c.email}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {results.contracts.length > 0 ? (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Smlouvy</h3>
            <ul className="space-y-1">
              {results.contracts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => go(`/portal/contacts/${c.contactId}`)}
                    className="w-full text-left min-h-[44px] px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text)] active:bg-[color:var(--wp-surface-muted)]"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {results.opportunities.length > 0 ? (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Obchody</h3>
            <ul className="space-y-1">
              {results.opportunities.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => go(`/portal/pipeline/${o.id}`)}
                    className="w-full text-left min-h-[44px] px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text)] active:bg-[color:var(--wp-surface-muted)]"
                  >
                    {o.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {results.households.length > 0 ? (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Domácnosti</h3>
            <ul className="space-y-1">
              {results.households.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => go(`/portal/households/${h.id}`)}
                    className="w-full text-left min-h-[44px] px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text)] active:bg-[color:var(--wp-surface-muted)]"
                  >
                    {h.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {results.docs.length > 0 ? (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Dokumenty</h3>
            <ul className="space-y-1">
              {results.docs.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => go(`/portal/documents?doc=${d.id}`)}
                    className="w-full text-left min-h-[44px] px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text)] active:bg-[color:var(--wp-surface-muted)]"
                  >
                    {d.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {results.notes.length > 0 ? (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Zápisky</h3>
            <ul className="space-y-1">
              {results.notes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => go(`/portal/notes?noteId=${n.id}`)}
                    className="w-full text-left min-h-[44px] px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text)] active:bg-[color:var(--wp-surface-muted)]"
                  >
                    {n.domain}
                    <span className="block text-xs font-normal text-[color:var(--wp-text-secondary)]">
                      {new Date(n.meetingAt).toLocaleDateString("cs-CZ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {results.events.length > 0 ? (
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Události</h3>
            <ul className="space-y-1">
              {results.events.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => go("/portal/calendar")}
                    className="w-full text-left min-h-[44px] px-3 py-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text)] active:bg-[color:var(--wp-surface-muted)]"
                  >
                    {e.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
