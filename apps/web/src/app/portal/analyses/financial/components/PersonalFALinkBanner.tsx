"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, RefreshCw, LinkOff, Loader2 } from "lucide-react";
import { getCompaniesForContact } from "@/app/actions/company-person-links";
import { getSharedFactsForContact } from "@/app/actions/shared-facts";
import { applyRefreshFromShared, clearFinancialAnalysisLink, getFinancialAnalysis } from "@/app/actions/financial-analyses";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { sharedFactsToProposedPersonalPatch } from "@/lib/analyses/shared-facts/sharedFactsMapper";
import { diffSnapshotAgainstShared } from "@/lib/analyses/shared-facts/diffSnapshotAgainstShared";
import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";

type CompanyWithLink = Awaited<ReturnType<typeof getCompaniesForContact>>[number];

export function PersonalFALinkBanner() {
  const contactId = useFinancialAnalysisStore((s) => s.data.clientId);
  const analysisId = useFinancialAnalysisStore((s) => s.analysisId);
  const data = useFinancialAnalysisStore((s) => s.data);
  const linkedCompanyId = useFinancialAnalysisStore((s) => s.linkedCompanyId);
  const lastRefreshedFromSharedAt = useFinancialAnalysisStore((s) => s.lastRefreshedFromSharedAt);
  const loadFromServerPayload = useFinancialAnalysisStore((s) => s.loadFromServerPayload);
  const setLinkMetadata = useFinancialAnalysisStore((s) => s.setLinkMetadata);

  const [companies, setCompanies] = useState<CompanyWithLink[]>([]);
  const [sharedFactsCount, setSharedFactsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [diffModal, setDiffModal] = useState<{ companyId: string; companyName?: string } | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  const reloadFromServer = useCallback(async () => {
    if (!analysisId) return;
    const row = await getFinancialAnalysis(analysisId);
    if (row?.payload) {
      loadFromServerPayload(row.payload as { data: Record<string, unknown>; currentStep: number });
      setLinkMetadata(
        (row as { linkedCompanyId?: string | null; lastRefreshedFromSharedAt?: Date | null }).linkedCompanyId ?? null,
        (row as { linkedCompanyId?: string | null; lastRefreshedFromSharedAt?: Date | null }).lastRefreshedFromSharedAt ?? null
      );
    }
  }, [analysisId, loadFromServerPayload, setLinkMetadata]);

  useEffect(() => {
    if (!contactId || !analysisId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getCompaniesForContact(contactId), getSharedFactsForContact(contactId)])
      .then(([comp, facts]) => {
        if (!cancelled) {
          setCompanies(comp);
          setSharedFactsCount(facts.length);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, analysisId]);

  const showDiffAndApply = (companyId: string, companyName?: string) => {
    setDiffModal({ companyId, companyName });
  };

  const handleApplyAll = async () => {
    if (!diffModal || !analysisId) return;
    setApplyLoading(true);
    try {
      const res = await applyRefreshFromShared(analysisId, diffModal.companyId);
      if (res.ok) await reloadFromServer();
      setDiffModal(null);
    } finally {
      setApplyLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!analysisId) return;
    setUnlinkLoading(true);
    try {
      const res = await clearFinancialAnalysisLink(analysisId);
      if (res.ok) {
        setLinkMetadata(null, null);
        await reloadFromServer();
      }
    } finally {
      setUnlinkLoading(false);
    }
  };

  const openLoadModal = () => {
    const companyId =
      linkedCompanyId ??
      (companies.length === 1 ? companies[0]?.companyId : selectedCompanyId || companies[0]?.companyId);
    const companyName = companies.find((c) => c.companyId === companyId)?.companyName;
    if (companyId) showDiffAndApply(companyId, companyName);
    else setDiffModal({ companyId: "", companyName: undefined });
  };

  const canLoad = linkedCompanyId != null || companies.length === 1 || selectedCompanyId != null;

  const hasCompaniesOrFacts = companies.length > 0 || sharedFactsCount > 0;
  if (!contactId || !analysisId || !hasCompaniesOrFacts) return null;

  return (
    <>
      <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-indigo-800">
          <Building2 className="h-5 w-5 shrink-0 text-indigo-600" />
          <span>
            Tento klient je napojen na {companies.length} {companies.length === 1 ? "firmu" : "firem"}.
            {sharedFactsCount > 0 && ` K dispozici jsou firemní příjmy, ručení a benefitní data (${sharedFactsCount} položek).`}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {companies.length > 1 && !linkedCompanyId && (
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Vyberte firmu</option>
              {companies.map((c) => (
                <option key={c.companyId} value={c.companyId}>
                  {c.companyName ?? c.companyId}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={openLoadModal}
            disabled={loading || !canLoad}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {linkedCompanyId ? "Aktualizovat propojené položky" : "Načíst firemní data"}
          </button>
          {linkedCompanyId && (
            <button
              type="button"
              onClick={handleUnlink}
              disabled={unlinkLoading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {unlinkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkOff className="h-4 w-4" />}
              Odpojit analýzu
            </button>
          )}
          {lastRefreshedFromSharedAt && (
            <span className="text-indigo-600 text-xs">
              Poslední synchronizace: {new Date(lastRefreshedFromSharedAt).toLocaleDateString("cs-CZ")}
            </span>
          )}
        </div>
        {companies.length > 1 && !linkedCompanyId && (
          <p className="mt-2 text-xs text-indigo-700">
            Vyberte firmu z výběru a klikněte na „Načíst firemní data“.
          </p>
        )}
      </div>

      {diffModal && diffModal.companyId && (
        <DiffApplyModal
          companyName={diffModal.companyName}
          currentData={data}
          contactId={contactId}
          companyId={diffModal.companyId}
          onApply={handleApplyAll}
          onCancel={() => setDiffModal(null)}
          applyLoading={applyLoading}
        />
      )}
    </>
  );
}

function DiffApplyModal({
  companyName,
  currentData,
  contactId,
  companyId,
  onApply,
  onCancel,
  applyLoading,
}: {
  companyName?: string;
  currentData: FinancialAnalysisData;
  contactId: string;
  companyId: string;
  onApply: () => Promise<void>;
  onCancel: () => void;
  applyLoading: boolean;
}) {
  const [diffItems, setDiffItems] = useState<Awaited<ReturnType<typeof diffSnapshotAgainstShared>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getSharedFactsForContact(contactId);
      const facts = rows.filter((r) => r.companyId === companyId).map((r) => ({
        id: r.id,
        factType: r.factType,
        value: r.value,
        contactId: r.contactId,
        companyId: r.companyId!,
      }));
      const patch = sharedFactsToProposedPersonalPatch(facts, currentData);
      const diff = diffSnapshotAgainstShared(currentData, facts);
      if (!cancelled) {
        setDiffItems(diff);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, companyId, currentData]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-800">
          {companyName ? `Načíst data z firmy ${companyName}` : "Načíst firemní data"}
        </h3>
        {loading ? (
          <p className="mt-4 text-slate-500">Načítání změn…</p>
        ) : diffItems.length === 0 ? (
          <p className="mt-4 text-slate-600">Žádné nové změny oproti aktuálním údajům.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {diffItems.map((item) => (
              <li key={item.path} className="flex flex-wrap gap-2 text-sm">
                <span className="font-medium text-slate-700">{item.label}:</span>
                <span className="text-slate-500">
                  {String(item.current ?? "—")} → {String(item.proposed ?? "—")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex gap-3">
          {!loading && diffItems.length > 0 && (
            <button
              type="button"
              onClick={onApply}
              disabled={applyLoading}
              className="min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {applyLoading ? "Ukládám…" : "Přepsat vše"}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-xl border border-slate-200 px-4 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}
