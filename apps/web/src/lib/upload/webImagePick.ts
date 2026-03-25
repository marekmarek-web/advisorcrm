"use client";

function attachPicker(input: HTMLInputElement): void {
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.opacity = "0";
  input.setAttribute("aria-hidden", "true");
  document.body.appendChild(input);
}

/**
 * Opens a native file picker wired for rear camera on mobile browsers (user gesture required).
 * Returns null if user cancels or closes without selection.
 */
export function pickSingleImageFromCamera(): Promise<File | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";

    input.addEventListener("change", () => {
      finish(input.files?.[0] ?? null);
    });
    input.addEventListener("cancel", () => finish(null));

    attachPicker(input);
    input.click();

    window.setTimeout(() => finish(null), 90_000);
  });
}

/** Gallery / library picker, single image. */
export function pickSingleImageFromGallery(): Promise<File | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.addEventListener("change", () => {
      finish(input.files?.[0] ?? null);
    });
    input.addEventListener("cancel", () => finish(null));

    attachPicker(input);
    input.click();

    window.setTimeout(() => finish(null), 90_000);
  });
}

/** Multiple images from library (no capture attribute). Respects maxFiles. */
export function pickMultipleImagesFromGallery(maxFiles: number): Promise<File[]> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files.slice(0, maxFiles));
    };

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;

    input.addEventListener("change", () => {
      const list = input.files ? Array.from(input.files) : [];
      finish(list);
    });
    input.addEventListener("cancel", () => finish([]));

    attachPicker(input);
    input.click();

    window.setTimeout(() => finish([]), 90_000);
  });
}
