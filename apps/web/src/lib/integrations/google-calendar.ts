/**
 * Google Calendar API and OAuth2 token exchange (no external SDK; fetch only).
 * Requires GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET in env.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

export type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  created?: string;
  updated?: string;
};

export type GoogleCalendarEventsResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
};

function getClientConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET must be set");
  }
  return { clientId, clientSecret };
}

/**
 * Exchange authorization code for access_token and refresh_token.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getClientConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${err}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

/**
 * Get a fresh access_token using refresh_token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getClientConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${err}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

function calendarRequest<T>(
  accessToken: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: object
): Promise<T> {
  const url = path.startsWith("http") ? path : `${CALENDAR_API_BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(async (res) => {
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Calendar API ${method} ${path}: ${res.status} ${err}`);
    }
    if (method === "DELETE" || res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  });
}

/**
 * List events in a calendar between timeMin and timeMax (ISO 8601).
 */
export async function listCalendarEvents(
  accessToken: string,
  calendarId: string,
  options: { timeMin?: string; timeMax?: string; maxResults?: number } = {}
): Promise<GoogleCalendarEventsResponse> {
  const params = new URLSearchParams();
  if (options.timeMin) params.set("timeMin", options.timeMin);
  if (options.timeMax) params.set("timeMax", options.timeMax);
  if (options.maxResults != null) params.set("maxResults", String(options.maxResults));
  const qs = params.toString();
  const path = `/calendars/${encodeURIComponent(calendarId)}/events${qs ? `?${qs}` : ""}`;
  return calendarRequest<GoogleCalendarEventsResponse>(accessToken, "GET", path);
}

/**
 * Create an event. Returns the created event with id.
 */
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: Omit<GoogleCalendarEvent, "id">
): Promise<GoogleCalendarEvent> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events`;
  return calendarRequest<GoogleCalendarEvent>(accessToken, "POST", path, event);
}

/**
 * Get a single event by id.
 */
export async function getCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<GoogleCalendarEvent> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  return calendarRequest<GoogleCalendarEvent>(accessToken, "GET", path);
}

/**
 * Update an existing event (patch).
 */
export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<GoogleCalendarEvent>
): Promise<GoogleCalendarEvent> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  return calendarRequest<GoogleCalendarEvent>(accessToken, "PATCH", path, event);
}

/**
 * Delete an event.
 */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  await calendarRequest<void>(accessToken, "DELETE", path);
}

/**
 * Free/busy query request (RFC3339 timeMin/timeMax).
 */
export type FreeBusyRequest = {
  timeMin: string;
  timeMax: string;
  items: { id: string }[];
  timeZone?: string;
};

export type FreeBusyBusyItem = { start: string; end: string };

export type FreeBusyCalendar = {
  errors?: { domain?: string; reason?: string }[];
  busy?: FreeBusyBusyItem[];
};

export type FreeBusyResponse = {
  kind?: string;
  timeMin?: string;
  timeMax?: string;
  calendars?: Record<string, FreeBusyCalendar>;
};

/**
 * Query free/busy information for the given calendar(s).
 * Returns busy ranges (start/end RFC3339) per calendar.
 */
export async function queryFreeBusy(
  accessToken: string,
  body: FreeBusyRequest
): Promise<FreeBusyResponse> {
  const path = "/freeBusy";
  return calendarRequest<FreeBusyResponse>(accessToken, "POST", path, body);
}

/**
 * Get user info (email) from Google - we can use the token response or userinfo endpoint.
 * After token exchange we don't get email in the token response by default; optional: call userinfo.
 */
export async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}
