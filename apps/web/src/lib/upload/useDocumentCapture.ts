"use client";

import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { useCallback } from "react";
import { isNativePlatform } from "@/lib/capacitor/platform";

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
  const captureFromCamera = useCallback(async (): Promise<CaptureResult> => {
    if (!isNativePlatform()) {
      return { file: null, error: "Pořízení fotografie je dostupné pouze v mobilní aplikaci." };
    }

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
  }, []);

  const captureFromGallery = useCallback(async (): Promise<CaptureResult> => {
    if (!isNativePlatform()) {
      return { file: null, error: "Galerie je dostupná pouze v mobilní aplikaci." };
    }

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
  }, []);

  return {
    isAvailable: isNativePlatform(),
    captureFromCamera,
    captureFromGallery,
  };
}
