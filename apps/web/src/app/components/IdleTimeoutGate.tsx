"use client";

/**
 * Delta A29 — Advisor session idle timeout + re-auth prompt.
 *
 * Chování:
 *   1. Po X minutách nečinnosti (default 30) se spustí timer.
 *   2. Při detekci nečinnosti zobrazíme non-dismissable prompt ("Zůstat přihlášen?")
 *      s 60s countdown. Pokud user klikne "Pokračovat", timer se resetuje.
 *   3. Pokud countdown vyprší, přesměrujeme na `/api/auth/sign-out` a pak
 *      `/prihlaseni?reason=idle_timeout&return=<path>`.
 *
 * Události registrované jako aktivita: pointer, keydown, scroll, visibilitychange.
 * Z ops pohledu: příštì máme access log Supabase; po timeoutu refresh_token zůstane,
 * ale tento gate přidává vrstvu pro zařízení sdílená v kanceláři.
 *
 * Ne-aplikovatelné pro Client role — klientský portál je lowriskový a obvykle si
 * klienti sedí sami na telefonu. Pro advisor + back-office trpělivý timeout stačí.
 *
 * ENV override:
 *   NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES          (default 30)
 *   NEXT_PUBLIC_IDLE_PROMPT_COUNTDOWN_SECONDS (default 60)
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { signOutAndRedirectClient } from "@/lib/auth/sign-out-client";

const DEFAULT_IDLE_MINUTES = 30;
const DEFAULT_COUNTDOWN_SECONDS = 60;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;

function readMinutes(): number {
  const raw = process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES?.trim();
  if (!raw) return DEFAULT_IDLE_MINUTES;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_IDLE_MINUTES;
  return Math.min(parsed, 240);
}

function readCountdownSeconds(): number {
  const raw = process.env.NEXT_PUBLIC_IDLE_PROMPT_COUNTDOWN_SECONDS?.trim();
  if (!raw) return DEFAULT_COUNTDOWN_SECONDS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_COUNTDOWN_SECONDS;
  return Math.min(parsed, 300);
}

export function IdleTimeoutGate(): ReactElement | null {
  const router = useRouter();
  const idleMinutes = useRef(readMinutes());
  const countdownSec = useRef(readCountdownSeconds());

  const [promptOpen, setPromptOpen] = useState(false);
  const [remaining, setRemaining] = useState(countdownSec.current);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAll = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const signOutAndRedirect = useCallback(async () => {
    clearAll();
    const returnTo =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : "/portal/today";
    try {
      // Nejdřív čistý signOut přes Supabase (revoke push token + clear cookies).
      await signOutAndRedirectClient({
        push: () => {},
        refresh: () => {},
      });
    } catch {
      // Pokračujeme i při selhání — redirect na /prihlaseni ukončí relaci.
    }
    const qs = new URLSearchParams({ reason: "idle_timeout", return: returnTo });
    if (typeof window !== "undefined") {
      window.location.href = `/prihlaseni?${qs.toString()}`;
    } else {
      router.push(`/prihlaseni?${qs.toString()}`);
    }
  }, [clearAll, router]);

  const startIdleTimer = useCallback(() => {
    clearAll();
    idleTimerRef.current = setTimeout(
      () => {
        setPromptOpen(true);
        setRemaining(countdownSec.current);
        countdownTimerRef.current = setInterval(() => {
          setRemaining((r) => {
            if (r <= 1) {
              void signOutAndRedirect();
              return 0;
            }
            return r - 1;
          });
        }, 1000);
      },
      idleMinutes.current * 60_000,
    );
  }, [clearAll, signOutAndRedirect]);

  const handleActivity = useCallback(() => {
    if (promptOpen) return; // do not silently reset while prompt is shown
    startIdleTimer();
  }, [promptOpen, startIdleTimer]);

  useEffect(() => {
    startIdleTimer();
    const opts: AddEventListenerOptions = { passive: true };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handleActivity, opts);
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, handleActivity);
      }
      clearAll();
    };
  }, [handleActivity, startIdleTimer, clearAll]);

  const continueSession = useCallback(() => {
    setPromptOpen(false);
    startIdleTimer();
  }, [startIdleTimer]);

  if (!promptOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-timeout-title"
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/80 p-6"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h2 id="idle-timeout-title" className="text-xl font-black tracking-tight text-slate-950">
          Relace se chystá vypršet
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Z bezpečnostních důvodů vás za <strong className="font-mono text-slate-900">{remaining}</strong> s
          odhlásíme kvůli nečinnosti. Chcete pokračovat v&nbsp;práci?
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            autoFocus
            onClick={continueSession}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Pokračovat
          </button>
          <button
            type="button"
            onClick={() => void signOutAndRedirect()}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Odhlásit se
          </button>
        </div>
      </div>
    </div>
  );
}
