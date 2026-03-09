"use client";

import { useState } from "react";
import { sendClientZoneInvitation } from "@/app/actions/auth";

export function InviteToClientZoneButton({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ link?: string; error?: string } | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);
    const res = await sendClientZoneInvitation(contactId);
    setLoading(false);
    if (res.ok) setResult({ link: res.inviteLink });
    else setResult({ error: res.error });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded-xl px-4 py-2 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover disabled:opacity-50"
      >
        {loading ? "Vytvářím…" : "Poslat pozvánku do Client Zone"}
      </button>
      {result?.link && (
        <div className="rounded-lg bg-monday-row-hover border border-monday-border p-3 text-sm">
          <p className="font-medium text-monday-text mb-1">Pozvánka vytvořena</p>
          <p className="text-monday-text-muted break-all">{result.link}</p>
          <p className="text-monday-text-muted text-xs mt-1">Odkaz pošlete klientovi e-mailem (odeslání e-mailu bude v EPIC 7).</p>
        </div>
      )}
      {result?.error && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}
    </div>
  );
}
