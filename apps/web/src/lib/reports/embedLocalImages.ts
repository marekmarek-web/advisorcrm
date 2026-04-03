/**
 * Inline same-origin images in HTML as data URLs so print/PDF and offline HTML work.
 */

export async function embedLocalImages(html: string): Promise<string> {
  const srcRe = /src="(\/[^"]+)"/g;
  const urls = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(html)) !== null) urls.add(m[1]);
  if (urls.size === 0) return html;

  const cache = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await res.blob();
        const buf = await blob.arrayBuffer();
        const b64 = btoa(
          new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
        );
        cache.set(url, `data:${blob.type || "image/png"};base64,${b64}`);
      } catch {
        /* skip unreachable images */
      }
    }),
  );

  return html.replace(/src="(\/[^"]+)"/g, (_full, path: string) => {
    const dataUri = cache.get(path);
    return dataUri ? `src="${dataUri}"` : _full;
  });
}
