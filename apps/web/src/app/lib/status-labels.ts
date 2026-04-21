/**
 * Status labels for board status column. Persisted in localStorage (aidvisora_labels).
 */

import { migrateLocalStorageKey } from "@/lib/storage/migrate-weplan-local-storage";

export type StatusLabel = {
  id: string;
  label: string;
  color: string;
  /** Zapnuto = buňky s tímto štítkem se započítají do „Potenciálních obchodů“ v horní liště boardu. */
  countsTowardPotential?: boolean;
};

export const STATUS_LABELS_UPDATED_EVENT = "aidvisora_labels_updated";

const STORAGE_KEY = "aidvisora_labels";

/** Před zavedením příznaku u štítků se tyto id započítávaly do potenciálních obchodů (zpětná kompatibilita). */
export const LEGACY_POTENTIAL_STATUS_IDS = new Set(["rozděláno", "k-podpisu", "domluvit"]);

export function getPotentialDealStatusIds(labels: StatusLabel[]): Set<string> {
  return new Set(
    labels.filter((l) => l.countsTowardPotential === true).map((l) => l.id)
  );
}

/** Původní výchozí sada (migrace / testy); nový uživatel začíná s prázdným seznamem v localStorage. */
export const DEFAULT_STATUS_OPTIONS: StatusLabel[] = [
  { id: "hotovo", label: "Hotovo", color: "#00c875" },
  { id: "rozděláno", label: "Rozděláno", color: "#fdab3d", countsTowardPotential: true },
  { id: "k-podpisu", label: "K podpisu", color: "#ffcb00", countsTowardPotential: true },
  { id: "zatím-ne", label: "Zatím ne", color: "#579bfc" },
  { id: "domluvit", label: "DOMLUVIT", color: "#037f4c", countsTowardPotential: true },
  { id: "x", label: "x", color: "#333333" },
  /** Legacy id z anglických šablon – zobrazovat jako Hotovo (stejné jako hotovo) */
  { id: "done", label: "Hotovo", color: "#00c875" },
];

export function getStatusLabels(): StatusLabel[] {
  if (typeof window === "undefined") return [];
  migrateLocalStorageKey("weplan_labels", STORAGE_KEY);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StatusLabel[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    const normalized = parsed
      .map((item, idx) => {
        if (!item || typeof item !== "object") return null;
        const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `label_${idx}`;
        const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : `Štítek ${idx + 1}`;
        const color = typeof item.color === "string" && item.color.trim() ? item.color.trim() : "#579bfc";
        const rawPotential = (item as { countsTowardPotential?: unknown }).countsTowardPotential;
        const countsTowardPotential =
          typeof rawPotential === "boolean" ? rawPotential : LEGACY_POTENTIAL_STATUS_IDS.has(id);
        const row: StatusLabel = { id, label, color, countsTowardPotential };
        return row;
      })
      .filter((item): item is StatusLabel => item != null);
    return normalized.length > 0 ? normalized : [];
  } catch {
    return [];
  }
}

export function setStatusLabels(labels: StatusLabel[]): void {
  if (typeof window === "undefined") return;
  try {
    if (labels.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(STATUS_LABELS_UPDATED_EVENT));
      return;
    }
    const sanitized = labels
      .map((label, idx) => ({
        id: label.id?.trim() || `label_${idx}`,
        label: label.label?.trim() || `Štítek ${idx + 1}`,
        color: label.color?.trim() || "#579bfc",
        countsTowardPotential: label.countsTowardPotential === true,
      }))
      .slice(0, 50);
    if (sanitized.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(STATUS_LABELS_UPDATED_EVENT));
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent(STATUS_LABELS_UPDATED_EVENT));
  } catch {
    // ignore
  }
}

/**
 * Paleta pro auto-registrované labely bez uživatelského nastavení.
 * Index se deterministicky odvozuje z id (hash) — stejné id → stejná barva napříč sessions.
 */
const AUTO_LABEL_PALETTE: string[] = [
  "#579bfc", // blue
  "#037f4c", // green
  "#fdab3d", // orange
  "#e2445c", // red
  "#a25ddc", // violet
  "#00c875", // emerald
  "#7f5af0", // indigo
  "#0073ea", // cobalt
  "#ff7575", // coral
  "#9aadbd", // slate
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function autoPaletteColor(id: string): string {
  const palette = AUTO_LABEL_PALETTE;
  const fallback = palette[0] ?? "#579bfc";
  return palette[hashString(id) % palette.length] ?? fallback;
}

/**
 * Čitelný humanizovaný popisek z raw id.
 *   "label_1776298128" → "Štítek #28128"
 *   "k-podpisu"        → "K podpisu"
 *   "rozdelano"        → "Rozdelano"
 */
function humanizeLabelId(id: string): string {
  const ts = id.match(/^label_(\d+)$/);
  if (ts) {
    const digits = ts[1]!;
    const short = digits.slice(-5);
    return `Štítek #${short}`;
  }
  const cleaned = id.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "Štítek";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function getStatusById(labels: StatusLabel[], id: string): StatusLabel {
  const empty: StatusLabel = { id: "", label: "", color: "#e5e5e5" };
  if (!id?.trim()) return empty;
  const found = labels.find((s) => s.id === id);
  if (found) return found;
  if (id === "done") {
    return { id: "done", label: "Hotovo", color: "#00c875" };
  }
  // Fallback: už žádné raw id v UI – derivujeme čitelný label + deterministickou barvu z palette.
  return { id, label: humanizeLabelId(id), color: autoPaletteColor(id) };
}
