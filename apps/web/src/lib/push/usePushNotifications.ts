"use client";

import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PushNotifications, type Token, type PushNotificationSchema, type ActionPerformed } from "@capacitor/push-notifications";

const PUSH_PROMPT_STORAGE_KEY = "aidvisor.push.soft-prompt.seen";
const PUSH_TOKEN_STORAGE_KEY = "aidvisor.push.token";

export type PushPermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

export type UsePushNotificationsOptions = {
  onPushNotificationReceived?: (notification: PushNotificationSchema) => void;
  onPushNotificationActionPerformed?: (action: ActionPerformed) => void;
};

async function registerTokenOnBackend(token: string, platform: "ios" | "android") {
  await fetch("/api/push/devices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pushToken: token,
      platform,
    }),
  }).catch(() => {});
}

async function revokeTokenOnBackend(token: string) {
  await fetch("/api/push/devices", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pushToken: token }),
  }).catch(() => {});
}

export async function revokeStoredPushToken() {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!token) return;
  await revokeTokenOnBackend(token);
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
  const isSupportedPlatform = platform === "ios" || platform === "android";
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
    const status = await PushNotifications.checkPermissions();
    setPermissionState(status.receive);
  }, [isSupported]);

  const requestSystemPermission = useCallback(async () => {
    if (!isSupported) return;
    markSoftPromptSeen();
    const status = await PushNotifications.requestPermissions();
    setPermissionState(status.receive);
  }, [isSupported, markSoftPromptSeen]);

  const registerForPush = useCallback(async () => {
    if (!isSupported) return;
    registrationRequestedRef.current = true;
    await PushNotifications.register();
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    void syncPermissions();

    const onRegistration = PushNotifications.addListener("registration", (newToken: Token) => {
      const tokenValue = newToken.value;
      setToken(tokenValue);
      setError(null);
      localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, tokenValue);
      void registerTokenOnBackend(tokenValue, platform);
    });

    const onRegistrationError = PushNotifications.addListener("registrationError", (registrationError) => {
      setError(registrationError.error);
    });

    const onNotificationReceived = PushNotifications.addListener("pushNotificationReceived", (notification) => {
      onReceivedRef.current?.(notification);
    });

    const onNotificationAction = PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      onActionRef.current?.(action);
    });

    return () => {
      onRegistration.then((listener) => listener.remove()).catch(() => {});
      onRegistrationError.then((listener) => listener.remove()).catch(() => {});
      onNotificationReceived.then((listener) => listener.remove()).catch(() => {});
      onNotificationAction.then((listener) => listener.remove()).catch(() => {});
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
