"use client";

import { useState } from "react";
import { sendClientZoneInvitation } from "@/app/actions/auth";

export function InviteToClientZoneButton({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    link?: string;
    emailSent?: boolean;
    emailError?: string;
    error?: string;
  } | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);
    try {
      const res = await sendClientZoneInvitation(contactId);
      if (res.ok) {
        setResult({
          link: res.inviteLink,
          emailSent: res.emailSent,
          emailError: res.emailError,
        });
      } else {
        setResult({ error: res.error });
      }
    } catch {
      setResult({ error: "Nepodařilo se odeslat pozvánku. Zkuste to znovu." });
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!result?.link) return;
    try {
      await navigator.clipboard.writeText(result.link);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover disabled:opacity-50"
      >
        {loading ? "Odesílám…" : "Pozvat do klientské zóny (e-mail + odkaz)"}
      </button>
      {result?.link && (
        <div className="rounded-lg bg-monday-row-hover border border-monday-border p-3 text-sm space-y-2">
          <p className="font-medium text-monday-text">
            {result.emailSent ? "Pozvánka odeslána na e-mail klienta." : "E-mail se nepodařilo odeslat automaticky."}
          </p>
          {!result.emailSent && (
            <p className="text-monday-text-muted text-xs">
              {result.emailError === "RESEND_API_KEY not set"
                ? "Nastavte RESEND_API_KEY (a ověřenou doménu odesílatele), nebo zkopírujte odkaz níže a pošlete klientovi sami."
                : result.emailError
                  ? `Důvod: ${result.emailError}. Zkopírujte odkaz a pošlete klientovi.`
                  : "Zkopírujte odkaz a pošlete klientovi sami."}
            </p>
          )}
          <p className="text-monday-text-muted break-all text-xs">{result.link}</p>
          <button
            type="button"
            onClick={copyLink}
            className="min-h-[44px] w-full sm:w-auto rounded-lg border border-monday-border px-4 py-2 text-sm font-medium text-monday-text hover:bg-monday-row-hover"
          >
            Zkopírovat odkaz
          </button>
        </div>
      )}
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
    </div>
  );
}
