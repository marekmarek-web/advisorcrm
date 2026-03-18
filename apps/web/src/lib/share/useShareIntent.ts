"use client";

import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { validateFile } from "@/lib/upload/validation";

type SendIntentItem = {
  title?: string;
  type?: string;
  url?: string;
};

type SendIntentResult = SendIntentItem & {
  additionalItems?: SendIntentItem[];
};

type SendIntentPlugin = {
  checkSendIntentReceived: () => Promise<SendIntentResult | null>;
};

const MAX_SHARED_FILES = 5;

let sharedFilesStore: File[] = [];
let sharedFilesErrorStore: string | null = null;
const listeners = new Set<() => void>();

function emitStoreChange() {
  listeners.forEach((listener) => listener());
}

function setSharedFiles(nextFiles: File[], error: string | null = null) {
  sharedFilesStore = nextFiles;
  sharedFilesErrorStore = error;
  emitStoreChange();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function resolveSendIntentPlugin(): Promise<SendIntentPlugin | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const module = await import("@supernotes/capacitor-send-intent");
    return (module as { SendIntent?: SendIntentPlugin }).SendIntent ?? null;
  } catch {
    return null;
  }
}

function getFileNameFromUri(uri: string): string {
  const cleanUri = uri.split("?")[0] ?? uri;
  const part = cleanUri.split("/").pop();
  return part && part.trim() ? decodeURIComponent(part) : `shared-${Date.now()}`;
}

async function readSharedFile(uri: string, fallbackName: string, mimeType?: string): Promise<File> {
  const tryFetch = async (target: string) => {
    const response = await fetch(target);
    if (!response.ok) {
      throw new Error("Nepodařilo se načíst sdílený soubor.");
    }
    return response.blob();
  };

  let blob: Blob;
  try {
    blob = await tryFetch(uri);
  } catch {
    const converted = Capacitor.convertFileSrc(uri);
    blob = await tryFetch(converted);
  }

  const fileName = fallbackName || getFileNameFromUri(uri);
  const fileType = blob.type || mimeType || "application/octet-stream";
  return new File([blob], fileName, { type: fileType });
}

function normalizeIntentItems(result: SendIntentResult | null): SendIntentItem[] {
  if (!result) return [];
  const primary: SendIntentItem[] = result.url ? [result] : [];
  const additional = Array.isArray(result.additionalItems) ? result.additionalItems : [];
  return [...primary, ...additional].filter((item) => Boolean(item?.url)).slice(0, MAX_SHARED_FILES);
}

async function hydrateFromIntent() {
  const plugin = await resolveSendIntentPlugin();
  if (!plugin) return;

  try {
    const result = await plugin.checkSendIntentReceived();
    const items = normalizeIntentItems(result);
    if (!items.length) return;

    const files: File[] = [];
    const errors: string[] = [];

    for (const item of items) {
      const uri = item.url;
      if (!uri) continue;
      try {
        const file = await readSharedFile(uri, item.title ?? getFileNameFromUri(uri), item.type);
        const validation = validateFile(file);
        if (!validation.valid) {
          errors.push(validation.error ?? "Sdílený soubor je neplatný.");
          continue;
        }
        files.push(file);
      } catch {
        errors.push(`Soubor "${item.title ?? "bez názvu"}" se nepodařilo načíst.`);
      }
    }

    if (files.length) {
      setSharedFiles(files, errors.length ? errors[0] : null);
      return;
    }

    if (errors.length) {
      setSharedFiles([], errors[0] ?? "Sdílený soubor nelze importovat.");
    }
  } catch {
    setSharedFiles([], "Nepodařilo se zpracovat sdílený soubor.");
  }
}

export function useShareIntent() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribe(() => setVersion((version) => version + 1));
    return () => {
      unsubscribe();
    };
  }, []);

  const refreshFromIntent = useCallback(async () => {
    await hydrateFromIntent();
  }, []);

  const clearSharedFiles = useCallback(() => {
    setSharedFiles([], null);
  }, []);

  useEffect(() => {
    void refreshFromIntent();
    const handleReceive = () => {
      void refreshFromIntent();
    };
    window.addEventListener("sendIntentReceived", handleReceive);
    return () => window.removeEventListener("sendIntentReceived", handleReceive);
  }, [refreshFromIntent]);

  return useMemo(
    () => ({
      sharedFiles: sharedFilesStore,
      hasSharedFiles: sharedFilesStore.length > 0,
      clearSharedFiles,
      error: sharedFilesErrorStore,
      refreshFromIntent,
    }),
    [clearSharedFiles, refreshFromIntent],
  );
}
