"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Award } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import {
  getMyCareerPosition,
  setMyCareerPosition,
  listCareerPositionOptions,
  type CareerPositionOption,
} from "@/app/actions/bj-career-position";

/**
 * Výběr kariérní pozice v profilu poradce.
 *
 * Pozice určuje hodnotu 1 BJ v Kč (např. T1 = 62,50 Kč, D3 = 200 Kč) a použije
 * se v produkčním reportu pro převod součtu BJ na Kč. Změna je okamžitá
 * (server-side persist), protože je to jediný řídicí prvek na kartě.
 */
export function CareerPositionBlock(): React.ReactElement {
  const [options, setOptions] = useState<CareerPositionOption[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [selectedOption, setSelectedOption] = useState<CareerPositionOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [opts, current] = await Promise.all([
          listCareerPositionOptions(),
          getMyCareerPosition(),
        ]);
        if (!active) return;
        setOptions(opts);
        setSelected(current.positionKey ?? "");
        setSelectedOption(current.option);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst pozice.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const dropdownOptions = useMemo(
    () => [
      { id: "", label: "— nezadáno —" },
      ...(options ?? []).map((o) => ({
        id: o.positionKey,
        label: `${o.positionKey} · ${o.positionLabel} (${formatCzk(o.bjValueCzk)} / BJ)`,
      })),
    ],
    [options],
  );

  async function handleChange(next: string): Promise<void> {
    setError(null);
    setSaved(false);
    setSaving(true);
    const prev = selected;
    setSelected(next);
    try {
      const result = await setMyCareerPosition(next || null);
      setSelected(result.positionKey ?? "");
      setSelectedOption(result.option);
      setSaved(true);
    } catch (e) {
      setSelected(prev);
      setError(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-2xl sm:rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      <div className="px-6 sm:px-8 py-5 border-b border-[color:var(--wp-surface-card-border)]/50 flex items-center gap-2">
        <Award size={18} className="text-[color:var(--wp-text-tertiary)] shrink-0" aria-hidden />
        <h2 className="text-lg font-black text-[color:var(--wp-text)]">Kariérní pozice</h2>
      </div>
      <div className="p-6 sm:p-8 space-y-4">
        <p className="text-sm text-[color:var(--wp-text-secondary)]">
          Pozice určuje hodnotu 1 bankovní jednotky (BJ) v Kč. Součet BJ za období
          se v produkčním reportu přepočítá podle této sazby.
        </p>
        <div>
          <label className="block text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 ml-1">
            Úroveň
          </label>
          <div className={loading || saving ? "pointer-events-none opacity-60" : ""}>
            <CustomDropdown
              value={selected}
              onChange={(v) => void handleChange(v)}
              options={dropdownOptions}
              placeholder={loading ? "Načítám…" : "— nezadáno —"}
              icon={Award}
            />
          </div>
        </div>
        {selectedOption && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <StatCard label="1 BJ = " value={formatCzk(selectedOption.bjValueCzk)} />
            <StatCard
              label="Threshold"
              value={selectedOption.bjThreshold == null ? "—" : `${selectedOption.bjThreshold} BJ`}
            />
          </div>
        )}
        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200" role="alert">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200" role="status">
            Uloženo
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="px-4 py-3 rounded-xl bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)]">
      <span className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
        {label}
      </span>
      <span className="text-sm font-black text-[color:var(--wp-text)]">{value}</span>
    </div>
  );
}

function formatCzk(n: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 2,
  }).format(n);
}
