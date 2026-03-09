"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureMembership } from "@/app/actions/auth";

export default function RegisterCompletePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
    ensureMembership()
      .then((result) => {
        if (!result || typeof result !== "object") {
          setStatus("error");
          setErrorMessage("Server nevrátil odpověď. Zkontrolujte na Vercelu env: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.");
          return;
        }
        if (result.ok) {
          setStatus("done");
          router.replace(next && next.startsWith("/") ? next : result.redirectTo);
        } else {
          if (result.redirectTo) {
            window.location.href = result.redirectTo;
            return;
          }
          setStatus("error");
          setErrorMessage(result.error || "Nepodařilo se dokončit registraci.");
        }
      })
      .catch((e) => {
        setStatus("error");
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMessage(msg || "Chyba serveru. Na Vercelu v Deployment → Functions / Runtime Logs zkontroluj chybovou hlášku.");
      });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-monday-bg p-4">
      {status === "loading" && <p className="text-monday-text-muted">Zřizujeme váš workspace…</p>}
      {status === "error" && (
        <div className="max-w-md text-center space-y-4">
          <p className="text-red-600 font-medium">Nepodařilo se dokončit registraci.</p>
          {errorMessage && (
            <p className="text-sm text-slate-600 bg-slate-100 rounded-lg p-3 font-mono break-all text-left">
              {errorMessage}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <a href="/login" className="text-sm font-semibold text-indigo-600 hover:underline">
              Zpět na přihlášení
            </a>
            <button
              type="button"
              onClick={() => { setStatus("loading"); setErrorMessage(""); window.location.reload(); }}
              className="text-sm font-semibold text-slate-600 hover:underline"
            >
              Zkusit znovu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
