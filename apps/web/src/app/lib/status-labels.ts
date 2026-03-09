/**
 * Status labels for board status column. Persisted in localStorage (weplan_labels).
 */

export type StatusLabel = { id: string; label: string; color: string };

const STORAGE_KEY = "weplan_labels";

export const DEFAULT_STATUS_OPTIONS: StatusLabel[] = [
  { id: "hotovo", label: "Hotovo", color: "#00c875" },
  { id: "rozděláno", label: "Rozděláno", color: "#fdab3d" },
  { id: "k-podpisu", label: "K podpisu", color: "#ffcb00" },
  { id: "zatím-ne", label: "Zatím ne", color: "#579bfc" },
  { id: "domluvit", label: "DOMLUVIT", color: "#037f4c" },
  { id: "x", label: "x", color: "#333333" },
  { id: "done", label: "✓", color: "#00c875" },
];

export function getStatusLabels(): StatusLabel[] {
  if (typeof window === "undefined") return [...DEFAULT_STATUS_OPTIONS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_STATUS_OPTIONS];
    const parsed = JSON.parse(raw) as StatusLabel[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_STATUS_OPTIONS];
  } catch {
    return [...DEFAULT_STATUS_OPTIONS];
  }
}

export function setStatusLabels(labels: StatusLabel[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
    window.dispatchEvent(new CustomEvent("weplan_labels_updated"));
  } catch {
    // ignore
  }
}

export function getStatusById(labels: StatusLabel[], id: string): StatusLabel {
  return labels.find((s) => s.id === id) ?? labels[0] ?? DEFAULT_STATUS_OPTIONS[0];
}
