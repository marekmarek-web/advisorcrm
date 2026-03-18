import { Capacitor } from "@capacitor/core";

export type NativePlatform = "ios" | "android" | "web";

export function getPlatform(): NativePlatform {
  const platform = Capacitor.getPlatform();
  if (platform === "ios" || platform === "android") return platform;
  return "web";
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isWebPlatform(): boolean {
  return getPlatform() === "web";
}

export function isIosPlatform(): boolean {
  return getPlatform() === "ios";
}

export function isAndroidPlatform(): boolean {
  return getPlatform() === "android";
}
