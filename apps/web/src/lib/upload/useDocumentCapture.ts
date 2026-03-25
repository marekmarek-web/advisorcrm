"use client";

import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { useCallback, useMemo } from "react";
import { useCaptureCapabilities } from "@/lib/device/useCaptureCapabilities";
import {
  pickSingleImageFromCamera,
  pickSingleImageFromGallery,
} from "@/lib/upload/webImagePick";

export type CaptureResult = {
  file: File | null;
  error?: string;
};

async function photoToFile(photo: Awaited<ReturnType<typeof Camera.getPhoto>>, prefix: string): Promise<File> {
  const webPath = photo.webPath ?? photo.path;
  if (!webPath) {
    throw new Error("Nepodařilo se načíst pořízenou fotografii.");
  }

  const response = await fetch(webPath);
  const blob = await response.blob();
  const format = (photo.format || "jpeg").toLowerCase();
  const extension = format === "jpg" ? "jpeg" : format;
  const mimeType = blob.type || `image/${extension}`;
  const fileName = `${prefix}-${Date.now()}.${extension}`;
  return new File([blob], fileName, { type: mimeType, lastModified: Date.now() });
}

function toUserMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const normalized = msg.toLowerCase();
  if (normalized.includes("cancel")) return "Výběr byl zrušen.";
  if (normalized.includes("permission")) {
    return "Aplikace nemá oprávnění ke kameře nebo fotkám. Povolte přístup v nastavení zařízení.";
  }
  return "Nepodařilo se získat soubor z telefonu. Zkuste to prosím znovu.";
}

export function useDocumentCapture() {
  const { tier, useNativeCameraPlugin } = useCaptureCapabilities();

  const isAvailable = useMemo(
    () => tier === "native_capacitor" || tier === "web_mobile",
    [tier]
  );

  const captureFromCamera = useCallback(async (): Promise<CaptureResult> => {
    if (tier === "web_desktop") {
      return {
        file: null,
        error: "Fotoaparát je v prohlížeči na počítači nedostupný. Nahrajte soubor nebo použijte mobil.",
      };
    }

    if (useNativeCameraPlugin) {
      try {
        const photo = await Camera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.Uri,
          quality: 80,
          width: 2048,
          correctOrientation: true,
        });
        const file = await photoToFile(photo, "camera");
        return { file };
      } catch (error) {
        return { file: null, error: toUserMessage(error) };
      }
    }

    try {
      const file = await pickSingleImageFromCamera();
      if (!file) {
        return { file: null, error: "Výběr byl zrušen." };
      }
      return { file };
    } catch (error) {
      return { file: null, error: toUserMessage(error) };
    }
  }, [tier, useNativeCameraPlugin]);

  const captureFromGallery = useCallback(async (): Promise<CaptureResult> => {
    if (tier === "web_desktop") {
      return {
        file: null,
        error: "Galerie v tomto zobrazení použijte přes „Vybrat soubor“.",
      };
    }

    if (useNativeCameraPlugin) {
      try {
        const photo = await Camera.getPhoto({
          source: CameraSource.Photos,
          resultType: CameraResultType.Uri,
          quality: 80,
          width: 2048,
          correctOrientation: true,
        });
        const file = await photoToFile(photo, "gallery");
        return { file };
      } catch (error) {
        return { file: null, error: toUserMessage(error) };
      }
    }

    try {
      const file = await pickSingleImageFromGallery();
      if (!file) {
        return { file: null, error: "Výběr byl zrušen." };
      }
      return { file };
    } catch (error) {
      return { file: null, error: toUserMessage(error) };
    }
  }, [tier, useNativeCameraPlugin]);

  return {
    isAvailable,
    captureFromCamera,
    captureFromGallery,
    tier,
  };
}
