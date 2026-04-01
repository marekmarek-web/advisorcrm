import { Suspense } from "react";
import { listFinancialAnalyses } from "@/app/actions/financial-analyses";
import { translateFinancialAnalysisActionError } from "@/lib/analyses/financial/financialAnalysisErrors";
import { serializeFinancialAnalysesForClient } from "./analyses-page-utils";
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

async function AnalysesData() {
  let analyses: Awaited<ReturnType<typeof listFinancialAnalyses>> = [];
  let loadError: string | null = null;
  try {
    analyses = await listFinancialAnalyses();
  } catch (err) {
    console.error("[AnalysesPage] listFinancialAnalyses failed:", err);
    analyses = [];
    const msg = err instanceof Error ? err.message : "";
    loadError = msg
      ? translateFinancialAnalysisActionError(msg)
      : "Nepodařilo se načíst seznam finančních analýz. Zkuste stránku obnovit nebo to opakovat později.";
  }

  return (
    <AnalysesPageClient
      analyses={serializeFinancialAnalysesForClient(analyses)}
      loadError={loadError}
    />
  );
}

export default function AnalysesPage() {
  return (
    <Suspense fallback={<AnalysesPageSkeleton />}>
      <AnalysesData />
    </Suspense>
  );
}
