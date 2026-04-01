/**
 * Token management for Google Drive integration.
 * Mirrors google-calendar-integration-service.ts pattern.
 */

import { db, userGoogleDriveIntegrations } from "db";
import { eq, and } from "db";
import { encrypt, decrypt } from "./encrypt";
import { GoogleInvalidGrantError, refreshGoogleAccessToken } from "./google-oauth";

const LOG_PREFIX = "[google-drive-integration]";
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

export async function upsertDriveTokens(
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
    .select({ id: userGoogleDriveIntegrations.id })
    .from(userGoogleDriveIntegrations)
    .where(and(
      eq(userGoogleDriveIntegrations.tenantId, tenantId),
      eq(userGoogleDriveIntegrations.userId, userId)
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(userGoogleDriveIntegrations).set({
      googleEmail: tokens.googleEmail ?? null,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiry,
      scope: tokens.scope ?? null,
      isActive: true,
      updatedAt: now,
    }).where(and(
      eq(userGoogleDriveIntegrations.tenantId, tenantId),
      eq(userGoogleDriveIntegrations.userId, userId)
    ));
    log("Tokens updated", { userId: userId.slice(0, 8) });
    return { created: false };
  }

  await db.insert(userGoogleDriveIntegrations).values({
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

async function invalidateDriveAfterRevokedRefresh(
  userId: string,
  tenantId: string
): Promise<void> {
  await db.update(userGoogleDriveIntegrations).set({
    isActive: false,
    accessToken: null,
    refreshToken: null,
    tokenExpiry: null,
    updatedAt: new Date(),
  }).where(and(
    eq(userGoogleDriveIntegrations.tenantId, tenantId),
    eq(userGoogleDriveIntegrations.userId, userId)
  ));
}

const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

export async function getValidDriveAccessToken(
  userId: string,
  tenantId: string
): Promise<string> {
  const rows = await db
    .select({
      accessToken: userGoogleDriveIntegrations.accessToken,
      refreshToken: userGoogleDriveIntegrations.refreshToken,
      tokenExpiry: userGoogleDriveIntegrations.tokenExpiry,
    })
    .from(userGoogleDriveIntegrations)
    .where(and(
      eq(userGoogleDriveIntegrations.tenantId, tenantId),
      eq(userGoogleDriveIntegrations.userId, userId),
      eq(userGoogleDriveIntegrations.isActive, true)
    ))
    .limit(1);

  const row = rows[0];
  if (!row?.accessToken || !row?.refreshToken) {
    const err = new Error("Google Drive is not connected") as Error & { code?: string };
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
        await invalidateDriveAfterRevokedRefresh(userId, tenantId);
        log("Refresh token revoked or expired; Drive integration deactivated", {
          userId: userId.slice(0, 8),
        });
        const err = new Error("Google Drive reconnect required") as Error & {
          code?: string;
        };
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
      await db.update(userGoogleDriveIntegrations).set({
        accessToken: encrypt(tokens.access_token),
        tokenExpiry: newExpiry,
        updatedAt: new Date(),
      }).where(and(
        eq(userGoogleDriveIntegrations.tenantId, tenantId),
        eq(userGoogleDriveIntegrations.userId, userId)
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

export async function disconnectDrive(userId: string, tenantId: string): Promise<void> {
  await db.update(userGoogleDriveIntegrations).set({
    isActive: false,
    updatedAt: new Date(),
  }).where(and(
    eq(userGoogleDriveIntegrations.tenantId, tenantId),
    eq(userGoogleDriveIntegrations.userId, userId)
  ));
  log("Disconnected", { userId: userId.slice(0, 8) });
}

export { log as logDriveIntegration, logError as logDriveIntegrationError };
