"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ContactRow } from "@/app/actions/contacts";

export interface ContactSearchInputProps {
  value: string;
  contacts: ContactRow[];
  onChange: (contactId: string, contact?: ContactRow) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

function matchContact(c: ContactRow, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase().trim();
  const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase();
  const email = (c.email ?? "").toLowerCase();
  return name.includes(lower) || email.includes(lower);
}

export function ContactSearchInput({
  value,
  contacts,
  onChange,
  placeholder = "Vyhledat klienta…",
  className = "",
  id,
  disabled = false,
}: ContactSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? contacts.find((c) => c.id === value) : null;
  const displayText = selected ? `${selected.firstName ?? ""} ${selected.lastName ?? ""}`.trim() : inputValue;

  useEffect(() => {
    if (value && selected) setInputValue(`${selected.firstName ?? ""} ${selected.lastName ?? ""}`.trim());
    else if (!value) setInputValue("");
  }, [value, selected?.id]);

  const filtered = inputValue.trim() ? contacts.filter((c) => matchContact(c, inputValue)) : contacts;
  const showDropdown = open && filtered.length > 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          value={displayText}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (value) onChange("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full px-3 py-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 ${className}`}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setInputValue(""); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            aria-label="Zrušit výběr"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {showDropdown && (
        <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          {filtered.slice(0, 50).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(c.id, c);
                  setInputValue(`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim());
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                {c.firstName} {c.lastName}
                {c.email && <span className="text-slate-400 text-xs ml-1">({c.email})</span>}
              </button>
            </li>
          ))}
          {filtered.length > 50 && <li className="px-3 py-2 text-xs text-slate-400">Zobrazeno max. 50 výsledků</li>}
        </ul>
      )}
    </div>
  );
}
