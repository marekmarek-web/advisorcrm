"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  listInsurerTerminationRegistryAdmin,
  updateInsurerTerminationRegistryAdmin,
  type InsurerRegistryAdminRow,
} from "@/app/actions/admin-termination-registry";

export default function TerminationRegistryAdminPage() {
  const [rows, setRows] = useState<InsurerRegistryAdminRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<InsurerRegistryAdminRow> & { mailingAddressJson?: string }>({});

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void listInsurerTerminationRegistryAdmin().then((res) => {
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows(res.rows);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(r: InsurerRegistryAdminRow) {
    setEditingId(r.id);
    setDraft({
      ...r,
      mailingAddressJson: r.mailingAddress ? JSON.stringify(r.mailingAddress, null, 2) : "",
    });
  }

  function saveEdit() {
    if (!editingId) return;
    setError(null);
    startTransition(async () => {
      const res = await updateInsurerTerminationRegistryAdmin({
        id: editingId,
        registryNeedsVerification: draft.registryNeedsVerification,
        officialFormNotes: draft.officialFormNotes ?? null,
        webFormUrl: draft.webFormUrl ?? null,
        email: draft.email ?? null,
        dataBox: draft.dataBox ?? null,
        mailingAddressJson: draft.mailingAddressJson ?? null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditingId(null);
      setDraft({});
      load();
    });
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám registr…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[color:var(--wp-text)]">Registr pojišťoven – výpovědi</h1>
        <p className="text-sm text-[color:var(--wp-text-secondary)] mt-1">
          Fáze 10 masterplanu. Úpravy vyžadují oprávnění Admin (globální řádky jen role Admin). Změna „potřebuje
          ověření“ se promítá do rules engine (review).
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4"
          >
            {editingId === r.id ? (
              <div className="space-y-3 text-sm">
                <p className="font-semibold">
                  {r.insurerName}{" "}
                  <span className="text-xs font-mono text-[color:var(--wp-text-muted)]">{r.catalogKey}</span>
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.registryNeedsVerification ?? false}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, registryNeedsVerification: e.target.checked }))
                    }
                  />
                  Záznam vyžaduje ověření (review)
                </label>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                    Poznámky k formuláři
                  </label>
                  <textarea
                    value={draft.officialFormNotes ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, officialFormNotes: e.target.value }))}
                    rows={2}
                    className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                      Web formulář URL
                    </label>
                    <input
                      value={draft.webFormUrl ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, webFormUrl: e.target.value }))}
                      className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                      E-mail
                    </label>
                    <input
                      value={draft.email ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                      className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                      Datová schránka
                    </label>
                    <input
                      value={draft.dataBox ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, dataBox: e.target.value }))}
                      className="w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">
                    mailing_address (JSON)
                  </label>
                  <textarea
                    value={draft.mailingAddressJson ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, mailingAddressJson: e.target.value }))}
                    rows={5}
                    className="w-full font-mono text-xs rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void saveEdit()}
                    className="rounded-[var(--wp-radius)] bg-[var(--wp-accent)] px-4 py-2 text-sm font-semibold text-white min-h-[44px] disabled:opacity-50"
                  >
                    Uložit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setEditingId(null);
                      setDraft({});
                    }}
                    className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-4 py-2 text-sm font-semibold min-h-[44px]"
                  >
                    Zrušit
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[color:var(--wp-text)]">{r.insurerName}</p>
                  <p className="text-xs font-mono text-[color:var(--wp-text-muted)]">{r.catalogKey}</p>
                  <p className="text-xs mt-1 text-[color:var(--wp-text-secondary)]">
                    Ověření: {r.registryNeedsVerification ? "ano (review)" : "ne"}
                    {r.tenantId ? " · tenant override" : " · globální"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm font-semibold min-h-[44px]"
                >
                  Upravit
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
