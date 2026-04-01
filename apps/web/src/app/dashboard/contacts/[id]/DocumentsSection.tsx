"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  updateDocumentVisibleToClient,
  deleteDocument,
} from "@/app/actions/documents";
import type { DocumentRow } from "@/app/actions/documents";
import { fetchContactDocumentsBundle } from "@/app/dashboard/contacts/contact-documents-bundle";
import { DocumentUploadZone } from "@/app/components/upload/DocumentUploadZone";
import { DocumentPdfPreviewDialog } from "../../../components/documents/DocumentPdfPreviewDialog";
import { ProcessingStatusBadge } from "../../../components/documents/ProcessingStatusBadge";
import { useConfirm } from "@/app/components/ConfirmDialog";

export function DocumentsSection({ contactId }: { contactId: string }) {
  const askConfirm = useConfirm();
  const queryClient = useQueryClient();
  const qk = queryKeys.contacts.documentsBundle(contactId);

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: qk,
    queryFn: () => fetchContactDocumentsBundle(contactId),
    staleTime: 45_000,
  });

  const list = data?.docs ?? [];
  const contracts = data?.contracts ?? [];

  const [visibleToClient, setVisibleToClient] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!data?.docs) return;
    setVisibleToClient(
      data.docs.reduce((acc, d) => ({ ...acc, [d.id]: !!d.visibleToClient }), {} as Record<string, boolean>)
    );
  }, [data?.docs]);

  const invalidateBundle = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk });
  }, [queryClient, qk]);

  const [search, setSearch] = useState("");
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);

  const filtered = useMemo(
    () =>
      search.trim()
        ? list.filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase()))
        : list,
    [list, search]
  );

  async function handleToggleVisibleToClient(docId: string, value: boolean) {
    await updateDocumentVisibleToClient(docId, value);
    setVisibleToClient((prev) => ({ ...prev, [docId]: value }));
  }

  async function onDelete(docId: string) {
    if (
      !(await askConfirm({
        title: "Smazat dokument",
        message: "Opravdu chcete smazat tento dokument?",
        confirmLabel: "Smazat",
        variant: "destructive",
      }))
    ) {
      return;
    }
    await deleteDocument(docId);
    invalidateBundle();
  }

  const loadError = isError ? (error instanceof Error ? error.message : "Nepodařilo se načíst dokumenty.") : null;
  const showInitialSpinner = isPending && !data;

  if (showInitialSpinner) {
    return <p className="text-[color:var(--wp-text-muted)] text-sm">Načítám dokumenty…</p>;
  }
  if (loadError && !data) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-red-600 text-sm mb-3">{loadError}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 min-h-[44px]"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h2 className="font-semibold text-[color:var(--wp-text)]">Dokumenty</h2>
        {isFetching && data && (
          <span className="text-xs text-[color:var(--wp-text-muted)]" aria-live="polite">
            Aktualizuji…
          </span>
        )}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Hledat podle názvu…"
        className="w-full max-w-md rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2.5 text-sm mb-4 min-h-[44px]"
      />

      <ul className="space-y-3 mb-6">
        {filtered.map((d) => (
          <li key={d.id} className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 text-sm min-h-[44px]">
              <a href={`/api/documents/${d.id}/download`} className="font-medium text-[var(--wp-accent)] hover:underline">
                {d.name}
              </a>
              {d.tags && d.tags.length > 0 && (
                <span className="flex gap-1 flex-wrap">
                  {d.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block rounded-[var(--wp-radius-sm)] bg-[color:var(--wp-surface-inset)] px-2 py-0.5 text-xs text-[color:var(--wp-text-muted)]"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              )}
              <span className="text-[color:var(--wp-text-muted)]">{new Date(d.createdAt).toLocaleDateString("cs-CZ")}</span>
              <ProcessingStatusBadge
                documentId={d.id}
                processingStatus={d.processingStatus}
                processingStage={d.processingStage}
                aiInputSource={d.aiInputSource}
                isScanLike={d.isScanLike}
                compact
              />
              <label className="flex items-center gap-1.5 text-[color:var(--wp-text-muted)] min-h-[44px]">
                <input
                  type="checkbox"
                  checked={visibleToClient[d.id] ?? false}
                  onChange={(e) => handleToggleVisibleToClient(d.id, e.target.checked)}
                  className="rounded border-[color:var(--wp-border-strong)]"
                />
                Viditelné klientovi
              </label>
              {d.mimeType === "application/pdf" && (
                <button
                  type="button"
                  onClick={() => setPreviewDoc(d)}
                  className="text-xs font-medium px-3 py-2 rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] text-[var(--wp-accent)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
                >
                  Náhled
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
        onUploaded={() => invalidateBundle()}
        className="max-w-md"
      />

      <DocumentPdfPreviewDialog
        doc={previewDoc}
        visibleToClient={previewDoc ? (visibleToClient[previewDoc.id] ?? false) : false}
        onClose={() => setPreviewDoc(null)}
        onToggleVisible={(value) => {
          if (!previewDoc) return;
          void handleToggleVisibleToClient(previewDoc.id, value);
        }}
        downloadHref={previewDoc ? `/api/documents/${previewDoc.id}/download` : ""}
      />
    </div>
  );
}
