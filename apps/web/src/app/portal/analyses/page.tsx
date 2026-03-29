import {
  listFinancialAnalyses,
  type FinancialAnalysisListItem,
} from "@/app/actions/financial-analyses";
import AnalysesPageClient from "./AnalysesPageClient";

function toIso(d: Date | string | null | undefined): string | null | undefined {
  if (d === undefined) return undefined;
  if (d === null) return null;
  if (d instanceof Date) return d.toISOString();
  return typeof d === "string" ? d : null;
}

/** Explicitní serializace přes hranici RSC → klient (Date → ISO). */
function serializeAnalysesForClient(
  list: Awaited<ReturnType<typeof listFinancialAnalyses>>
): FinancialAnalysisListItem[] {
  return list.map((a) => ({
    ...a,
    createdAt: toIso(a.createdAt) ?? String(a.createdAt),
    updatedAt: toIso(a.updatedAt) ?? String(a.updatedAt),
    lastExportedAt: toIso(a.lastExportedAt) ?? null,
    lastRefreshedFromSharedAt: toIso(a.lastRefreshedFromSharedAt),
  }));
}

export default async function AnalysesPage() {
  let analyses: Awaited<ReturnType<typeof listFinancialAnalyses>> = [];
  try {
    analyses = await listFinancialAnalyses();
  } catch (err) {
    console.error("[AnalysesPage] listFinancialAnalyses failed:", err);
    analyses = [];
  }

  return <AnalysesPageClient analyses={serializeAnalysesForClient(analyses)} />;
}
