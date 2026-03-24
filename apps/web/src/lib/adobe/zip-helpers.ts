import JSZip from "jszip";

export async function unzipTextByPathPredicate(
  zipBytes: ArrayBuffer,
  predicate: (path: string) => boolean
): Promise<string | null> {
  const zip = await JSZip.loadAsync(zipBytes);
  const names = Object.keys(zip.files).sort();
  for (const path of names) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    if (predicate(path)) {
      return entry.async("string");
    }
  }
  return null;
}

export function isZipBuffer(buffer: ArrayBuffer): boolean {
  const u8 = new Uint8Array(buffer);
  return u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4b;
}

export async function unzipStructuredDataJson(zipBytes: ArrayBuffer): Promise<string | null> {
  return unzipTextByPathPredicate(zipBytes, (p) => /(^|\/)structuredData\.json$/i.test(p));
}

export async function unzipFirstMarkdown(zipBytes: ArrayBuffer): Promise<string | null> {
  return unzipTextByPathPredicate(zipBytes, (p) => /\.md$/i.test(p));
}
