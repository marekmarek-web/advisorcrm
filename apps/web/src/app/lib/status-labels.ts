/**
 * Status labels for board status column.
 *
 * Dvouvrstvá perzistence:
 *   1. `localStorage` (klíč `aidvisora_labels`) — rychlý synchronní read pro
 *      `getStatusById()` všude v UI (tabulky, filtry, reporty).
 *   2. `board_labels` tabulka v DB (per-tenant, RLS) — zajišťuje, že
 *      desktop a mobilní WebView (Capacitor iOS) vidí stejnou sadu i když
 *      mají oddělené WebKit localStorage.
 *
 * Synchronizace:
 *   - Při bootu (nebo on-demand) `hydrateBoardLabelsFromServer()` natáhne sadu
 *     z DB a přepíše localStorage.
 *   - Při každém `setStatusLabels()` se změny v pozadí pushne na server přes
 *     `bulkUpsertBoardLabels()`.
 */

import { migrateLocalStorageKey } from "@/lib/storage/migrate-weplan-local-storage";
import { bulkUpsertBoardLabels, listBoardLabels } from "@/app/actions/board-labels";

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
        const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : "";
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
      void pushLabelsToServer([]);
      return;
    }
    const sanitized = labels
      .map((label, idx) => ({
        id: label.id?.trim() || `label_${idx}`,
        label: label.label?.trim() || "",
        color: label.color?.trim() || "#579bfc",
        countsTowardPotential: label.countsTowardPotential === true,
      }))
      .slice(0, 50);
    if (sanitized.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(STATUS_LABELS_UPDATED_EVENT));
      void pushLabelsToServer([]);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent(STATUS_LABELS_UPDATED_EVENT));
    void pushLabelsToServer(sanitized);
  } catch {
    // ignore
  }
}

/** Fire-and-forget: pošle aktuální sadu na server. Chyba se pouze zaloguje. */
async function pushLabelsToServer(labels: StatusLabel[]): Promise<void> {
  try {
    await bulkUpsertBoardLabels(
      labels.map((l, idx) => ({
        id: l.id,
        label: l.label ?? "",
        color: l.color,
        isClosedDeal: l.countsTowardPotential === true,
        sortIndex: idx,
      })),
    );
  } catch (err) {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[status-labels] push to server failed", err);
    }
  }
}

let hydrationPromise: Promise<void> | null = null;

/**
 * Stáhne sadu z DB a přepíše localStorage. Pokud je DB prázdná a v LS už něco
 * je, naopak nahraje LS na server (one-time seed). Vícenásobné volání za
 * kratkou dobu se deduplikuje.
 */
export function hydrateBoardLabelsFromServer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    try {
      const serverRows = await listBoardLabels();
      if (serverRows.length === 0) {
        const existingLocal = getStatusLabels();
        if (existingLocal.length > 0) {
          await pushLabelsToServer(existingLocal);
        }
        return;
      }
      const normalized: StatusLabel[] = serverRows.map((r) => ({
        id: r.id,
        label: r.label ?? "",
        color: r.color,
        countsTowardPotential: r.isClosedDeal || LEGACY_POTENTIAL_STATUS_IDS.has(r.id),
      }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent(STATUS_LABELS_UPDATED_EVENT));
    } catch (err) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn("[status-labels] hydrate failed", err);
      }
    } finally {
      // Povolíme další hydrataci za chvíli (explicit refresh po editaci).
      setTimeout(() => {
        hydrationPromise = null;
      }, 1500);
    }
  })();
  return hydrationPromise;
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
 *   "label_1776298128" → ""           (id vytvořené timestampem — bez jména zobrazujeme jen barvu)
 *   "k-podpisu"        → "K podpisu"
 *   "rozdelano"        → "Rozdelano"
 */
function humanizeLabelId(id: string): string {
  if (/^label_\d+$/.test(id)) return "";
  const cleaned = id.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "";
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

/** Stejná zelená jako výchozí „Hotovo“ (Monday); tmavě zelené „domluvit“ záměrně ne. */
const HOTOVO_SUCCESS_HEX_NORM = "00c875";

function normalizeLabelHex(color: string): string {
  const c = color.trim().toLowerCase().replace(/^#/, "");
  if (c.length === 3) {
    return c
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  return c.slice(0, 6);
}

/** Spustit konfeti jen při přechodu na úspěšný status (ne při stejném id). */
export function shouldCelebrateBoardStatus(
  newId: string,
  prevId: string,
  labels: StatusLabel[],
): boolean {
  const next = String(newId ?? "").trim();
  const prev = String(prevId ?? "").trim();
  if (!next || prev === next) return false;
  if (next === "hotovo" || next === "done") return true;
  const meta = getStatusById(labels, next);
  return normalizeLabelHex(meta.color) === HOTOVO_SUCCESS_HEX_NORM;
}
