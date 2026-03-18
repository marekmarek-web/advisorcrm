import "server-only";

import { GoogleAuth } from "google-auth-library";
import { and, clientContacts, db, eq, isNull, notificationLog, userDevices } from "db";
import { PushEventPayloadSchema, type PushEventPayload } from "./events";

const PUSH_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_BASE_URL = "https://fcm.googleapis.com/v1/projects";

type FcmServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

function getServiceAccount(): FcmServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as FcmServiceAccount;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function getAccessToken(account: FcmServiceAccount): Promise<string | null> {
  const auth = new GoogleAuth({
    credentials: {
      client_email: account.client_email,
      private_key: account.private_key,
    },
    scopes: [PUSH_SCOPE],
  });

  const token = await auth.getAccessToken();
  return token ?? null;
}

function buildMessage(token: string, event: PushEventPayload) {
  return {
    message: {
      token,
      notification: {
        title: event.title,
        body: event.body,
      },
      data: {
        type: event.type,
        ...(event.data ?? {}),
      },
      android: {
        priority: "high",
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
      },
    },
  };
}

export async function sendPushToUser(eventInput: PushEventPayload): Promise<void> {
  const eventParsed = PushEventPayloadSchema.safeParse(eventInput);
  if (!eventParsed.success) return;
  const event = eventParsed.data;

  const account = getServiceAccount();
  if (!account) return;

  const accessToken = await getAccessToken(account);
  if (!accessToken) return;

  const devices = await db
    .select({
      pushToken: userDevices.pushToken,
      id: userDevices.id,
    })
    .from(userDevices)
    .where(
      and(
        eq(userDevices.tenantId, event.tenantId),
        eq(userDevices.userId, event.userId),
        eq(userDevices.pushEnabled, true),
        isNull(userDevices.revokedAt)
      )
    );

  for (const device of devices) {
    const response = await fetch(`${FCM_BASE_URL}/${account.project_id}/messages:send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildMessage(device.pushToken, event)),
      cache: "no-store",
    });

    await db.insert(notificationLog).values({
      tenantId: event.tenantId,
      channel: "push",
      template: event.type,
      subject: event.title,
      recipient: device.pushToken,
      status: response.ok ? "sent" : "failed",
      meta: {
        userId: event.userId,
        deviceId: device.id,
        responseStatus: response.status,
      },
    });
  }
}

export async function sendPushForPortalNotification(params: {
  tenantId: string;
  contactId: string;
  type: "new_message" | "request_status_change" | "new_document" | "important_date";
  title: string;
  body?: string | null;
  relatedEntityId?: string | null;
}): Promise<void> {
  const recipients = await db
    .select({
      userId: clientContacts.userId,
    })
    .from(clientContacts)
    .where(and(eq(clientContacts.tenantId, params.tenantId), eq(clientContacts.contactId, params.contactId)));

  if (recipients.length === 0) return;

  const mappedType =
    params.type === "new_message"
      ? "NEW_MESSAGE"
      : params.type === "request_status_change"
        ? "REQUEST_STATUS_CHANGE"
        : params.type === "new_document"
          ? "NEW_DOCUMENT"
          : "CLIENT_REQUEST";

  for (const recipient of recipients) {
    await sendPushToUser({
      type: mappedType,
      title: params.title,
      body: params.body ?? undefined,
      tenantId: params.tenantId,
      userId: recipient.userId,
      data: params.relatedEntityId ? { relatedEntityId: params.relatedEntityId } : undefined,
    });
  }
}
