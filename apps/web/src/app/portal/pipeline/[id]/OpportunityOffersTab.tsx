"use client";

import { useState, useEffect } from "react";
import {
  getDocumentsForOpportunity,
  uploadDocument,
  deleteDocument,
} from "@/app/actions/documents";
import type { DocumentRow } from "@/app/actions/documents";

export function OpportunityOffersTab({
  opportunityId,
  contactId,
}: {
  opportunityId: string;
  contactId: string | null;
}) {
  const [list, setList] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  function load() {
    setLoading(true);
    getDocumentsForOpportunity(opportunityId)
      .then(setList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), [opportunityId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setUploading(true);
    try {
      await uploadDocument(contactId || "", fd, {
        opportunityId,
        visibleToClient: false,
      });
      form.reset();
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nahrání se nezdařilo.");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Opravdu smazat tento dokument?")) return;
    await deleteDocument(id);
    load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 p-4 rounded-xl border border-slate-200 bg-slate-50">
        <input type="file" name="file" className="text-sm" required />
        <input type="text" name="name" placeholder="Název (volitelně)" className="rounded border border-slate-300 px-2 py-1 text-sm" />
        <button
          type="submit"
          disabled={uploading}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {uploading ? "Nahrávám…" : "Nahrát přílohu"}
        </button>
      </form>
      {loading && <p className="text-sm text-slate-500">Načítání…</p>}
      {!loading && list.length === 0 && (
        <p className="text-sm text-slate-500">Žádné přílohy. Nahrajte nabídku nebo objednávku výše.</p>
      )}
      {!loading && list.length > 0 && (
        <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100">
          {list.map((d) => (
            <li key={d.id} className="flex items-center justify-between p-3">
              <span className="text-sm text-slate-800">{d.name}</span>
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Smazat
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
