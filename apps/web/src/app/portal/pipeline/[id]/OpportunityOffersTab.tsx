"use client";

import { useState, useEffect } from "react";
import { FileText, Trash2 } from "lucide-react";
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4 sm:p-6">
        <DocumentUploadZone
          contactId={contactId ?? undefined}
          opportunityId={opportunityId}
          submitButtonLabel="Nahrát přílohu"
          className="border-0 bg-transparent p-0 shadow-none"
          onUploaded={() => load()}
        />
      </div>
      {loading && <p className="text-sm font-medium text-slate-500">Načítání…</p>}
      {!loading && list.length === 0 && (
        <p className="text-sm font-medium text-slate-500 rounded-2xl border border-slate-100 bg-white p-5">
          Žádné přílohy. Nahrajte nabídku nebo objednávku výše.
        </p>
      )}
      {!loading && list.length > 0 && (
        <ul className="space-y-3">
          {list.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-slate-100 bg-white shadow-sm min-h-[56px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <FileText size={18} aria-hidden />
                </div>
                <span className="text-sm font-bold text-slate-800 truncate">{d.name}</span>
              </div>
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-xs uppercase tracking-wider shrink-0"
                aria-label={`Smazat ${d.name}`}
              >
                <Trash2 size={18} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
