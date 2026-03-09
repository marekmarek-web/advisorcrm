"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getContactsList } from "@/app/actions/contacts";
import type { ContactRow } from "@/app/actions/contacts";
import { EmptyState } from "@/app/components/EmptyState";

export function PortalContactsView() {
  const [list, setList] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getContactsList()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-monday-text">Contacts</h1>
      {loading ? (
        <p className="text-monday-text-muted text-sm">Načítám…</p>
      ) : list.length === 0 ? (
        <EmptyState
          icon="👤"
          title="Zatím žádné kontakty"
          description="Přidejte prvního klienta."
          actionLabel="Přidat kontakt"
          actionHref="/portal/contacts"
        />
      ) : (
        <div className="rounded-lg border border-monday-border bg-monday-surface overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-monday-border bg-monday-row-hover">
                <th className="text-left p-2 text-monday-text-muted font-semibold">Jméno</th>
                <th className="text-left p-2 text-monday-text-muted font-semibold">E-mail</th>
                <th className="text-left p-2 text-monday-text-muted font-semibold">Telefon</th>
                <th className="text-left p-2 text-monday-text-muted font-semibold" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-monday-border hover:bg-monday-row-hover">
                  <td className="p-2 text-monday-text">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="p-2 text-monday-text-muted">{c.email ?? "—"}</td>
                  <td className="p-2 text-monday-text-muted">{c.phone ?? "—"}</td>
                  <td className="p-2">
                    <Link
                      href={`/portal/contacts/${c.id}`}
                      className="text-monday-blue text-sm font-medium hover:underline"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
