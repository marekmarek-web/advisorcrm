/**
 * Communication preferences (Plan 6D.4).
 * Channel resolution and consent checks.
 */

export type PreferredChannel = "email" | "portal" | "phone" | null;

export type CommunicationPrefs = {
  email?: string | null;
  preferredChannel?: PreferredChannel;
  doNotEmail?: boolean;
  doNotPush?: boolean;
  notificationUnsubscribedAt?: Date | null;
  bestContactTime?: string | null;
};

export type ConsentResult = {
  allowed: boolean;
  reason?: string;
};

export type EffectiveChannel = "email" | "portal" | "in_app" | "push" | "none";

export function getEffectiveChannel(prefs: CommunicationPrefs): EffectiveChannel {
  if (prefs.preferredChannel === "email" && prefs.email && !prefs.doNotEmail && !prefs.notificationUnsubscribedAt) {
    return "email";
  }
  if (prefs.preferredChannel === "portal") {
    return "portal";
  }
  if (prefs.email && !prefs.doNotEmail && !prefs.notificationUnsubscribedAt) {
    return "email";
  }
  if (!prefs.doNotPush) {
    return "push";
  }
  return "in_app";
}

export function checkCommunicationConsent(
  prefs: CommunicationPrefs,
  channel: "email" | "push" | "in_app",
): ConsentResult {
  if (channel === "email") {
    if (!prefs.email) return { allowed: false, reason: "NO_EMAIL_ADDRESS" };
    if (prefs.doNotEmail) return { allowed: false, reason: "DO_NOT_EMAIL" };
    if (prefs.notificationUnsubscribedAt) return { allowed: false, reason: "CONTACT_UNSUBSCRIBED" };
    return { allowed: true };
  }
  if (channel === "push") {
    if (prefs.doNotPush) return { allowed: false, reason: "DO_NOT_PUSH" };
    return { allowed: true };
  }
  return { allowed: true };
}

export function resolveChannelWithFallback(
  prefs: CommunicationPrefs,
): { channel: EffectiveChannel; fallbackApplied: boolean } {
  const hasEmail = !!prefs.email;
  const emailBlocked = prefs.doNotEmail || !!prefs.notificationUnsubscribedAt;
  const pushBlocked = !!prefs.doNotPush;

  const primary = getEffectiveChannel(prefs);

  if (primary === "email") {
    const consent = checkCommunicationConsent(prefs, "email");
    if (!consent.allowed) {
      return { channel: "in_app", fallbackApplied: true };
    }
    return { channel: "email", fallbackApplied: false };
  }

  if (primary === "push") {
    const consent = checkCommunicationConsent(prefs, "push");
    if (!consent.allowed) {
      return { channel: "in_app", fallbackApplied: true };
    }
    const fallback = hasEmail && emailBlocked;
    return { channel: "push", fallbackApplied: fallback };
  }

  if (primary === "in_app") {
    const fallback = (hasEmail && emailBlocked) || pushBlocked;
    return { channel: "in_app", fallbackApplied: fallback };
  }

  return { channel: primary, fallbackApplied: false };
}
