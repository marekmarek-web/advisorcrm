/**
 * Safari (esp. iOS) often fails or crops inline PDF embeds; prefer opening the URL in a new tab.
 */
export function isIosWebKitPdfEmbedUnreliable(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadDesktopMode = navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints) > 1;
  const webKitSafariFamily = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return (iOSDevice || iPadDesktopMode) && webKitSafariFamily;
}

export function openDocumentUrlInNewTab(url: string): void {
  if (typeof window === "undefined") return;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = url;
  }
}
