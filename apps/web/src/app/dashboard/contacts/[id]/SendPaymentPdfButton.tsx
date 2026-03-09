"use client";

import { useState } from "react";
import { sendPaymentPdfToClient } from "@/app/actions/payment-pdf";

export function SendPaymentPdfButton({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<"success" | "error" | null>(null);
  const [errorText, setErrorText] = useState("");

  async function handleClick() {
    setLoading(true);
    setMessage(null);
    const res = await sendPaymentPdfToClient(contactId);
    setLoading(false);
    if (res.ok) setMessage("success");
    else {
      setMessage("error");
      setErrorText(res.error);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded-xl px-4 py-2 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover disabled:opacity-50"
      >
        {loading ? "Odesílám…" : "Odeslat platební PDF e-mailem"}
      </button>
      {message === "success" && <p className="text-sm text-green-600">E-mail s přílohou odeslán.</p>}
      {message === "error" && <p className="text-sm text-red-600">{errorText}</p>}
    </div>
  );
}
