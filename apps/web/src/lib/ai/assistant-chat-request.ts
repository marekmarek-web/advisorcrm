/**
 * Shared payload for POST /api/ai/assistant/chat (portal contact context + session).
 */

const PORTAL_CONTACT_UUID =
  /^\/portal\/contacts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Vrací ID kontaktu z cesty `/portal/contacts/[uuid]/…`. */
export function parsePortalContactIdFromPathname(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  const m = pathname.match(PORTAL_CONTACT_UUID);
  return m?.[1]?.toLowerCase();
}

export type AssistantChatRequestBody = {
  message: string;
  sessionId?: string;
  /** Když je klient z URL známý, UUID; jinak `null` vymaže aktivní klienta ve session na serveru. */
  activeContext?: {
    clientId?: string | null;
    reviewId?: string | null;
    paymentContactId?: string | null;
  };
};

export function buildAssistantChatRequestBody(
  message: string,
  opts: { sessionId?: string; routeContactId: string | null },
): AssistantChatRequestBody {
  const body: AssistantChatRequestBody = { message };
  if (opts.sessionId?.trim()) body.sessionId = opts.sessionId.trim();
  const cid = opts.routeContactId?.trim();
  body.activeContext = { clientId: cid || null };
  return body;
}
