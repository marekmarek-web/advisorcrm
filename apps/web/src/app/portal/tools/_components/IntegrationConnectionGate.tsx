"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Provider = "gmail" | "drive";

type Status = {
  connected: boolean;
  email?: string;
  error?: string;
};

export function IntegrationConnectionGate({
  provider,
  children,
}: {
  provider: Provider;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(provider === "gmail" ? "/api/gmail/status" : "/api/drive/status")
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (!active) return;
        setStatus({
          connected: Boolean(data.connected),
          email: data.email,
          error: data.error,
        });
      })
      .catch(() => {
        if (!active) return;
        setStatus({ connected: false, error: "Nepodařilo se načíst stav integrace." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [provider]);

  const connectHref = useMemo(
    () => (provider === "gmail" ? "/api/integrations/gmail/connect" : "/api/integrations/google-drive/connect"),
    [provider]
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Načítám stav propojení…
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-bold text-slate-900">
          {provider === "gmail" ? "Gmail není připojený" : "Google Drive není připojený"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Pro práci v tomto workspace je potřeba nejdřív propojit váš Google účet.
        </p>
        {status?.error ? <p className="mt-2 text-sm text-amber-700">{status.error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={connectHref}
            className="min-h-[44px] rounded-xl bg-aidv-create px-4 py-2.5 text-sm font-bold text-white"
          >
            Připojit Google účet
          </a>
          <Link
            href={`/portal/setup?tab=integrace&provider=${provider === "gmail" ? "gmail" : "google-drive"}`}
            className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"
          >
            Otevřít Integrace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
        Připojeno jako {status.email ?? "Google účet"}
      </p>
      {children}
    </div>
  );
}
