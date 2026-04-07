import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { getContractSegments } from "@/app/actions/contracts";
import {
  getTerminationIntakeDraftForWizard,
  getTerminationWizardPrefill,
  type TerminationIntakeDraftWizardState,
} from "@/app/actions/terminations";
import { getReasonsForSegment } from "@/lib/terminations";
import { TerminationIntakeWizard, type WizardReasonOption } from "./TerminationIntakeWizard";
import { isTerminationsModuleEnabledOnServer } from "@/lib/terminations/terminations-feature-flag";

export const metadata: Metadata = {
  title: "Výpověď smlouvy",
};

export const dynamic = "force-dynamic";

export default async function TerminationNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    contactId?: string;
    contractId?: string;
    source?: string;
    insurerName?: string;
    requestedEffectiveDate?: string;
    sourceDocumentId?: string;
    draftId?: string;
  }>;
}) {
  const auth = await requireAuth();
  if (auth.roleName === "Client") {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-red-600">Nepovoleno.</p>
      </div>
    );
  }

  if (!isTerminationsModuleEnabledOnServer()) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-[color:var(--wp-text-secondary)]">Modul výpovědí je vypnutý.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const contactId = sp.contactId?.trim() || null;
  const contractId = sp.contractId?.trim() || null;
  const sourceQuick = sp.source === "quick";
  const sourceFromAi = sp.source === "ai_chat";

  const draftId = sp.draftId?.trim() || null;
  let loadedDraft: TerminationIntakeDraftWizardState | null = null;
  let draftLoadError: string | null = null;
  if (draftId) {
    const d = await getTerminationIntakeDraftForWizard(draftId);
    if (d.ok) {
      loadedDraft = d.data;
    } else {
      draftLoadError = d.error;
    }
  }

  const effectiveContactId = loadedDraft?.contactId ?? contactId;
  const effectiveContractId = loadedDraft?.contractId ?? contractId;
  const prefill = await getTerminationWizardPrefill(effectiveContactId, effectiveContractId);
  const segments = await getContractSegments();
  const seg =
    loadedDraft?.productSegment?.trim() || prefill.productSegment || segments[0] || "ZP";
  const reasonRows = await getReasonsForSegment(auth.tenantId, seg);
  const initialReasons: WizardReasonOption[] = reasonRows.map((r) => ({
    id: r.id,
    reasonCode: r.reasonCode,
    labelCs: r.labelCs,
    defaultDateComputation: r.defaultDateComputation,
  }));
  const canWrite = hasPermission(auth.roleName, "contacts:write");

  const urlPrefill = {
    insurerName: sp.insurerName?.trim(),
    requestedEffectiveDate: sp.requestedEffectiveDate?.trim(),
    sourceDocumentId: sp.sourceDocumentId?.trim(),
  };

  return (
    <div className="p-4 md:p-8">
      <Suspense fallback={<p className="text-sm text-[color:var(--wp-text-secondary)]">Načítání průvodce…</p>}>
        <TerminationIntakeWizard
          prefill={prefill}
          segments={segments.length ? segments : ["ZP"]}
          initialReasons={initialReasons}
          canWrite={canWrite}
          sourceQuick={sourceQuick}
          sourceFromAi={sourceFromAi}
          urlPrefill={urlPrefill}
          loadedDraft={loadedDraft}
          draftLoadError={draftLoadError}
        />
      </Suspense>
    </div>
  );
}
