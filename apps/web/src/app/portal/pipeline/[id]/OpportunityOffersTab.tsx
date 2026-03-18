"use client";

import { useState, useEffect } from "react";
import {
  getDocumentsForOpportunity,
  deleteDocument,
} from "@/app/actions/documents";
import type { DocumentRow } from "@/app/actions/documents";
import { DocumentUploadZone } from "@/app/components/upload/DocumentUploadZone";

export function OpportunityOffersTab({
  opportunityId,
  contactId,
}: {
  opportunityId: string;
  contactId: string | null;
}) {
  const [list, setList] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getDocumentsForOpportunity(opportunityId)
      .then(setList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), [opportunityId]);

  async function onDelete(id: string) {
    if (!confirm("Opravdu smazat tento dokument?")) return;
    await deleteDocument(id);
    load();
  }

  return (
    <div className="space-y-4">
      <DocumentUploadZone
        contactId={contactId ?? undefined}
        opportunityId={opportunityId}
        submitButtonLabel="Nahrát přílohu"
        onUploaded={() => load()}
      />
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
