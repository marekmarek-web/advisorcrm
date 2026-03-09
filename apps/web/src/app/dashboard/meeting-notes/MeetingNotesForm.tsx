"use client";

import { useState, useEffect } from "react";
import { createMeetingNote, updateMeetingNote } from "@/app/actions/meeting-notes";
import type { TemplateRow, MeetingNoteDetail } from "@/app/actions/meeting-notes";
import type { ContactRow } from "@/app/actions/contacts";

export function MeetingNotesForm({
  templates,
  contacts,
  editingNote,
  onSaved,
  onCancel,
}: {
  templates: TemplateRow[];
  contacts: ContactRow[];
  editingNote?: MeetingNoteDetail | null;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [contactId, setContactId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [domain, setDomain] = useState("hypo");
  const [cas, setCas] = useState("");
  const [ucastnici, setUcastnici] = useState("");
  const [obsah, setObsah] = useState("");
  const [doporuceni, setDoporuceni] = useState("");
  const [dalsiKroky, setDalsiKroky] = useState("");

  function contentToFields(c: unknown): { cas: string; ucastnici: string; obsah: string; doporuceni: string; dalsi_kroky: string } {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const o = c as Record<string, unknown>;
      return {
        cas: typeof o.cas === "string" ? o.cas : "",
        ucastnici: typeof o.ucastnici === "string" ? o.ucastnici : "",
        obsah: typeof o.obsah === "string" ? o.obsah : "",
        doporuceni: typeof o.doporuceni === "string" ? o.doporuceni : "",
        dalsi_kroky: typeof o.dalsi_kroky === "string" ? o.dalsi_kroky : "",
      };
    }
    return { cas: "", ucastnici: "", obsah: "", doporuceni: "", dalsi_kroky: "" };
  }

  useEffect(() => {
    if (editingNote) {
      setContactId(editingNote.contactId);
      setTemplateId(editingNote.templateId ?? "");
      setMeetingAt(
        new Date(editingNote.meetingAt).toISOString().slice(0, 16)
      );
      setDomain(editingNote.domain);
      const f = contentToFields(editingNote.content);
      setCas(f.cas);
      setUcastnici(f.ucastnici);
      setObsah(f.obsah);
      setDoporuceni(f.doporuceni);
      setDalsiKroky(f.dalsi_kroky);
    } else {
      setContactId("");
      setTemplateId("");
      setMeetingAt("");
      setDomain("hypo");
      setCas("");
      setUcastnici("");
      setObsah("");
      setDoporuceni("");
      setDalsiKroky("");
    }
  }, [editingNote]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const parsed: Record<string, unknown> = {
      cas: cas.trim(),
      ucastnici: ucastnici.trim(),
      obsah: obsah.trim(),
      doporuceni: doporuceni.trim(),
      dalsi_kroky: dalsiKroky.trim(),
    };

    try {
      if (editingNote) {
        await updateMeetingNote(editingNote.id, {
          content: parsed,
          domain,
          meetingAt: meetingAt || new Date().toISOString().slice(0, 16),
        });
      } else {
        await createMeetingNote({
          contactId,
          templateId,
          meetingAt: meetingAt || new Date().toISOString().slice(0, 16),
          domain,
          content: parsed,
        });
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-monday-border bg-white p-6 shadow-sm space-y-4 max-w-lg">
      <h3 className="font-semibold text-slate-800">
        {editingNote ? "Upravit zápisek" : "Nový zápisek"}
      </h3>
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1">Kontakt *</label>
        <select
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          required
          disabled={!!editingNote}
          className="w-full rounded-lg border border-monday-border px-3 py-2 disabled:opacity-60"
        >
          <option value="">— vyberte —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
          ))}
        </select>
      </div>
      {!editingNote && (
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1">Šablona</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-lg border border-monday-border px-3 py-2"
          >
            <option value="">— žádná —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.domain})</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1">Datum schůzky *</label>
        <input
          type="datetime-local"
          value={meetingAt}
          onChange={(e) => setMeetingAt(e.target.value)}
          required
          className="w-full rounded-lg border border-monday-border px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1">Doména</label>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="w-full rounded-lg border border-monday-border px-3 py-2"
        >
          <option value="hypo">hypo</option>
          <option value="invest">invest</option>
          <option value="pojist">pojist</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1">Čas</label>
        <input
          type="text"
          value={cas}
          onChange={(e) => setCas(e.target.value)}
          placeholder="např. 10:00–11:00"
          className="w-full rounded-lg border border-monday-border px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1">Účastníci</label>
        <input
          type="text"
          value={ucastnici}
          onChange={(e) => setUcastnici(e.target.value)}
          placeholder="jména účastníků schůzky"
          className="w-full rounded-lg border border-monday-border px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1">Obsah</label>
        <textarea
          value={obsah}
          onChange={(e) => setObsah(e.target.value)}
          rows={3}
          placeholder="co se na schůzce probíralo"
          className="w-full rounded-lg border border-monday-border px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1">Doporučení</label>
        <textarea
          value={doporuceni}
          onChange={(e) => setDoporuceni(e.target.value)}
          rows={2}
          placeholder="doporučení pro klienta"
          className="w-full rounded-lg border border-monday-border px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1">Další kroky</label>
        <textarea
          value={dalsiKroky}
          onChange={(e) => setDalsiKroky(e.target.value)}
          rows={2}
          placeholder="co dál"
          className="w-full rounded-lg border border-monday-border px-3 py-2"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-monday-blue disabled:opacity-50"
        >
          {loading
            ? "Ukládám…"
            : editingNote
              ? "Uložit změny"
              : "Uložit zápisek"}
        </button>
        {editingNote && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-semibold border border-monday-border text-slate-600 hover:bg-slate-50"
          >
            Zrušit
          </button>
        )}
      </div>
    </form>
  );
}
