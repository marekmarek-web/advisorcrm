"use client";

import { useEffect, useMemo, useState } from "react";
import { DESKTOP_MIN_PX } from "@/app/lib/breakpoints";
import { useNativePlatform } from "@/lib/capacitor/useNativePlatform";
import {
  type CaptureFormFactor,
  type CaptureTier,
  getCaptureFormFactorFromWidth,
} from "./capture-capabilities";

function readFormFactor(): CaptureFormFactor {
  if (typeof window === "undefined") return "mobile";
  return getCaptureFormFactorFromWidth(window.innerWidth);
}

/**
 * Portal / upload flows: native shell vs mobile web vs desktop web.
 * Defaults to mobile form factor until hydrated (matches useDeviceClass SSR behavior).
 */
export function useCaptureCapabilities() {
  const { isNative } = useNativePlatform();
  const [formFactor, setFormFactor] = useState<CaptureFormFactor>("mobile");

  useEffect(() => {
    const update = () => setFormFactor(readFormFactor());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const tier: CaptureTier = useMemo(() => {
    if (isNative) return "native_capacitor";
    return formFactor === "mobile" ? "web_mobile" : "web_desktop";
  }, [isNative, formFactor]);

  const supportsMultiPageScan = tier === "native_capacitor" || tier === "web_mobile";
  const showScanInQuickMenu = tier !== "web_desktop";
  const useNativeCameraPlugin = tier === "native_capacitor";
  /** Mobile web: show full source sheet (scan, camera, gallery, file). Desktop web: file only from sheet. */
  const useExpandedUploadSheet = tier !== "web_desktop";

  return {
    tier,
    formFactor,
    supportsMultiPageScan,
    showScanInQuickMenu,
    useNativeCameraPlugin,
    useExpandedUploadSheet,
  };
}

export { DESKTOP_MIN_PX };
