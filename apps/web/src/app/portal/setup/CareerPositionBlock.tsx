"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Award } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import {
  getMyCareerPosition,
  setMyCareerPosition,
  setMyCareerBjBonusCzk,
  listCareerPositionOptions,
  type CareerPositionOption,
} from "@/app/actions/bj-career-position";

/**
 * Výběr kariérní pozice v nastavení účtu (BJ → Kč v produkčním reportu).
 */
export function CareerPositionBlock(): React.ReactElement {
  const [options, setOptions] = useState<CareerPositionOption[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [selectedOption, setSelectedOption] = useState<CareerPositionOption | null>(null);
  const [bonusCzk, setBonusCzk] = useState<number | null>(null);
  const [bonusDraft, setBonusDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function applyPayload(current: Awaited<ReturnType<typeof getMyCareerPosition>>): void {
    setSelected(current.positionKey ?? "");
    setSelectedOption(current.option);
    setBonusCzk(current.careerBjBonusCzk);
    setBonusDraft(formatBonusDraft(current.careerBjBonusCzk));
  }

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
        applyPayload(current);
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
      applyPayload(result);
      setSaved(true);
    } catch (e) {
      setSelected(prev);
      setError(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleBonusBlur(): Promise<void> {
    setError(null);
    const parsed = parseBonusDraft(bonusDraft);
    if (parsed === undefined) {
      setError("Zadejte platné číslo (např. 5 nebo 5,5), nebo pole nechte prázdné.");
      setBonusDraft(formatBonusDraft(bonusCzk));
      return;
    }
    const prevSaved = bonusCzk;
    if (parsed === prevSaved || (parsed == null && prevSaved == null)) return;
    if (parsed != null && prevSaved != null && Math.abs(parsed - prevSaved) < 0.001) return;

    setBonusSaving(true);
    setSaved(false);
    try {
      const result = await setMyCareerBjBonusCzk(parsed);
      applyPayload(result);
      setSaved(true);
    } catch (e) {
      setBonusDraft(formatBonusDraft(bonusCzk));
      setError(e instanceof Error ? e.message : "Uložení výjimky selhalo.");
    } finally {
      setBonusSaving(false);
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
          se v produkčním reportu přepočítá podle účinné sazby (základ z řádu + volitelná
          osobní výjimka).
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
        <div>
          <label className="block text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 ml-1">
            Výjimka (+ Kč / BJ)
          </label>
          <p className="text-xs text-[color:var(--wp-text-tertiary)] mb-2 ml-1">
            Volitelné navýšení nad sazbu pozice (např. 5). Prázdné = bez příplatku.
          </p>
          <input
            type="text"
            inputMode="decimal"
            value={bonusDraft}
            onChange={(e) => setBonusDraft(e.target.value)}
            onBlur={() => void handleBonusBlur()}
            disabled={loading || bonusSaving}
            className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-3 text-sm font-medium text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] disabled:opacity-60"
            placeholder="0"
            aria-label="Výjimka příplatek Kč za jednu bankovní jednotku"
          />
        </div>
        {selectedOption && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <StatCard
              label="1 BJ = "
              value={formatCzk(selectedOption.bjValueCzk + (bonusCzk ?? 0))}
            />
            <StatCard
              label="Práh"
              value={selectedOption.bjThreshold == null ? "—" : `${selectedOption.bjThreshold} BJ`}
            />
          </div>
        )}
        {selectedOption && bonusCzk != null && bonusCzk > 0 && (
          <p className="text-xs text-[color:var(--wp-text-secondary)]">
            Z kariérního řádu {formatCzk(selectedOption.bjValueCzk)} + výjimka{" "}
            {formatCzk(bonusCzk)}.
          </p>
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

function formatBonusDraft(n: number | null): string {
  if (n == null || n === 0) return "";
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2, useGrouping: false }).format(n);
}

/** null = clear stored bonus; undefined = invalid input */
function parseBonusDraft(s: string): number | null | undefined {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100) / 100;
}
