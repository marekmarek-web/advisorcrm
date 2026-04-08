/**
 * Bezpečný přehled pro health endpointy a lokální diagnostiku — žádné tajné klíče ani DSN řetězce.
 */

export type SentryObservabilityStatus = {
  /** Server/edge inicializuje Sentry, pokud je nastaven SENTRY_DSN nebo NEXT_PUBLIC_SENTRY_DSN. */
  serverOrEdgeDsnConfigured: boolean;
  /** Prohlížeč má vlastní init jen z NEXT_PUBLIC_SENTRY_DSN. */
  browserDsnConfigured: boolean;
  environment: string;
  /** Server/edge: SENTRY_DEBUG=true — verbose log v Node (ne v prohlížeči). */
  serverSdkDebug: boolean;
  /** Klient: NEXT_PUBLIC_SENTRY_DEBUG=true — verbose log v konzoli prohlížeče. */
  browserSdkDebug: boolean;
};

export type LangfuseObservabilityStatus = {
  /** Oba klíče + LANGFUSE_ENABLED není explicitně "false". */
  likelyEnabled: boolean;
  /** Host pro API (prázdné = výchozí instance Langfuse SDK, typicky cloud). */
  hostLabel: string;
  environment: string;
};

export function getSentryObservabilityStatus(): SentryObservabilityStatus {
  const serverOrEdge = Boolean(
    process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim(),
  );
  const browser = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
  return {
    serverOrEdgeDsnConfigured: serverOrEdge,
    browserDsnConfigured: browser,
    environment:
      process.env.VERCEL_ENV ??
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() ??
      process.env.NODE_ENV ??
      "unknown",
    serverSdkDebug: process.env.SENTRY_DEBUG === "true",
    browserSdkDebug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "true",
  };
}

export function getLangfuseObservabilityStatus(): LangfuseObservabilityStatus {
  const sk = Boolean(process.env.LANGFUSE_SECRET_KEY?.trim());
  const pk = Boolean(process.env.LANGFUSE_PUBLIC_KEY?.trim());
  const disabled = process.env.LANGFUSE_ENABLED?.trim().toLowerCase() === "false";
  const host = process.env.LANGFUSE_HOST?.trim();
  return {
    likelyEnabled: sk && pk && !disabled,
    hostLabel: host && host.length > 0 ? host : "(sdk default — obvykle https://cloud.langfuse.com)",
    environment:
      process.env.LANGFUSE_ENVIRONMENT?.trim() ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV ||
      "unknown",
  };
}

/** Základ URL Langfuse API pro health check (bez koncového slash). */
export function resolveLangfuseHealthBaseUrl(): string {
  const h = process.env.LANGFUSE_HOST?.trim();
  if (h) return h.replace(/\/$/, "");
  return "https://cloud.langfuse.com";
}

/**
 * Ověří dostupnost Langfuse HTTP API (veřejný health). Neověřuje platnost klíčů.
 * @returns null pokud Langfuse vůbec není nakonfigurován (nemá smysl pingovat).
 */
export async function checkLangfuseHostReachable(): Promise<boolean | null> {
  const st = getLangfuseObservabilityStatus();
  if (!st.likelyEnabled) return null;
  const base = resolveLangfuseHealthBaseUrl();
  try {
    const res = await fetch(`${base}/api/public/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
