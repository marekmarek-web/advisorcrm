"use client";

import { useMemo, useState } from "react";
import { Check, Mail, Search, User } from "lucide-react";

export type ContactSearchRow = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
};

type ContactSearchSelectProps = {
  value: string;
  onChange: (id: string) => void;
  contacts: ContactSearchRow[];
  /** Text pro volbu bez kontaktu */
  noneLabel?: string;
  /** Společné třídy pro textové pole (border, bg, …) — doplní se odsazení pro ikonku */
  inputClass: string;
};

/**
 * Výběr kontaktu přes vyhledávání (jméno, e-mail, telefon) — bez „čistého“ listování v dropdownu.
 */
export function ContactSearchSelect({
  value,
  onChange,
  contacts,
  noneLabel = "— Bez přiřazení —",
  inputClass,
}: ContactSearchSelectProps) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    return contacts.map((c) => {
      const name = `${c.firstName} ${c.lastName}`.trim() || "—";
      const email = (c.email ?? "").trim();
      const phone = (c.phone ?? "").trim();
      const blob = `${name} ${email} ${phone}`.toLowerCase();
      return { id: c.id, name, email, phone, blob };
    });
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.blob.includes(q));
  }, [rows, query]);

  const noneSelected = value === "";

  const rowBtn =
    "flex w-full min-h-[44px] items-start gap-3 px-3 py-2.5 text-left text-sm transition-colors border-b border-[color:var(--wp-surface-card-border)] last:border-b-0 hover:bg-[color:var(--wp-surface-card)]";

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--wp-text-tertiary)]"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat jméno, e-mail nebo telefon…"
          className={`${inputClass} pl-10`}
          autoComplete="off"
          spellCheck={false}
          aria-label="Vyhledat kontakt"
        />
      </div>
      <div
        className="max-h-64 overflow-y-auto rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40"
        role="listbox"
        aria-label="Výsledky hledání kontaktů"
      >
        <button
          type="button"
          role="option"
          aria-selected={noneSelected}
          onClick={() => onChange("")}
          className={`${rowBtn} ${noneSelected ? "bg-[color:var(--wp-surface-card)] ring-1 ring-inset ring-indigo-500/25" : ""}`}
        >
          <User className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
          <span className="min-w-0 flex-1 font-medium text-[color:var(--wp-text)]">{noneLabel}</span>
          {noneSelected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" strokeWidth={2.5} aria-hidden /> : null}
        </button>
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-[color:var(--wp-text-secondary)]">
            {query.trim() ? "Žádný kontakt neodpovídá hledání." : "Žádní kontakty k zobrazení."}
          </div>
        ) : (
          filtered.map((r) => {
            const selected = value === r.id;
            const sub = [r.email, r.phone].filter(Boolean).join(" · ");
            return (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(r.id);
                  setQuery("");
                }}
                className={`${rowBtn} ${selected ? "bg-[color:var(--wp-surface-card)] ring-1 ring-inset ring-indigo-500/25" : ""}`}
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[color:var(--wp-text)]">{r.name}</span>
                  {sub ? (
                    <span className="mt-0.5 block text-xs text-[color:var(--wp-text-tertiary)]">{sub}</span>
                  ) : null}
                </span>
                {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" strokeWidth={2.5} aria-hidden /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
