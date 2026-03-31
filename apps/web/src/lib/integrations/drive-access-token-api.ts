import { getValidDriveAccessToken } from "./google-drive-integration-service";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * For Drive API routes: returns access token or throws Response with stable JSON/status.
 */
export async function requireDriveAccessToken(
  userId: string,
  tenantId: string
): Promise<string> {
  try {
    return await getValidDriveAccessToken(userId, tenantId);
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === "not_connected") {
      throw new Response(
        JSON.stringify({ error: "Google Drive není připojen", code: "not_connected" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }
    if (code === "reauth_required") {
      throw new Response(
        JSON.stringify({
          error:
            "Přístup k Google Disku byl odvolán nebo vypršel. V Integracích znovu připojte Google Disk.",
          code: "reauth_required",
        }),
        { status: 401, headers: JSON_HEADERS }
      );
    }
    throw new Response(JSON.stringify({ error: "Chyba přístupu k Drive" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
