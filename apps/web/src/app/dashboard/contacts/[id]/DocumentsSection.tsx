"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getDocumentsForContact,
  updateDocumentVisibleToClient,
  uploadDocument,
  deleteDocument,
} from "@/app/actions/documents";
import { getContractsByContact } from "@/app/actions/contracts";
import type { DocumentRow } from "@/app/actions/documents";
import type { ContractRow } from "@/app/actions/contracts";

export function DocumentsSection({ contactId }: { contactId: string }) {
  const [list, setList] = useState<DocumentRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [visibleToClient, setVisibleToClient] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([getDocumentsForContact(contactId), getContractsByContact(contactId)])
      .then(([docs, cts]) => {
        setList(docs);
        setContracts(cts);
        setVisibleToClient(
          docs.reduce((acc, d) => ({ ...acc, [d.id]: !!d.visibleToClient }), {} as Record<string, boolean>)
        );
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const tagsRaw = (fd.get("tags") as string) || "";
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setUploading(true);
    try {
      await uploadDocument(contactId, fd, {
        contractId: (fd.get("contractId") as string) || undefined,
        visibleToClient: fd.get("visibleToClient") === "on",
        tags,
      });
      form.reset();
      load();
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">Načítám dokumenty…</p>;

  return (
    <div className="rounded-[var(--wp-radius-sm)] border border-monday-border bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-slate-800 mb-2">Dokumenty</h2>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Hledat podle názvu…"
        className="w-full max-w-md rounded-lg border border-monday-border px-3 py-1.5 text-sm mb-4"
      />

      <ul className="space-y-2 mb-4">
        {filtered.map((d) => (
          <li key={d.id}>
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <a href={`/api/documents/${d.id}/download`} className="font-medium text-monday-blue">
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
              <label className="flex items-center gap-1.5 text-slate-600">
                <input
                  type="checkbox"
                  checked={visibleToClient[d.id] ?? false}
                  onChange={(e) => onToggleVisible(d.id, e.target.checked)}
                />
                Viditelné klientovi
              </label>
              {d.mimeType === "application/pdf" && (
                <button
                  type="button"
                  onClick={() => setPreviewId(previewId === d.id ? null : d.id)}
                  className="text-xs font-medium px-2 py-0.5 rounded border border-monday-border text-monday-blue hover:bg-slate-50"
                >
                  {previewId === d.id ? "Zavřít náhled" : "Náhled"}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                className="text-xs font-medium text-red-600 hover:text-red-800"
              >
                Smazat
              </button>
            </div>
            {previewId === d.id && (
              <iframe
                src={`/api/documents/${d.id}/download`}
                className="mt-2 w-full rounded border border-monday-border"
                style={{ height: 400 }}
                title={`Náhled – ${d.name}`}
              />
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={onSubmit} className="space-y-2 max-w-md">
        <div>
          <label className="block text-xs font-medium text-slate-500">Název (volitelně)</label>
          <input name="name" className="w-full rounded border border-monday-border px-2 py-1.5 text-sm" placeholder="název dokumentu" />
        </div>
        <div>
          <input name="file" type="file" required accept=".pdf,image/*" className="text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Tagy (oddělené čárkou)</label>
          <input
            name="tags"
            className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
            placeholder="např. smlouva, příloha"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Smlouva</label>
          <select name="contractId" className="w-full rounded border border-monday-border px-2 py-1.5 text-sm">
            <option value="">— žádná —</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.segment} – {c.partnerName ?? "—"} ({c.contractNumber ?? c.id.slice(0, 8)})
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input name="visibleToClient" type="checkbox" />
          Viditelné klientovi
        </label>
        <button
          type="submit"
          disabled={uploading}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-white bg-monday-blue disabled:opacity-50"
        >
          {uploading ? "Nahrávám…" : "Nahrát dokument"}
        </button>
      </form>
    </div>
  );
}
