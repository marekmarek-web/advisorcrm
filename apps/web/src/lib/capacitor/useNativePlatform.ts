"use client";

import { useMemo } from "react";
import {
  getPlatform,
  isAndroidPlatform,
  isIosPlatform,
  isNativePlatform,
  isWebPlatform,
  type NativePlatform,
} from "./platform";

export type NativePlatformState = {
  platform: NativePlatform;
  isNative: boolean;
  isWeb: boolean;
  isIos: boolean;
  isAndroid: boolean;
};

export function useNativePlatform(): NativePlatformState {
  return useMemo(
    () => ({
      platform: getPlatform(),
      isNative: isNativePlatform(),
      isWeb: isWebPlatform(),
      isIos: isIosPlatform(),
      isAndroid: isAndroidPlatform(),
    }),
    [],
  );
}
