import type { z } from "zod";

/** Last 1–2 path segments for readable labels (avoid dumping full JSON paths). */
function pathLabel(path: z.ZodIssue["path"]): string {
  if (!path.length) return "kořen dokumentu";
  const tail = path
    .filter((p): p is string | number => typeof p === "string" || typeof p === "number")
    .map(String)
    .slice(-2);
  return tail.length ? tail.join(" › ") : "kořen dokumentu";
}

/**
 * Short Czech summary for advisor UI when model JSON fails Zod (no raw enum dumps in primary copy).
 */
export function summarizeZodIssuesForAdvisor(issues: z.ZodIssue[], maxIssues = 4): string {
  if (!issues.length) return "Struktura odpovědi AI neodpovídá očekávanému formátu.";
  const parts: string[] = [];
  for (const issue of issues.slice(0, maxIssues)) {
    const label = pathLabel(issue.path);
    const code = String(issue.code);
    switch (code) {
      case "invalid_enum_value":
      case "invalid_value":
        parts.push(`Pole „${label}“ obsahuje hodnotu, která není v seznamu povolených variant.`);
        break;
      case "invalid_type":
        parts.push(`Pole „${label}“ má neočekávaný typ dat.`);
        break;
      case "invalid_string":
      case "invalid_format":
        parts.push(`Pole „${label}“ nevyhovuje formátu textu.`);
        break;
      case "too_small":
        parts.push(`Pole „${label}“ je prázdné nebo příliš krátké.`);
        break;
      case "too_big":
        parts.push(`Pole „${label}“ je příliš dlouhé.`);
        break;
      case "unrecognized_keys":
        parts.push(`Objekt „${label}“ obsahuje neočekávané vlastnosti.`);
        break;
      case "invalid_union":
        parts.push(`Pole „${label}“ neodpovídá žádné z povolených variant struktury.`);
        break;
      case "custom":
        parts.push(
          issue.message && !/^invalid /i.test(issue.message)
            ? `„${label}“: ${issue.message}`
            : `Problém u „${label}“.`
        );
        break;
      default:
        parts.push(`Problém u „${label}“.`);
    }
  }
  const rest = issues.length > maxIssues ? ` (+${issues.length - maxIssues} dalších míst)` : "";
  return parts.join(" ") + rest;
}
