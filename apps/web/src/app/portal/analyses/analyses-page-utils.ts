import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";

function toIso(d: Date | string | null | undefined): string | null | undefined {
  if (d === undefined) return undefined;
  if (d === null) return null;
  if (d instanceof Date) return d.toISOString();
  return typeof d === "string" ? d : null;
}

/** Stejná serializace jako u RSC ([page.tsx](page.tsx)) – Date → ISO pro klient. */
export function serializeFinancialAnalysesForClient(
  list: FinancialAnalysisListItem[]
): FinancialAnalysisListItem[] {
  return list.map((a) => ({
    ...a,
    createdAt: toIso(a.createdAt as Date | string) ?? String(a.createdAt),
    updatedAt: toIso(a.updatedAt as Date | string) ?? String(a.updatedAt),
    lastExportedAt: toIso(a.lastExportedAt as Date | string | null) ?? null,
    lastRefreshedFromSharedAt: toIso(a.lastRefreshedFromSharedAt as Date | string | null | undefined),
  }));
}

export function formatUpdated(updatedAt: Date | string): string {
  const d = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return `Dnes, ${d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return `Včera, ${d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays < 7) return `Před ${diffDays} dny`;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
}

export type TabId = "all" | "draft" | "review" | "completed";

export const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "Všechny" },
  { id: "draft", label: "Koncepty" },
  { id: "review", label: "Ke schválení" },
  { id: "completed", label: "Hotové" },
];

export function matchesTab(a: FinancialAnalysisListItem, tab: TabId): boolean {
  if (tab === "all") return true;
  if (tab === "draft") return a.status === "draft" || a.status === "archived";
  if (tab === "review") return a.status === "review";
  if (tab === "completed") return a.status === "completed" || a.status === "exported";
  return true;
}

export function isCompleted(status: string): boolean {
  return status === "completed" || status === "exported";
}
