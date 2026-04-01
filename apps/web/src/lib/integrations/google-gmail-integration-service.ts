/**
 * Token management for Gmail integration.
 * Mirrors google-calendar-integration-service.ts pattern.
 */

import { db, userGoogleGmailIntegrations } from "db";
import { eq, and } from "db";
import { encrypt, decrypt } from "./encrypt";
import { GoogleInvalidGrantError, refreshGoogleAccessToken } from "./google-oauth";

const LOG_PREFIX = "[google-gmail-integration]";
function log(msg: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} ${msg}`, meta ? JSON.stringify(meta) : "");
}
function logError(msg: string, err?: unknown) {
  console.error(`${LOG_PREFIX} ${msg}`, err instanceof Error ? err.message : err);
}

export type IntegrationTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  scope?: string;
  googleEmail?: string | null;
};

export async function upsertGmailTokens(
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
    .select({ id: userGoogleGmailIntegrations.id })
    .from(userGoogleGmailIntegrations)
    .where(and(
      eq(userGoogleGmailIntegrations.tenantId, tenantId),
      eq(userGoogleGmailIntegrations.userId, userId)
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(userGoogleGmailIntegrations).set({
      googleEmail: tokens.googleEmail ?? null,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiry,
      scope: tokens.scope ?? null,
      isActive: true,
      updatedAt: now,
    }).where(and(
      eq(userGoogleGmailIntegrations.tenantId, tenantId),
      eq(userGoogleGmailIntegrations.userId, userId)
    ));
    log("Tokens updated", { userId: userId.slice(0, 8) });
    return { created: false };
  }

  await db.insert(userGoogleGmailIntegrations).values({
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
  log("Integration created", { userId: userId.slice(0, 8) });
  return { created: true };
}

async function invalidateGmailAfterRevokedRefresh(
  userId: string,
  tenantId: string
): Promise<void> {
  await db.update(userGoogleGmailIntegrations).set({
    isActive: false,
    accessToken: null,
    refreshToken: null,
    tokenExpiry: null,
    updatedAt: new Date(),
  }).where(and(
    eq(userGoogleGmailIntegrations.tenantId, tenantId),
    eq(userGoogleGmailIntegrations.userId, userId)
  ));
}

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

export async function getValidGmailAccessToken(
  userId: string,
  tenantId: string
): Promise<string> {
  const rows = await db
    .select({
      accessToken: userGoogleGmailIntegrations.accessToken,
      refreshToken: userGoogleGmailIntegrations.refreshToken,
      tokenExpiry: userGoogleGmailIntegrations.tokenExpiry,
    })
    .from(userGoogleGmailIntegrations)
    .where(and(
      eq(userGoogleGmailIntegrations.tenantId, tenantId),
      eq(userGoogleGmailIntegrations.userId, userId),
      eq(userGoogleGmailIntegrations.isActive, true)
    ))
    .limit(1);

  const row = rows[0];
  if (!row?.accessToken || !row?.refreshToken) {
    const err = new Error("Gmail is not connected") as Error & { code?: string };
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
      tokens = await refreshGoogleAccessToken(refreshDecrypted);
    } catch (e) {
      if (e instanceof GoogleInvalidGrantError) {
        await invalidateGmailAfterRevokedRefresh(userId, tenantId);
        log("Refresh token revoked or expired; Gmail integration deactivated", {
          userId: userId.slice(0, 8),
        });
        const err = new Error(
          "Přístup k Gmailu byl odvolán nebo vypršel. V Integracích ho znovu připojte."
        ) as Error & { code?: string };
        err.code = "reauth_required";
        throw err;
      }
      logError("Refresh failed", e);
      const err = new Error("Token refresh failed") as Error & { code?: string };
      err.code = "refresh_failed";
      throw err;
    }
    const newExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
    try {
      await db.update(userGoogleGmailIntegrations).set({
        accessToken: encrypt(tokens.access_token),
        tokenExpiry: newExpiry,
        updatedAt: new Date(),
      }).where(and(
        eq(userGoogleGmailIntegrations.tenantId, tenantId),
        eq(userGoogleGmailIntegrations.userId, userId)
      ));
    } catch (e) {
      logError("Failed to save refreshed token", e);
    }
    log("Access token refreshed", { userId: userId.slice(0, 8) });
    return tokens.access_token;
  }

  try {
    return decrypt(row.accessToken);
  } catch (e) {
    logError("Decrypt access token failed", e);
    const err = new Error("Token decryption failed") as Error & { code?: string };
    err.code = "decrypt_failed";
    throw err;
  }
}

export async function disconnectGmail(userId: string, tenantId: string): Promise<void> {
  await db.update(userGoogleGmailIntegrations).set({
    isActive: false,
    updatedAt: new Date(),
  }).where(and(
    eq(userGoogleGmailIntegrations.tenantId, tenantId),
    eq(userGoogleGmailIntegrations.userId, userId)
  ));
  log("Disconnected", { userId: userId.slice(0, 8) });
}

export { log as logGmailIntegration, logError as logGmailIntegrationError };
