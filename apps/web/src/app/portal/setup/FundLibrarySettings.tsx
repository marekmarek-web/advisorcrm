"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Layers, Search, ChevronUp, ChevronDown, PlusCircle, Loader2 } from "lucide-react";
import type {
  FundAddRequestQueueRow,
  FundAddRequestQueueStatus,
  FundLibrarySetupSnapshot,
} from "@/lib/fund-library/fund-library-setup-types";
import {
  saveTenantFundAllowlist,
  saveAdvisorFundLibrary,
  submitFundAddRequest,
  updateFundAddRequestStatus,
} from "@/app/actions/fund-library-settings";
import { BASE_FUNDS } from "@/lib/analyses/financial/fund-library/base-funds";
import type { BaseFundKey } from "@/lib/analyses/financial/fund-library/legacy-fund-key-map";
import {
  FUND_UI_GROUP_LABELS,
  getFundUiGroup,
  type FundUiGroupId,
} from "@/lib/analyses/financial/fund-library/fund-ui-groups";
import { useToast } from "@/app/components/Toast";
import { BaseModal } from "@/app/components/BaseModal";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

const GROUP_CHIPS: { id: FundUiGroupId | "all"; label: string }[] = [
  { id: "all", label: "Vše" },
  { id: "etf", label: FUND_UI_GROUP_LABELS.etf },
  { id: "bonds", label: FUND_UI_GROUP_LABELS.bonds },
  { id: "cash_conservative", label: FUND_UI_GROUP_LABELS.cash_conservative },
  { id: "real_estate", label: FUND_UI_GROUP_LABELS.real_estate },
  { id: "pension", label: FUND_UI_GROUP_LABELS.pension },
  { id: "qualified_investor", label: FUND_UI_GROUP_LABELS.qualified_investor },
];

const QUEUE_STATUS_OPTIONS: { value: FundAddRequestQueueStatus; label: string }[] = [
  { value: "new", label: "Nový" },
  { value: "in_progress", label: "Řeší se" },
  { value: "added", label: "Přidáno" },
  { value: "rejected", label: "Zamítnuto" },
];

const labelClass = "block text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 ml-1";
const inputClass =
  "w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-[color:var(--wp-text)] min-h-[44px]";

type Props = { snapshot: FundLibrarySetupSnapshot };

export function FundLibrarySettings({ snapshot }: Props) {
  const router = useRouter();
  const toast = useToast();
  const catalogByKey = useMemo(
    () => new Map(snapshot.catalog.map((c) => [c.baseFundKey, c])),
    [snapshot.catalog],
  );
  const fullFundByKey = useMemo(
    () => new Map<BaseFundKey, (typeof BASE_FUNDS)[number]>(BASE_FUNDS.map((f) => [f.baseFundKey, f])),
    [],
  );

  const catalogKeys = useMemo(() => snapshot.catalog.map((c) => c.baseFundKey), [snapshot.catalog]);

  const [tenantAllowed, setTenantAllowed] = useState<Record<string, boolean>>(() => {
    if (snapshot.tenantAllowlist.allowedBaseFundKeys === null) {
      return Object.fromEntries(catalogKeys.map((k) => [k, true]));
    }
    const set = new Set(snapshot.tenantAllowlist.allowedBaseFundKeys);
    return Object.fromEntries(catalogKeys.map((k) => [k, set.has(k)]));
  });

  const [order, setOrder] = useState<string[]>(() => {
    const allow = new Set(snapshot.effectiveAllowedKeys);
    const o = snapshot.advisorPrefs.order.filter((k) => allow.has(k));
    const rest = snapshot.effectiveAllowedKeys.filter((k) => !o.includes(k));
    return [...o, ...rest];
  });
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const k of snapshot.effectiveAllowedKeys) {
      next[k] = snapshot.advisorPrefs.enabled[k] !== false;
    }
    return next;
  });

  const [groupFilter, setGroupFilter] = useState<FundUiGroupId | "all">("all");
  const [search, setSearch] = useState("");

  const [savingTenant, setSavingTenant] = useState(false);
  const [savingAdvisor, setSavingAdvisor] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  /** Klíče fondů, u kterých `/logos/...` selhalo načtením (síť, chybějící soubor). */
  const [brokenLogoKeys, setBrokenLogoKeys] = useState<Set<string>>(() => new Set());
  const [reqForm, setReqForm] = useState({
    fundName: "",
    provider: "",
    isinOrTicker: "",
    factsheetUrl: "",
    category: "",
    note: "",
  });

  const mergedFundRows = useMemo(() => {
    return order
      .map((key) => {
        const meta = catalogByKey.get(key);
        const full = fullFundByKey.get(key as BaseFundKey);
        if (!meta || !full) return null;
        return { key, meta, group: getFundUiGroup(full) };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [order, catalogByKey, fullFundByKey]);

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mergedFundRows.filter((row) => {
      if (groupFilter !== "all" && row.group !== groupFilter) return false;
      if (!q) return true;
      const hay = `${row.meta.displayName} ${row.meta.provider} ${row.meta.category} ${row.meta.subcategory ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [mergedFundRows, groupFilter, search]);

  const moveKey = (key: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(key);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const allTenantOn = catalogKeys.every((k) => tenantAllowed[k]);

  const handleSaveTenant = async () => {
    if (!snapshot.canEditTenantAllowlist) return;
    setSavingTenant(true);
    try {
      if (allTenantOn) {
        await saveTenantFundAllowlist(null);
      } else {
        const keys = catalogKeys.filter((k) => tenantAllowed[k]);
        await saveTenantFundAllowlist(keys.length === 0 ? [] : keys);
      }
      toast.showToast("Nastavení workspace uloženo.");
      router.refresh();
    } catch (e) {
      toast.showToast((e as Error).message ?? "Uložení se nezdařilo.");
    } finally {
      setSavingTenant(false);
    }
  };

  const handleSaveAdvisor = async () => {
    setSavingAdvisor(true);
    try {
      await saveAdvisorFundLibrary({ order, enabled });
      toast.showToast("Vaše fondy uloženy.");
      router.refresh();
    } catch (e) {
      toast.showToast((e as Error).message ?? "Uložení se nezdařilo.");
    } finally {
      setSavingAdvisor(false);
    }
  };

  const handleQueueStatusChange = async (id: string, status: FundAddRequestQueueStatus) => {
    setStatusSavingId(id);
    try {
      const res = await updateFundAddRequestStatus(id, status);
      if (!res.ok) {
        toast.showToast(res.error);
        return;
      }
      router.refresh();
    } catch (err) {
      toast.showToast((err as Error).message ?? "Uložení stavu selhalo.");
    } finally {
      setStatusSavingId(null);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestSubmitting(true);
    try {
      const res = await submitFundAddRequest(reqForm);
      if (!res.ok) {
        toast.showToast(res.error);
        return;
      }
      toast.showToast("Požadavek byl odeslán ke zpracování.");
      setRequestOpen(false);
      setReqForm({ fundName: "", provider: "", isinOrTicker: "", factsheetUrl: "", category: "", note: "" });
      router.refresh();
    } catch (err) {
      toast.showToast((err as Error).message ?? "Odeslání se nezdařilo.");
    } finally {
      setRequestSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[color:var(--wp-text)] mb-1 flex items-center gap-2">
            <Layers className="text-indigo-500 shrink-0" size={22} />
            Knihovna fondů
          </h2>
          <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
            Nastavení pro Finanční analýzu — výběr fondů pro celý workspace a vaše osobní pořadí.
          </p>
        </div>
        <CreateActionButton type="button" icon={PlusCircle} onClick={() => setRequestOpen(true)} className="shrink-0">
          Chci přidat fond
        </CreateActionButton>
      </div>

      {!snapshot.canEditTenantAllowlist && (
        <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 px-4 py-3 text-xs font-medium text-[color:var(--wp-text-secondary)]">
          Katalog fondů pro celý workspace upravuje <strong>Admin</strong> nebo <strong>Director</strong>. Vy můžete nastavit jen svůj výběr a pořadí z povolených fondů.
        </div>
      )}

      {snapshot.canEditTenantAllowlist && (
        <div className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
          <div className="px-6 sm:px-8 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
            <h3 className="text-base font-black text-[color:var(--wp-text)]">Katalog fondů workspace</h3>
            <p className="text-xs font-medium text-[color:var(--wp-text-secondary)] mt-1">
              Vyberte, které fondy z katalogu mohou poradci z vašeho workspace používat. Ve výchozím stavu jsou povolené všechny.
            </p>
          </div>
          <div className="p-6 space-y-3 max-h-[280px] overflow-y-auto">
            {snapshot.catalog.map((c) => (
              <label
                key={c.baseFundKey}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[color:var(--wp-surface-card-border)] cursor-pointer hover:bg-[color:var(--wp-surface-muted)]"
              >
                <span className="text-sm font-bold text-[color:var(--wp-text)]">{c.displayName}</span>
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-indigo-600 shrink-0"
                  checked={!!tenantAllowed[c.baseFundKey]}
                  onChange={() =>
                    setTenantAllowed((prev) => ({ ...prev, [c.baseFundKey]: !prev[c.baseFundKey] }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-[color:var(--wp-surface-card-border)]/50 flex justify-end">
            <button
              type="button"
              disabled={savingTenant}
              onClick={handleSaveTenant}
              className="px-5 py-2.5 rounded-xl bg-aidv-create text-white font-bold text-sm min-h-[44px] inline-flex items-center gap-2 disabled:opacity-50"
            >
              {savingTenant ? <Loader2 className="animate-spin" size={18} /> : null}
              Uložit nastavení workspace
            </button>
          </div>
        </div>
      )}

      {snapshot.fundAddRequestQueue != null && (
        <div className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
          <div className="px-6 sm:px-8 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
            <h3 className="text-base font-black text-[color:var(--wp-text)]">Požadavky na nové fondy</h3>
            <p className="text-xs font-medium text-[color:var(--wp-text-secondary)] mt-1">
              Interní fronta od poradců. Záznam se do katalogu nepřidává automaticky — jen evidujte stav.
            </p>
          </div>
          <div className="p-4 sm:p-6">
            {snapshot.fundAddRequestQueue.length === 0 ? (
              <p className="text-sm text-[color:var(--wp-text-secondary)]">Zatím žádné požadavky.</p>
            ) : (
              <ul className="space-y-3 max-h-[min(420px,50vh)] overflow-y-auto">
                {snapshot.fundAddRequestQueue.map((req) => (
                  <li
                    key={req.id}
                    className="rounded-xl border border-[color:var(--wp-surface-card-border)] p-4 space-y-2 bg-[color:var(--wp-surface-muted)]/30"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="font-bold text-sm text-[color:var(--wp-text)]">{req.fundName}</div>
                        <div className="text-xs text-[color:var(--wp-text-secondary)]">
                          {req.provider ? `${req.provider} · ` : ""}
                          {new Date(req.createdAt).toLocaleString("cs-CZ")}
                          {" · "}
                          <span className="font-mono text-[11px]" title={req.userId}>
                            {req.userId.length > 18 ? `${req.userId.slice(0, 16)}…` : req.userId}
                          </span>
                        </div>
                        {(req.isinOrTicker || req.category) && (
                          <div className="text-[11px] text-[color:var(--wp-text-tertiary)]">
                            {req.isinOrTicker ? <span>ISIN/ticker: {req.isinOrTicker}</span> : null}
                            {req.isinOrTicker && req.category ? " · " : null}
                            {req.category ? <span>{req.category}</span> : null}
                          </div>
                        )}
                        {req.factsheetUrl ? (
                          <a
                            href={req.factsheetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-indigo-600 hover:underline inline-block truncate max-w-full"
                          >
                            Factsheet
                          </a>
                        ) : null}
                        {req.note ? (
                          <p className="text-xs text-[color:var(--wp-text-secondary)] whitespace-pre-wrap border-t border-[color:var(--wp-surface-card-border)]/50 pt-2 mt-2">
                            {req.note}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          className={`${inputClass} py-2 min-h-[40px] text-xs sm:max-w-[140px]`}
                          value={req.status}
                          disabled={statusSavingId === req.id}
                          onChange={(e) =>
                            handleQueueStatusChange(req.id, e.target.value as FundAddRequestQueueStatus)
                          }
                          aria-label={`Stav: ${req.fundName}`}
                        >
                          {QUEUE_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {statusSavingId === req.id ? <Loader2 className="animate-spin w-4 h-4 shrink-0" /> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-[color:var(--wp-surface-card-border)]/50 space-y-4">
          <div>
            <h3 className="text-base font-black text-[color:var(--wp-text)]">Moje fondy</h3>
            <p className="text-xs font-medium text-[color:var(--wp-text-secondary)] mt-1">
              Zapněte fondy, které chcete používat, a seřaďte je. Platí jen fondy povolené firmou.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {GROUP_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setGroupFilter(chip.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-h-[36px] ${
                  groupFilter === chip.id
                    ? "bg-indigo-100 text-indigo-800"
                    : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card-border)]/40"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--wp-text-tertiary)]" />
            <input
              type="search"
              placeholder="Hledat podle názvu, správce, kategorie…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-sm font-medium text-[color:var(--wp-text)]"
            />
          </div>
        </div>

        <ul className="divide-y divide-[color:var(--wp-surface-card-border)]/60">
          {snapshot.effectiveAllowedKeys.length === 0 ? (
            <li className="p-8 text-center text-sm text-[color:var(--wp-text-secondary)]">
              Pro váš workspace nejsou povoleny žádné fondy. Kontaktujte správce workspace.
            </li>
          ) : displayRows.length === 0 ? (
            <li className="p-8 text-center text-sm text-[color:var(--wp-text-secondary)]">Žádné fondy v tomto filtru.</li>
          ) : (
            displayRows.map(({ key, meta }) => {
              const logo = meta.logoPath?.trim();
              return (
                <li key={key} className="flex items-center gap-3 p-4 hover:bg-[color:var(--wp-surface-muted)]/50">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      aria-label="Posunout nahoru"
                      className="p-1 rounded text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] disabled:opacity-30"
                      disabled={order.indexOf(key) <= 0}
                      onClick={() => moveKey(key, -1)}
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label="Posunout dolů"
                      className="p-1 rounded text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] disabled:opacity-30"
                      disabled={order.indexOf(key) >= order.length - 1}
                      onClick={() => moveKey(key, 1)}
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] flex items-center justify-center overflow-hidden shrink-0">
                    {logo && !brokenLogoKeys.has(key) ? (
                      <Image
                        src={logo}
                        alt=""
                        width={40}
                        height={40}
                        className="object-contain w-10 h-10"
                        onError={() =>
                          setBrokenLogoKeys((prev) => {
                            const n = new Set(prev);
                            n.add(key);
                            return n;
                          })
                        }
                      />
                    ) : (
                      <span className="text-[10px] font-black text-[color:var(--wp-text-tertiary)]">
                        {meta.displayName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-[color:var(--wp-text)] truncate">{meta.displayName}</div>
                    <div className="text-xs text-[color:var(--wp-text-secondary)] truncate">{meta.provider}</div>
                    <div className="text-[11px] text-[color:var(--wp-text-tertiary)] truncate">
                      {meta.category}
                      {meta.subcategory ? ` · ${meta.subcategory}` : ""}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={enabled[key] !== false}
                      onChange={() =>
                        setEnabled((prev) => {
                          const on = prev[key] !== false;
                          return { ...prev, [key]: !on };
                        })
                      }
                    />
                    <div className="w-11 h-6 bg-[color:var(--wp-surface-card-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[color:var(--wp-surface-card)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-aidv-create" />
                  </label>
                </li>
              );
            })
          )}
        </ul>

        <div className="px-6 py-4 border-t border-[color:var(--wp-surface-card-border)]/50 flex justify-end">
          <button
            type="button"
            disabled={savingAdvisor}
            onClick={handleSaveAdvisor}
            className="px-5 py-2.5 rounded-xl bg-[color:var(--wp-text)] text-[color:var(--wp-surface-card)] font-bold text-sm min-h-[44px] inline-flex items-center gap-2 disabled:opacity-50"
          >
            {savingAdvisor ? <Loader2 className="animate-spin" size={18} /> : null}
            Uložit moje fondy
          </button>
        </div>
      </div>

      <BaseModal open={requestOpen} onClose={() => !requestSubmitting && setRequestOpen(false)} title="Chci přidat fond" maxWidth="md" mobileVariant="sheet">
        <form onSubmit={handleRequestSubmit} className="space-y-4 p-1">
          <p className="text-xs text-[color:var(--wp-text-secondary)]">
            Odešlete interní požadavek. Fond se do katalogu nepřidá automaticky.
          </p>
          <div>
            <label className={labelClass}>Název fondu</label>
            <input
              className={inputClass}
              required
              value={reqForm.fundName}
              onChange={(e) => setReqForm((f) => ({ ...f, fundName: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>Správce / poskytovatel</label>
            <input
              className={inputClass}
              value={reqForm.provider}
              onChange={(e) => setReqForm((f) => ({ ...f, provider: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>ISIN nebo ticker</label>
            <input
              className={inputClass}
              value={reqForm.isinOrTicker}
              onChange={(e) => setReqForm((f) => ({ ...f, isinOrTicker: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>Odkaz na factsheet</label>
            <input
              type="url"
              className={inputClass}
              placeholder="https://"
              value={reqForm.factsheetUrl}
              onChange={(e) => setReqForm((f) => ({ ...f, factsheetUrl: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>Kategorie</label>
            <input
              className={inputClass}
              value={reqForm.category}
              onChange={(e) => setReqForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>Poznámka (proč fond používat)</label>
            <textarea
              className={`${inputClass} min-h-[100px] resize-y`}
              rows={3}
              value={reqForm.note}
              onChange={(e) => setReqForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="px-4 py-2.5 rounded-xl border border-[color:var(--wp-surface-card-border)] font-bold text-sm"
              onClick={() => setRequestOpen(false)}
              disabled={requestSubmitting}
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={requestSubmitting}
              className="px-5 py-2.5 rounded-xl bg-aidv-create text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              {requestSubmitting ? <Loader2 className="animate-spin" size={18} /> : null}
              Odeslat požadavek
            </button>
          </div>
        </form>
      </BaseModal>
    </div>
  );
}
