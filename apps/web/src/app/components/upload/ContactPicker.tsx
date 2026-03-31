"use client";

import { useEffect, useMemo, useState } from "react";
import { getContactsList } from "@/app/actions/contacts";

export type ContactPickerValue = {
  id: string;
  name: string;
};

type ContactPickerProps = {
  value: ContactPickerValue | null;
  onChange: (value: ContactPickerValue) => void;
  /** Override field label (default: "Klient") */
  label?: string;
};

type ContactOption = ContactPickerValue;

export function ContactPicker({ value, onChange, label = "Klient" }: ContactPickerProps) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getContactsList()
      .then((list) => {
        if (cancelled) return;
        const mapped = list.map((contact) => ({
          id: contact.id,
          name: `${contact.firstName} ${contact.lastName}`.trim(),
        }));
        setContacts(mapped);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setContacts([]);
        setError("Kontakty se nepodařilo načíst.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => contact.name.toLowerCase().includes(query));
  }, [contacts, search]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="share-contact-search">
        {label}
      </label>
      <input
        id="share-contact-search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Hledat klienta"
        className="mb-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
      />

      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50">
        {isLoading ? (
          <div className="px-3 py-3 text-sm text-slate-500">Načítám kontakty...</div>
        ) : null}

        {!isLoading && error ? <div className="px-3 py-3 text-sm text-red-600">{error}</div> : null}

        {!isLoading && !error && filtered.length === 0 ? (
          <div className="px-3 py-3 text-sm text-slate-500">Žádný kontakt neodpovídá hledání.</div>
        ) : null}

        {!isLoading && !error
          ? filtered.map((contact) => {
              const selected = value?.id === contact.id;
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => onChange(contact)}
                  className={`flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    selected ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{contact.name}</span>
                  {selected ? <span className="text-xs font-medium">Vybráno</span> : null}
                </button>
              );
            })
          : null}
      </div>
    </div>
  );
}
