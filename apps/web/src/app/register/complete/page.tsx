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
      .then(({ redirectTo }) => {
        setStatus("done");
        router.replace(next && next.startsWith("/") ? next : redirectTo);
      })
      .catch((e) => {
        setStatus("error");
        setErrorMessage(e instanceof Error ? e.message : String(e));
      });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-monday-bg p-4">
      {status === "loading" && <p className="text-monday-text-muted">Zřizujeme váš workspace…</p>}
      {status === "error" && (
        <div className="max-w-md text-center space-y-2">
          <p className="text-red-600 font-medium">Nepodařilo se dokončit registraci. Zkuste se přihlásit znovu.</p>
          {errorMessage && (
            <p className="text-sm text-slate-600 bg-slate-100 rounded-lg p-3 font-mono break-all">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
