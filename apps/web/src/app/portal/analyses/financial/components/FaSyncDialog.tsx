"use client";

import { useState, useEffect } from "react";
import { getFaSyncPreview, syncFaToContacts } from "@/app/actions/fa-sync";
import type { FaSyncPreview } from "@/lib/analyses/financial/contactSync";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import clsx from "clsx";
import { Users, UserPlus, Home, CheckCircle, AlertTriangle, Loader2, X } from "lucide-react";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";

const ROLE_LABELS: Record<string, string> = {
  primary: "Hlavní klient",
  partner: "Partner",
  child: "Dítě",
};

export function FaSyncDialog({ analysisId, onClose, onDone }: {
  analysisId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<FaSyncPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [createHousehold, setCreateHousehold] = useState(true);
  const [householdName, setHouseholdName] = useState("");
  const setData = useFinancialAnalysisStore((s) => s.setData);
  const saveToStorage = useFinancialAnalysisStore((s) => s.saveToStorage);

  useEffect(() => {
    setLoading(true);
    getFaSyncPreview(analysisId)
      .then((p) => {
        setPreview(p);
        if (p) {
          setSelectedIndices(new Set(p.persons.map((_, i) => i)));
          setCreateHousehold(p.createHousehold);
          setHouseholdName(p.householdName);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Chyba načtení preview."))
      .finally(() => setLoading(false));
  }, [analysisId]);

  const togglePerson = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const handleSync = async () => {
    if (!preview) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await syncFaToContacts({
        analysisId,
        selectedPersonIndices: Array.from(selectedIndices),
        createHousehold,
        householdName,
      });
      const primary = result.contactIds.find((c) => c.faRole === "primary");
      if (primary) {
        setData({ clientId: primary.contactId });
        if (result.householdId) setData({ householdId: result.householdId });
        saveToStorage();
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Synchronizace selhala.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[color:var(--wp-surface-card-border)]">
          <h3 className="text-lg font-black text-[color:var(--wp-text)] flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Synchronizovat klienty z FA
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X className="w-5 h-5 text-[color:var(--wp-text-secondary)]" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="ml-2 text-sm text-[color:var(--wp-text-secondary)]">Načítám preview...</span>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

          {preview && !loading && (
            <>
              <div className="space-y-2">
                {preview.persons.map((p, idx) => (
                  <label key={idx} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors min-h-[44px] ${
                    selectedIndices.has(idx) ? "border-indigo-300 bg-indigo-50/50" : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50"
                  }`}>
                    <input
                      type="checkbox"
                      checked={selectedIndices.has(idx)}
                      onChange={() => togglePerson(idx)}
                      className="mt-0.5 w-5 h-5 rounded border-[color:var(--wp-border-strong)] text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[color:var(--wp-text)] text-sm">{p.firstName} {p.lastName}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]">{ROLE_LABELS[p.faRole] ?? p.faRole}</span>
                      </div>
                      {p.email && <p className="text-xs text-[color:var(--wp-text-secondary)]">{p.email}</p>}
                      {p.matchedContactId && (
                        <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3" />
                          Nalezen v Aidvisory (shoda: {p.matchReason}) – bude aktualizován
                        </p>
                      )}
                      {!p.matchedContactId && (
                        <p className="text-xs text-emerald-700 flex items-center gap-1 mt-1">
                          <UserPlus className="w-3 h-3" />
                          Nový kontakt
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {preview.persons.length > 1 && (
                <div className="p-3 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={createHousehold}
                      onChange={(e) => setCreateHousehold(e.target.checked)}
                      className="w-5 h-5 rounded border-[color:var(--wp-border-strong)] text-indigo-600 focus:ring-indigo-500"
                    />
                    <Home className="w-4 h-4 text-[color:var(--wp-text-secondary)]" />
                    <span className="text-sm font-semibold text-[color:var(--wp-text)]">Vytvořit domácnost</span>
                  </label>
                  {createHousehold && (
                    <input
                      value={householdName}
                      onChange={(e) => setHouseholdName(e.target.value)}
                      placeholder="Název domácnosti"
                      className="w-full px-3 py-2 rounded-lg border border-[color:var(--wp-surface-card-border)] text-sm min-h-[44px]"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {preview && !loading && (
          <div className="flex justify-end gap-3 p-5 border-t border-[color:var(--wp-surface-card-border)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm font-bold border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-card)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || selectedIndices.size === 0}
              className={clsx(portalPrimaryButtonClassName, "min-h-[44px] px-5 py-2.5 disabled:opacity-50")}
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {syncing ? "Synchronizuji…" : `Vytvořit ${selectedIndices.size} kontakt${selectedIndices.size === 1 ? "" : selectedIndices.size < 5 ? "y" : "ů"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
