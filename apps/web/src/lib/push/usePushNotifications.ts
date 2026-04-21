"use client";

/**
 * Capacitor push bridge: native `PushNotifications.register()` can throw or crash the process if
 * Firebase is not initialized (missing `apps/web/android/app/google-services.json`). See
 * docs/PLATFORM_SETUP.md — Android Firebase section.
 */
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PushNotifications, type Token, type PushNotificationSchema, type ActionPerformed } from "@capacitor/push-notifications";
import { retryFetch } from "@/lib/network/retry";

const PUSH_PROMPT_STORAGE_KEY = "aidvisor.push.soft-prompt.seen";
const PUSH_TOKEN_STORAGE_KEY = "aidvisor.push.token";

export type PushPermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

export type UsePushNotificationsOptions = {
  onPushNotificationReceived?: (notification: PushNotificationSchema) => void;
  onPushNotificationActionPerformed?: (action: ActionPerformed) => void;
};

async function registerTokenOnBackend(token: string, platform: "ios" | "android") {
  await retryFetch("/api/push/devices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pushToken: token,
      platform,
    }),
  }).catch(() => {});
}

async function revokeTokenOnBackend(token: string) {
  await retryFetch("/api/push/devices", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pushToken: token }),
  }).catch(() => {});
}

async function revokeAllTokensOnBackend() {
  await retryFetch("/api/push/devices", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ allDevices: true }),
  }).catch(() => {});
}

export async function revokeStoredPushToken() {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!token) return;
  await revokeTokenOnBackend(token);
  localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

export async function revokeAllStoredPushTokens() {
  if (typeof window === "undefined") return;
  await revokeAllTokensOnBackend();
  localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const [permissionState, setPermissionState] = useState<PushPermissionState>("prompt");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const registrationRequestedRef = useRef(false);
  const onReceivedRef = useRef(options.onPushNotificationReceived);
  const onActionRef = useRef(options.onPushNotificationActionPerformed);

  useEffect(() => {
    onReceivedRef.current = options.onPushNotificationReceived;
    onActionRef.current = options.onPushNotificationActionPerformed;
  }, [options.onPushNotificationReceived, options.onPushNotificationActionPerformed]);

  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);
  const platform = useMemo(() => Capacitor.getPlatform(), []);
  // v1.0 release scope: push je na Androidu vypnut, protože Firebase / FCM
  // nejsou nakonfigurované (chybí `apps/web/android/app/google-services.json`).
  // `PushNotifications.register()` by bez Firebase ukončil aplikaci nativně.
  // iOS jede na APNs a má entitlement `aps-environment=production`.
  // Pro v1.1 stačí odebrat tuto podmínku po dodání `google-services.json`
  // a uploadu FCM klíče do push backendu. Viz docs/release-v1-decisions.md.
  const isSupportedPlatform = platform === "ios";
  const isSupported = isNative && isSupportedPlatform;

  const markSoftPromptSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, "1");
  }, []);

  const hasSeenSoftPrompt = useMemo(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(PUSH_PROMPT_STORAGE_KEY) === "1";
  }, []);

  const syncPermissions = useCallback(async () => {
    if (!isSupported) return;
    try {
      const status = await PushNotifications.checkPermissions();
      setPermissionState(status.receive);
    } catch (e) {
      console.error("[push] checkPermissions failed", e);
      setPermissionState("prompt");
    }
  }, [isSupported]);

  const requestSystemPermission = useCallback(async () => {
    if (!isSupported) return;
    markSoftPromptSeen();
    try {
      const status = await PushNotifications.requestPermissions();
      setPermissionState(status.receive);
    } catch (e) {
      console.error("[push] requestPermissions failed", e);
      setError(e instanceof Error ? e.message : "Oprávnění k oznámením se nepodařilo vyžádat.");
    }
  }, [isSupported, markSoftPromptSeen]);

  const registerForPush = useCallback(async () => {
    if (!isSupported) return;
    registrationRequestedRef.current = true;
    try {
      await PushNotifications.register();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const message =
        /firebase|FirebaseApp|not initialized/i.test(raw)
          ? "Push nelze aktivovat (Firebase není inicializovaný). Na Androidu přidejte google-services.json podle docs/PLATFORM_SETUP.md."
          : raw || "Push registrace selhala.";
      setError(message);
      console.error("[push] register failed", e);
    }
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    void syncPermissions();

    let cancelled = false;
    const handles: Array<{ remove: () => void | Promise<void> }> = [];

    const setupListeners = async () => {
      async function addListenerSafe<T extends { remove: () => void | Promise<void> }>(
        label: string,
        add: () => Promise<T>
      ): Promise<T | null> {
        try {
          return await add();
        } catch (e) {
          console.error(`[push] addListener(${label}) failed`, e);
          return null;
        }
      }

      const onRegistration = await addListenerSafe("registration", () =>
        PushNotifications.addListener("registration", (newToken: Token) => {
          const tokenValue = newToken.value;
          setToken(tokenValue);
          setError(null);
          localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, tokenValue);
          void registerTokenOnBackend(tokenValue, platform);
        })
      );

      const onRegistrationError = await addListenerSafe("registrationError", () =>
        PushNotifications.addListener("registrationError", (registrationError) => {
          setError(registrationError.error);
        })
      );

      const onNotificationReceived = await addListenerSafe("pushNotificationReceived", () =>
        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          onReceivedRef.current?.(notification);
        })
      );

      const onNotificationAction = await addListenerSafe("pushNotificationActionPerformed", () =>
        PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          onActionRef.current?.(action);
        })
      );

      const registered = [onRegistration, onRegistrationError, onNotificationReceived, onNotificationAction].filter(
        Boolean
      ) as Array<{ remove: () => void | Promise<void> }>;

      if (cancelled) {
        await Promise.all(registered.map((h) => Promise.resolve(h.remove())));
        return;
      }

      if (registered.length === 0) {
        setError("Push plugin není k dispozici nebo se nepodařilo navázat posluchače.");
        return;
      }

      handles.push(...registered);
    };

    void setupListeners();

    return () => {
      cancelled = true;
      for (const h of handles) {
        try {
          void h.remove();
        } catch (removeErr) {
          console.error("[push] listener remove failed", removeErr);
        }
      }
    };
  }, [isSupported, platform, syncPermissions]);

  useEffect(() => {
    if (!isSupported) return;
    if (permissionState !== "granted") return;
    if (registrationRequestedRef.current) return;
    void registerForPush();
  }, [isSupported, permissionState, registerForPush]);

  const isPermissionDenied = permissionState === "denied";
  const shouldShowSoftPrompt = isSupported && !hasSeenSoftPrompt && permissionState !== "granted";

  return {
    isSupported,
    permissionState,
    token,
    error,
    isPermissionDenied,
    shouldShowSoftPrompt,
    hasSeenSoftPrompt,
    markSoftPromptSeen,
    requestSystemPermission,
    syncPermissions,
    registerForPush,
  };
}
