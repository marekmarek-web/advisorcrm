"use client";

/**
 * Delta A9+A11 — Force update gate overlay.
 *
 * Mount v Capacitor shellu (typicky v kořenovém layoutu portálu, NEBO v
 * `MobilePortalClient`). Komponenta automaticky:
 *   1. Při mountu zjistí native app verzi a porovná s MIN / CURRENT env hodnotami.
 *   2. Při `forceUpdate: true` vykreslí full-screen non-dismissable overlay.
 *   3. Při `softUpdate: true` vykreslí tenký informační banner (dismissable).
 *   4. Na web platformě nedělá nic.
 */

import { useEffect, useState, type ReactElement } from "react";
import { checkAppVersion, type VersionCheckResult } from "@/lib/capacitor/app-version-gate";

type DisplayState = null | { kind: "force" | "soft"; result: VersionCheckResult };

export function ForceUpdateGate(): ReactElement | null {
  const [state, setState] = useState<DisplayState>(null);
  const [softDismissed, setSoftDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await checkAppVersion();
      if (!mounted || !res || !res.ok) return;
      if (res.forceUpdate) {
        setState({ kind: "force", result: res });
      } else if (res.softUpdate) {
        setState({ kind: "soft", result: res });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!state) return null;

  if (state.kind === "force") {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="force-update-title"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 p-6"
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
          <h2 id="force-update-title" className="text-xl font-black tracking-tight text-slate-950">
            Aktualizace aplikace je nutná
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{state.result.messageCs}</p>
          <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-xs">
            <div>
              <dt className="font-semibold text-slate-500">Vaše verze</dt>
              <dd className="mt-1 font-mono text-slate-900">{state.result.clientVersion}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Požadovaná min.</dt>
              <dd className="mt-1 font-mono text-slate-900">{state.result.minimum ?? "—"}</dd>
            </div>
          </dl>
          {state.result.storeUrl ? (
            <a
              href={state.result.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 block w-full rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Otevřít obchod a aktualizovat
            </a>
          ) : (
            <p className="mt-6 text-center text-xs text-slate-500">
              Aktualizaci najdete v App Store nebo Google Play.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Soft update banner.
  if (softDismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9998] border-t border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="text-xs text-amber-900 sm:text-sm">
          <strong className="font-bold">Nová verze aplikace.</strong>{" "}
          <span className="hidden sm:inline">{state.result.messageCs}</span>
        </div>
        <div className="flex items-center gap-2">
          {state.result.storeUrl ? (
            <a
              href={state.result.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-800"
            >
              Aktualizovat
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setSoftDismissed(true)}
            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
          >
            Později
          </button>
        </div>
      </div>
    </div>
  );
}
