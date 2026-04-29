import * as Sentry from "@sentry/nextjs";

/**
 * User-visible Czech copy for production errors where Next.js omits details
 * or surfaces generic RSC failure messages.
 *
 * Další funkce řeší běžné chyby server actions / klient‑server nesouladu.
 */

/**
 * Next.js případ: klient drží staré ID serverové akce (často při probíhajícím compile ve vývoji
 * nebo po deployi před reloadem).
 * @see https://nextjs.org/docs/messages/failed-to-find-server-action
 */
export function getFailedServerActionFriendlyMessage(raw: unknown, fallback = "Nepodařilo se dokončit požadavek."): string {
  const msg = raw instanceof Error ? raw.message.trim() : String(raw).trim();
  if (
    /was not found on the server/i.test(msg) ||
    /failed[_-]?to[_-]?find[_-]?server[_-]?action/i.test(msg) ||
    /\bfailed-to-find-server-action\b/i.test(msg)
  ) {
    return (
      "Prohlížeč má uložený starší stav aplikace a neshoduje se s vyhlášenými akcemi na serveru. " +
      "Zkuste „Zkusit znovu“ nebo celé obnovení stránky. Ve vývojovém režimu se to často projeví během probíhající kompilace."
    );
  }
  return msg || fallback;
}

export function getActionFriendlyErrorMessage(e: unknown, fallback: string): string {
  const err = e instanceof Error ? e : null;
  const msg = (err?.message ?? (typeof e === "string" ? e : "")).trim();
  const digest =
    err && typeof (err as Error & { digest?: string }).digest === "string"
      ? String((err as Error & { digest?: string }).digest)
      : "";

  const isProd = process.env.NODE_ENV === "production";
  const isGenericProd =
    isProd &&
    (/\bserver components\b/i.test(msg) ||
      msg.includes("omitted in production") ||
      msg.includes("digest property") ||
      (!msg && digest.length > 0));

  if (isGenericProd) {
    const digestInfo = digest ? ` (kód: ${digest.slice(0, 12)})` : "";
    return (
      `Chyba serveru${digestInfo} — server action vrátil 500.\n` +
      "Možné příčiny: chybí tabulky messages v Supabase, nebo deploy na Vercelu ještě neskončil.\n" +
      "1) Zkontroluj Vercel dashboard → zda poslední build proběhl úspěšně.\n" +
      "2) Jdi na /api/messages/health (zobrazí přesný stav DB).\n" +
      "3) Pokud tabulky chybí: Supabase → SQL Editor → spusť packages/db/migrations/portal_messages_tables.sql."
    );
  }
  if (msg) return msg;
  if (digest && isProd) {
    return `Chyba serveru (${digest.slice(0, 12)}) — viz Vercel function logy nebo /api/messages/health.`;
  }
  return fallback;
}

export function getPortalFriendlyErrorMessage(error: Error & { digest?: string }): string {
  const isProd = process.env.NODE_ENV === "production";
  const msg = (error.message ?? "").trim();
  const isGenericProdMessage =
    isProd &&
    (msg.includes("omitted in production") ||
      msg.includes("digest") ||
      msg.includes("Server Components") ||
      msg.includes("server components") ||
      !msg);
  const isServerRenderProd =
    isProd && (msg.includes("Server Components") || msg.includes("server components"));

  if (isServerRenderProd) {
    return "Načtení portálu selhalo — často jde o nesoulad databáze s nasazenou verzí (např. chybějící migrace). Zkuste znovu; pokud to trvá, kontaktujte správce nebo spusťte migrace podle provozní příručky.";
  }
  if (isGenericProdMessage) {
    return "Došlo k chybě na serveru nebo při vykreslení stránky. Zkuste znovu nebo se vraťte na přehled portálu.";
  }
  return msg || "Nastala neočekávaná chyba.";
}

export type AppErrorCaptureContext = {
  boundary: string;
  /** Current path when available (client). */
  route?: string;
  digest?: string;
  componentStack?: string | null;
  /** Další Sentry tagy (např. `{ app_zone: "client" }` pro filtr v dashboardu). */
  tags?: Record<string, string>;
};

/**
 * Report to Sentry with stable tags for triage. Safe no-op if Sentry is unavailable.
 */
export function captureAppError(error: unknown, context: AppErrorCaptureContext): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    Sentry.withScope((scope) => {
      scope.setTag("error_boundary", context.boundary);
      if (context.tags) {
        for (const [k, v] of Object.entries(context.tags)) {
          scope.setTag(k, v);
        }
      }
      if (context.route) scope.setTag("route", context.route);
      if (context.componentStack) {
        scope.setContext("react", { componentStack: context.componentStack });
      }
      const digest = context.digest ?? (err as Error & { digest?: string }).digest;
      if (digest) scope.setTag("digest", String(digest));
      Sentry.captureException(err);
    });
  } catch {
    /* ignore */
  }
}
