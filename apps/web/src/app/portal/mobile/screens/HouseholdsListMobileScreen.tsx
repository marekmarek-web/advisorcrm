"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Home, ChevronRight, Plus } from "lucide-react";
import { createHousehold, getHouseholdsList, type HouseholdRow } from "@/app/actions/households";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FloatingActionButton,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
} from "@/app/shared/mobile-ui/primitives";

export function HouseholdsListMobileScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<HouseholdRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        setRows(await getHouseholdsList());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst domácnosti.");
      }
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setCreateError("Název je povinný.");
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const id = await createHousehold(name);
      setCreateOpen(false);
      setNewName("");
      if (id) {
        await refresh();
        router.push(`/portal/households/${id}`);
      } else {
        await refresh();
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Nepodařilo se vytvořit domácnost.");
    } finally {
      setCreateBusy(false);
    }
  }

  if (pending && rows.length === 0) return <LoadingSkeleton variant="list" rows={6} />;
  if (error) return <ErrorState title={error} onRetry={refresh} />;

  return (
    <div className="space-y-3">
      <MobileSection title={`Domácnosti (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState
            title="Žádné domácnosti"
            description="Vytvořte první domácnost a přiřaďte k ní klienty."
            action={
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setCreateOpen(true);
                }}
                className="mt-3 min-h-[44px] px-5 rounded-xl bg-indigo-600 text-white text-sm font-bold"
              >
                Vytvořit domácnost
              </button>
            }
          />
        ) : (
          rows.map((h) => (
            <MobileCard key={h.id} className="p-0">
              <button
                type="button"
                onClick={() => router.push(`/portal/households/${h.id}`)}
                className="w-full flex items-center gap-3 min-h-[56px] px-4 py-3 text-left active:bg-slate-50 transition-colors"
              >
                <span className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <Home size={18} className="text-indigo-600" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{h.name}</p>
                  <p className="text-xs text-slate-500 font-semibold">{h.memberCount} členů</p>
                </div>
                <ChevronRight size={18} className="text-slate-300 shrink-0" />
              </button>
            </MobileCard>
          ))
        )}
      </MobileSection>

      <FloatingActionButton
        onClick={() => {
          setCreateError(null);
          setCreateOpen(true);
        }}
        label="Nová domácnost"
        icon={Plus}
      />

      <BottomSheet open={createOpen} onClose={() => !createBusy && setCreateOpen(false)} title="Nová domácnost">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
              Název domácnosti
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
              placeholder="Např. Novákovi"
              disabled={createBusy}
            />
          </div>
          {createError ? <p className="text-sm text-rose-600 font-semibold">{createError}</p> : null}
          <button
            type="button"
            onClick={handleCreate}
            disabled={createBusy || !newName.trim()}
            className="w-full min-h-[48px] rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {createBusy ? "Vytvářím…" : "Vytvořit"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
