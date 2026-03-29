import { Suspense } from "react";
import {
  listFinancialAnalyses,
  type FinancialAnalysisListItem,
} from "@/app/actions/financial-analyses";
import AnalysesPageClient from "./AnalysesPageClient";

function AnalysesPageSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-6 md:p-8">
      <div className="space-y-2">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-[color:var(--wp-surface-muted)]" />
        <div className="h-4 w-2/3 max-w-md animate-pulse rounded bg-[color:var(--wp-surface-muted)]/80" />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-full max-w-md animate-pulse rounded-xl bg-[color:var(--wp-surface-muted)]" />
        <div className="h-10 w-32 animate-pulse rounded-xl bg-[color:var(--wp-surface-muted)]" />
      </div>
      <div className="space-y-3 pt-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/60"
          />
        ))}
      </div>
    </div>
  );
}

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

async function AnalysesData() {
  let analyses: Awaited<ReturnType<typeof listFinancialAnalyses>> = [];
  try {
    analyses = await listFinancialAnalyses();
  } catch (err) {
    console.error("[AnalysesPage] listFinancialAnalyses failed:", err);
    analyses = [];
  }

  return <AnalysesPageClient analyses={serializeAnalysesForClient(analyses)} />;
}

export default function AnalysesPage() {
  return (
    <Suspense fallback={<AnalysesPageSkeleton />}>
      <AnalysesData />
    </Suspense>
  );
}
