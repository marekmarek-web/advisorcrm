"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondClientMaterialRequest } from "@/app/actions/advisor-material-requests";

export function ClientMaterialRequestRespondForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of files) {
        fd.append("files", f);
      }
      const res = await respondClientMaterialRequest(requestId, text, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setText("");
      setFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Odeslání se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white p-6 space-y-4">
      <h2 className="text-lg font-black text-[color:var(--wp-text)]">Vaše odpověď</h2>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2 text-sm"
        placeholder="Napište textovou odpověď nebo doplnění…"
      />
      <div>
        <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">Přiložit soubor (PDF, obrázky)</label>
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="text-sm w-full min-h-[44px]"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="min-h-[48px] w-full sm:w-auto rounded-xl bg-indigo-600 px-6 text-sm font-black text-white disabled:opacity-50"
      >
        {busy ? "Odesílám…" : "Odeslat odpověď"}
      </button>
    </form>
  );
}
