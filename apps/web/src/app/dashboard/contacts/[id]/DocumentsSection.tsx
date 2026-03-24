"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getDocumentsForContact,
  updateDocumentVisibleToClient,
  deleteDocument,
} from "@/app/actions/documents";
import { getContractsByContact } from "@/app/actions/contracts";
import type { DocumentRow } from "@/app/actions/documents";
import type { ContractRow } from "@/app/actions/contracts";
import { DocumentUploadZone } from "@/app/components/upload/DocumentUploadZone";
import { ProcessingStatusBadge } from "@/app/components/documents/ProcessingStatusBadge";

export function DocumentsSection({ contactId }: { contactId: string }) {
  const [list, setList] = useState<DocumentRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleToClient, setVisibleToClient] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    Promise.all([getDocumentsForContact(contactId), getContractsByContact(contactId)])
      .then(([docs, cts]) => {
        setList(docs);
        setContracts(cts);
        setVisibleToClient(
          docs.reduce((acc, d) => ({ ...acc, [d.id]: !!d.visibleToClient }), {} as Record<string, boolean>)
        );
      })
      .catch((err) => {
        setList([]);
        setContracts([]);
        setLoadError(err instanceof Error ? err.message : "Nepodařilo se načíst dokumenty.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), [contactId]);

  const filtered = useMemo(
    () =>
      search.trim()
        ? list.filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase()))
        : list,
    [list, search]
  );

  async function onToggleVisible(docId: string, value: boolean) {
    await updateDocumentVisibleToClient(docId, value);
    setVisibleToClient((prev) => ({ ...prev, [docId]: value }));
  }

  async function onDelete(docId: string) {
    if (!window.confirm("Opravdu chcete smazat tento dokument?")) return;
    await deleteDocument(docId);
    load();
  }

  if (loading) return <p className="text-slate-500 text-sm">Načítám dokumenty…</p>;
  if (loadError) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-red-600 text-sm mb-3">{loadError}</p>
        <button type="button" onClick={() => load()} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 min-h-[44px]">
          Zkusit znovu
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-slate-800 mb-4">Dokumenty</h2>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Hledat podle názvu…"
        className="w-full max-w-md rounded-[var(--wp-radius)] border border-slate-200 px-3 py-2.5 text-sm mb-4 min-h-[44px]"
      />

      <ul className="space-y-3 mb-6">
        {filtered.map((d) => (
          <li key={d.id} className="rounded-[var(--wp-radius)] border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 text-sm min-h-[44px]">
              <a href={`/api/documents/${d.id}/download`} className="font-medium text-[var(--wp-accent)] hover:underline">
                {d.name}
              </a>
              {d.tags && d.tags.length > 0 && (
                <span className="flex gap-1 flex-wrap">
                  {d.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block rounded-[var(--wp-radius-sm)] bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              )}
              <span className="text-slate-400">{new Date(d.createdAt).toLocaleDateString("cs-CZ")}</span>
              <ProcessingStatusBadge
                documentId={d.id}
                processingStatus={d.processingStatus}
                processingStage={d.processingStage}
                aiInputSource={d.aiInputSource}
                isScanLike={d.isScanLike}
                compact
              />
              <label className="flex items-center gap-1.5 text-slate-600 min-h-[44px]">
                <input
                  type="checkbox"
                  checked={visibleToClient[d.id] ?? false}
                  onChange={(e) => onToggleVisible(d.id, e.target.checked)}
                  className="rounded border-slate-300"
                />
                Viditelné klientovi
              </label>
              {d.mimeType === "application/pdf" && (
                <button
                  type="button"
                  onClick={() => setPreviewId(previewId === d.id ? null : d.id)}
                  className="text-xs font-medium px-3 py-2 rounded-[var(--wp-radius)] border border-slate-200 text-[var(--wp-accent)] hover:bg-slate-100 min-h-[44px]"
                >
                  {previewId === d.id ? "Zavřít náhled" : "Náhled"}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                className="text-xs font-medium text-red-600 hover:text-red-800 px-3 py-2 rounded-[var(--wp-radius)] hover:bg-red-50 min-h-[44px]"
              >
                Smazat
              </button>
            </div>
            {previewId === d.id && (
              <iframe
                src={`/api/documents/${d.id}/download`}
                className="mt-2 w-full rounded-[var(--wp-radius)] border border-slate-200"
                style={{ height: 400 }}
                title={`Náhled – ${d.name}`}
              />
            )}
          </li>
        ))}
      </ul>

      <DocumentUploadZone
        contactId={contactId}
        showNameInput
        showTagsInput
        showContractSelect
        showVisibleToClient
        contracts={contracts.map((c) => ({
          id: c.id,
          label: `${c.segment} – ${c.partnerName ?? "—"} (${c.contractNumber ?? c.id.slice(0, 8)})`,
        }))}
        onUploaded={() => load()}
        className="max-w-md"
      />
    </div>
  );
}
