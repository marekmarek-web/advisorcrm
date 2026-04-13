"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, LayoutList, Briefcase, AlertCircle, Info } from "lucide-react";
import { getPipelineByContact } from "@/app/actions/pipeline";
import type { StageWithOpportunities } from "@/app/actions/pipeline";
import { PipelineBoardDynamic } from "@/app/dashboard/pipeline/PipelineBoardDynamic";
import { PipelineBoardSkeleton } from "@/app/dashboard/pipeline/PipelineBoardSkeleton";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

type ContactOption = { id: string; firstName: string; lastName: string };

const retryButtonClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-[14px] border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] px-6 py-2.5 text-sm font-bold text-[color:var(--wp-text)] shadow-sm transition-all hover:bg-[color:var(--wp-surface-muted)] active:scale-[0.98]";

const secondaryLinkClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-[14px] border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] px-6 py-2.5 text-sm font-bold text-[color:var(--wp-text)] shadow-sm transition-all hover:bg-[color:var(--wp-surface-muted)] no-underline active:scale-[0.98]";

function humanizePipelineLoadError(message: string): string {
  const m = message.trim();
  if (m === "Forbidden" || /^forbidden$/i.test(m)) {
    return "Nemáte oprávnění zobrazit obchody tohoto klienta. Požádejte správce o oprávnění „Obchody — čtení“.";
  }
  return m;
}

export type ContactOpportunityBoardProps = {
  contactId: string;
  contactFirstName?: string;
  contactLastName?: string;
  /** Odkaz na nastavení fází (portal vs dashboard). */
  pipelineSettingsHref?: string;
  /**
   * Nepovinné upozornění nad boardem (např. neúplná identita) — neblokuje zobrazení ani práci s boardem.
   */
  identityAdvisoryNote?: string | null;
  /** Může uživatel zakládat a měnit obchody (opportunities:write). */
  canWriteOpportunities?: boolean;
};

export function ContactOpportunityBoard({
  contactId,
  contactFirstName,
  contactLastName,
  pipelineSettingsHref = "/portal/pipeline",
  identityAdvisoryNote,
  canWriteOpportunities = true,
}: ContactOpportunityBoardProps) {
  const [stages, setStages] = useState<StageWithOpportunities[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [openCreateStageId, setOpenCreateStageId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const newOpportunityConsumed = useRef(false);

  const readOnly = !canWriteOpportunities;

  useEffect(() => {
    let cancelled = false;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    setLoading(true);
    setLoadError(null);
    getPipelineByContact(contactId)
      .then((data) => {
        if (!cancelled) setStages(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setStages([]);
          const raw = err instanceof Error ? err.message : "Nepodařilo se načíst obchody.";
          setLoadError(humanizePipelineLoadError(raw));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
          if (process.env.NODE_ENV !== "production") {
            console.info("[perf] contact-pipeline-load-ms", Math.round(t1 - t0), { contactId });
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, retry]);

  const firstStageId = stages[0]?.id ?? null;

  useEffect(() => {
    if (readOnly) return;
    if (newOpportunityConsumed.current) return;
    if (searchParams.get("newOpportunity") !== "1") return;
    if (loading || !firstStageId) return;
    startTransition(() => setOpenCreateStageId(firstStageId));
    newOpportunityConsumed.current = true;
    const q = new URLSearchParams(searchParams.toString());
    q.delete("newOpportunity");
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [readOnly, searchParams, pathname, router, loading, firstStageId]);

  const contactsForCreate: ContactOption[] = [
    { id: contactId, firstName: contactFirstName ?? "", lastName: contactLastName ?? "" },
  ];

  const totalOpportunities = stages.reduce((sum, s) => sum + s.opportunities.length, 0);
  const isEmpty = totalOpportunities === 0 && stages.length > 0;
  const noStages = stages.length === 0;

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-4 py-4 shrink-0">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--wp-text)" }}>
          Obchody
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--wp-text-muted)" }}>
          Případy a obchody navázané na tohoto klienta.
        </p>
      </div>
      {!noStages && !readOnly && (
        <CreateActionButton
          type="button"
          onClick={() => firstStageId && setOpenCreateStageId(firstStageId)}
          disabled={!firstStageId || loading}
          icon={Briefcase}
        >
          Nový obchod
        </CreateActionButton>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      {identityAdvisoryNote ? (
        <div className="mx-4 mt-2 mb-1 flex gap-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
          <Info className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          <div>
            <p className="font-semibold">Doplnění údajů klienta (doporučení)</p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">{identityAdvisoryNote}</p>
          </div>
        </div>
      ) : null}

      {readOnly && !loading && !loadError && (
        <div className="mx-4 mt-2 mb-1 flex gap-3 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-4 py-3 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-[color:var(--wp-text-secondary)]" aria-hidden />
          <p className="text-[color:var(--wp-text-secondary)]">
            Můžete obchody prohlížet, ale nemáte oprávnění je zakládat, přesouvat ani upravovat. Požádejte správce o
            oprávnění „Obchody — zápis“.
          </p>
        </div>
      )}

      {header}
      <div className="flex-1 min-h-0 px-4 pb-4 w-full">
        {loading && <PipelineBoardSkeleton />}

        {!loading && loadError && (
          <div className="rounded-[var(--wp-radius-sm)] border-2 border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)]">
            <p className="text-[color:var(--wp-text-secondary)] text-sm mb-4">{loadError}</p>
            <button type="button" onClick={() => setRetry((r) => r + 1)} className={retryButtonClass}>
              Zkusit znovu
            </button>
          </div>
        )}

        {!loading && !loadError && noStages && (
          <div className="flex flex-col items-center justify-center rounded-[var(--wp-radius-sm)] border-2 border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 p-8 min-h-[200px]">
            <LayoutList size={40} className="text-[color:var(--wp-text-tertiary)] mb-3" />
            <h2 className="text-lg font-bold text-[color:var(--wp-text)] mb-1">Obchodní nástěnka není nastavená</h2>
            <p className="text-sm text-[color:var(--wp-text-secondary)] text-center mb-4">
              Bez fází nelze založit nový obchod. Nastavte je v modulu Obchody.
            </p>
            <Link href={pipelineSettingsHref} className={secondaryLinkClass}>
              Přejít do Obchodů
            </Link>
          </div>
        )}

        {!loading && !loadError && !noStages && isEmpty && !openCreateStageId && (
          <div className="flex flex-col items-center justify-center rounded-[var(--wp-radius-sm)] border-2 border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/50 p-8 min-h-[200px]">
            <CheckCircle2 size={40} className="text-[color:var(--wp-text-tertiary)] mb-3" />
            <h2 className="text-lg font-bold text-[color:var(--wp-text)] mb-1">Tento klient zatím nemá žádný obchod</h2>
            <p className="text-sm text-[color:var(--wp-text-secondary)] text-center mb-4">
              Vytvořte první obchod a přiřaďte ho do příslušného stupně.
            </p>
            {!readOnly && (
              <CreateActionButton
                type="button"
                onClick={() => firstStageId && setOpenCreateStageId(firstStageId)}
                disabled={!firstStageId}
                icon={Briefcase}
              >
                Vytvořit první obchod
              </CreateActionButton>
            )}
            <p className="text-xs text-[color:var(--wp-text-tertiary)] mt-4 text-center">
              Později zde budete moci založit obchod z AI příležitosti.
            </p>
          </div>
        )}

        {!loading && !loadError && !noStages && (!isEmpty || openCreateStageId) && (
          <PipelineBoardDynamic
            stages={stages}
            contacts={contactsForCreate}
            contactContext={{ contactId }}
            onMutationComplete={() => getPipelineByContact(contactId).then(setStages)}
            initialOpenCreateStageId={openCreateStageId}
            onOpenCreateConsumed={() => setOpenCreateStageId(null)}
            readOnly={readOnly}
          />
        )}
      </div>
    </div>
  );
}
