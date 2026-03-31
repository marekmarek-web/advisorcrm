/**
 * Server-side service for Google Calendar integration: load/save tokens, enforce auth.
 * Tokeny nikdy nevystavujeme do frontendu.
 */

import { db, userGoogleCalendarIntegrations } from "db";
import { eq, and } from "db";
import { encrypt, decrypt } from "./encrypt";
import { refreshAccessToken } from "./google-calendar";
import { GoogleInvalidGrantError } from "./google-oauth";

const LOG_PREFIX = "[google-calendar-integration]";

function log(message: string, meta?: Record<string, unknown>) {
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} ${message}${payload}`);
}

function logError(message: string, err?: unknown) {
  const detail = err instanceof Error ? err.message : err;
  // eslint-disable-next-line no-console
  console.error(`${LOG_PREFIX} ${message}`, detail);
}

export type IntegrationTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  scope?: string;
  googleEmail?: string | null;
};

/**
 * Vrátí aktivní integraci pro uživatele v rámci tenanta, nebo null.
 * Nepředává tokeny ven – slouží jen k rozhodnutí „je připojen?“.
 */
export async function getActiveIntegration(
  userId: string,
  tenantId: string
): Promise<{ id: string; googleEmail: string | null; isActive: boolean } | null> {
  const rows = await db
    .select({
      id: userGoogleCalendarIntegrations.id,
      googleEmail: userGoogleCalendarIntegrations.googleEmail,
      isActive: userGoogleCalendarIntegrations.isActive,
    })
    .from(userGoogleCalendarIntegrations)
    .where(
      and(
        eq(userGoogleCalendarIntegrations.tenantId, tenantId),
        eq(userGoogleCalendarIntegrations.userId, userId),
        eq(userGoogleCalendarIntegrations.isActive, true)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Uloží nebo aktualizuje tokeny integrace. Tokeny se před zápisem zašifrují.
 * Pouze server-side; volá se z callback route po úspěšném token exchange.
 */
export async function upsertIntegrationTokens(
  userId: string,
  tenantId: string,
  tokens: IntegrationTokens
): Promise<{ created: boolean }> {
  const now = new Date();
  const tokenExpiry = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000)
    : null;

  let encryptedAccess: string;
  let encryptedRefresh: string;
  try {
    encryptedAccess = encrypt(tokens.accessToken);
    encryptedRefresh = encrypt(tokens.refreshToken);
  } catch (e) {
    logError("Encryption failed", e);
    throw new Error("Token encryption failed");
  }

  const existing = await db
    .select({ id: userGoogleCalendarIntegrations.id })
    .from(userGoogleCalendarIntegrations)
    .where(
      and(
        eq(userGoogleCalendarIntegrations.tenantId, tenantId),
        eq(userGoogleCalendarIntegrations.userId, userId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userGoogleCalendarIntegrations)
      .set({
        googleEmail: tokens.googleEmail ?? null,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        tokenExpiry,
        scope: tokens.scope ?? null,
        isActive: true,
        updatedAt: now,
      })
      .where(
        and(
          eq(userGoogleCalendarIntegrations.tenantId, tenantId),
          eq(userGoogleCalendarIntegrations.userId, userId)
        )
      );
    log("Integration tokens updated", { userId: userId.slice(0, 8), tenantId });
    return { created: false };
  }

  await db.insert(userGoogleCalendarIntegrations).values({
    userId,
    tenantId,
    googleEmail: tokens.googleEmail ?? null,
    accessToken: encryptedAccess,
    refreshToken: encryptedRefresh,
    tokenExpiry,
    scope: tokens.scope ?? null,
    isActive: true,
    updatedAt: now,
  });
  log("Integration created", { userId: userId.slice(0, 8), tenantId });
  return { created: true };
}

async function invalidateCalendarAfterRevokedRefresh(
  userId: string,
  tenantId: string
): Promise<void> {
  await db
    .update(userGoogleCalendarIntegrations)
    .set({
      isActive: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userGoogleCalendarIntegrations.tenantId, tenantId),
        eq(userGoogleCalendarIntegrations.userId, userId)
      )
    );
}

/** Buffer před expirací (ms), v které už provedeme refresh. */
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

export type ValidAccessTokenResult = { accessToken: string; calendarId: string };

/**
 * Vrátí platný access token pro volání Google Calendar API.
 * Pokud je token expirovaný (nebo brzy expiruje), provede refresh a uloží nový token do DB.
 * @throws Error s kódem "not_connected" | "reauth_required" | "refresh_failed" | "decrypt_failed"
 */
export async function getValidAccessToken(
  userId: string,
  tenantId: string
): Promise<ValidAccessTokenResult> {
  const rows = await db
    .select({
      accessToken: userGoogleCalendarIntegrations.accessToken,
      refreshToken: userGoogleCalendarIntegrations.refreshToken,
      tokenExpiry: userGoogleCalendarIntegrations.tokenExpiry,
      calendarId: userGoogleCalendarIntegrations.calendarId,
    })
    .from(userGoogleCalendarIntegrations)
    .where(
      and(
        eq(userGoogleCalendarIntegrations.tenantId, tenantId),
        eq(userGoogleCalendarIntegrations.userId, userId),
        eq(userGoogleCalendarIntegrations.isActive, true)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row?.accessToken || !row?.refreshToken) {
    const err = new Error("Google Calendar is not connected") as Error & { code?: string };
    err.code = "not_connected";
    throw err;
  }

  const now = Date.now();
  const expiry = row.tokenExpiry ? row.tokenExpiry.getTime() : 0;
  const needsRefresh = expiry === 0 || now >= expiry - REFRESH_BEFORE_EXPIRY_MS;

  if (needsRefresh) {
    let refreshDecrypted: string;
    try {
      refreshDecrypted = decrypt(row.refreshToken);
    } catch (e) {
      logError("Decrypt refresh token failed", e);
      const err = new Error("Token decryption failed") as Error & { code?: string };
      err.code = "decrypt_failed";
      throw err;
    }
    let tokens;
    try {
      tokens = await refreshAccessToken(refreshDecrypted);
    } catch (e) {
      if (e instanceof GoogleInvalidGrantError) {
        await invalidateCalendarAfterRevokedRefresh(userId, tenantId);
        log("Refresh token revoked or expired; Calendar integration deactivated", {
          userId: userId.slice(0, 8),
          tenantId,
        });
        const err = new Error("Google Calendar reconnect required") as Error & {
          code?: string;
        };
        err.code = "reauth_required";
        throw err;
      }
      logError("Refresh token failed", e);
      const err = new Error("Token refresh failed") as Error & { code?: string };
      err.code = "refresh_failed";
      throw err;
    }
    const newExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
    let encryptedAccess: string;
    try {
      encryptedAccess = encrypt(tokens.access_token);
    } catch (e) {
      logError("Encrypt new access token failed", e);
      const err = new Error("Token encryption failed") as Error & { code?: string };
      err.code = "encryption_failed";
      throw err;
    }
    await db
      .update(userGoogleCalendarIntegrations)
      .set({
        accessToken: encryptedAccess,
        tokenExpiry: newExpiry,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userGoogleCalendarIntegrations.tenantId, tenantId),
          eq(userGoogleCalendarIntegrations.userId, userId)
        )
      );
    log("Access token refreshed", { userId: userId.slice(0, 8) });
    return {
      accessToken: tokens.access_token,
      calendarId: row.calendarId ?? "primary",
    };
  }

  try {
    const accessToken = decrypt(row.accessToken);
    return {
      accessToken,
      calendarId: row.calendarId ?? "primary",
    };
  } catch (e) {
    logError("Decrypt access token failed", e);
    const err = new Error("Token decryption failed") as Error & { code?: string };
    err.code = "decrypt_failed";
    throw err;
  }
}

export { log as logIntegration, logError as logIntegrationError };
