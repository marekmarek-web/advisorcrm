"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import {
  Users,
  Calendar,
  Banknote,
  ChevronRight,
  ArrowRight,
  ArrowRightLeft,
  Pencil,
  Trash2,
  Trophy,
  Ban,
} from "lucide-react";
import { getPipelineColumnTheme } from "@/lib/pipeline/column-themes";
import type { StageWithOpportunities, OpportunityCard } from "@/app/actions/pipeline";
import {
  updateOpportunity,
  deleteOpportunity,
  closeOpportunity,
} from "@/app/actions/pipeline";
import {
  BottomSheet,
  EmptyState,
  MobileCard,
  MobileSection,
  StatusBadge,
  Toast,
  useToast,
} from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatValue(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M Kč`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} tis. Kč`;
  return `${n.toLocaleString("cs-CZ")} Kč`;
}

function formatCloseDate(d: string | null): string {
  if (!d) return "—";
  const today = new Date().toISOString().slice(0, 10);
  if (d < today) return "Prošlé";
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff === 0) return "Dnes";
  if (diff === 1) return "Zítra";
  if (diff <= 7) return `${diff} dní`;
  return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "short" });
}

type OppSelected = OpportunityCard & { stageName: string; stageId: string };

function QuickMoveSheet({
  opp,
  stages,
  onClose,
  onMove,
}: {
  opp: OppSelected;
  stages: StageWithOpportunities[];
  onClose: () => void;
  onMove: (toStageId: string) => void;
}) {
  return (
    <BottomSheet open title="Přesunout případ" onClose={onClose}>
      <p className="text-sm font-bold text-slate-800 mb-3 truncate">{opp.title}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Vyberte fázi</p>
      <div className="space-y-1.5 max-h-[min(60vh,420px)] overflow-y-auto">
        {stages.map((stage, stageIdx) => {
          const theme = getPipelineColumnTheme(stageIdx);
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onMove(stage.id)}
              className={cx(
                "w-full min-h-[48px] rounded-xl border text-left px-4 text-sm font-semibold flex items-center justify-between transition-colors active:scale-[0.99]",
                stage.id === opp.stageId
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50",
                "border-l-4",
                theme.mobileBorderL
              )}
            >
              {stage.name}
              {stage.id === opp.stageId ? (
                <span className="text-[10px] font-black text-indigo-500 uppercase">Aktuální</span>
              ) : (
                <ArrowRight size={14} className="text-slate-300" />
              )}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

function OpportunityDetailSheet({
  opp,
  stages,
  contactOptions,
  onClose,
  onMove,
  onOpenContact,
  onAfterMutation,
}: {
  opp: OppSelected;
  stages: StageWithOpportunities[];
  contactOptions: Array<{ id: string; label: string }>;
  onClose: () => void;
  onMove: (toStageId: string) => void;
  onOpenContact: (contactId: string) => void;
  onAfterMutation: () => void;
}) {
  const { toast, showToast, dismissToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(opp.title);
  const [caseType, setCaseType] = useState(opp.caseType || "");
  const [expectedValue, setExpectedValue] = useState(opp.expectedValue || "");
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    opp.expectedCloseDate ? opp.expectedCloseDate.slice(0, 10) : ""
  );
  const [contactId, setContactId] = useState(opp.contactId || "");

  useEffect(() => {
    setTitle(opp.title);
    setCaseType(opp.caseType || "");
    setExpectedValue(opp.expectedValue || "");
    setExpectedCloseDate(opp.expectedCloseDate ? opp.expectedCloseDate.slice(0, 10) : "");
    setContactId(opp.contactId || "");
    setEditing(false);
  }, [opp.id, opp.title, opp.caseType, opp.expectedValue, opp.expectedCloseDate, opp.contactId]);

  function runMutation(fn: () => Promise<void>, okMsg: string) {
    startTransition(async () => {
      try {
        await fn();
        showToast(okMsg, "success");
        onAfterMutation();
        onClose();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Akce selhala.", "error");
      }
    });
  }

  return (
    <>
      {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} /> : null}
      <BottomSheet open title={opp.title} onClose={onClose}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">{opp.stageName}</StatusBadge>
            <StatusBadge tone="neutral">{opp.caseType || "Jiné"}</StatusBadge>
            {opp.expectedValue ? (
              <StatusBadge tone="success">{formatValue(opp.expectedValue)}</StatusBadge>
            ) : null}
          </div>

          {opp.contactName ? (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Users size={16} className="text-slate-400" />
              {opp.contactName}
            </div>
          ) : null}

          {opp.expectedCloseDate ? (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Calendar size={16} className="text-slate-400" />
              Uzavření: {new Date(opp.expectedCloseDate).toLocaleDateString("cs-CZ")}
              <span className="text-xs font-bold text-slate-500">
                ({formatCloseDate(opp.expectedCloseDate)})
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <Pencil size={14} /> {editing ? "Zrušit úpravy" : "Upravit"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("Smazat tento případ?")) return;
                runMutation(() => deleteOpportunity(opp.id), "Případ byl smazán.");
              }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-rose-200 text-sm font-bold text-rose-600 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <Trash2 size={14} /> Smazat
            </button>
          </div>

          {editing ? (
            <div className="space-y-3 rounded-xl border border-slate-200 p-3 bg-slate-50">
              <label className="block">
                <span className="text-[10px] font-black uppercase text-slate-500">Název</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase text-slate-500">Typ / produkt</span>
                <input
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase text-slate-500">Očekávaná hodnota (Kč)</span>
                <input
                  value={expectedValue}
                  onChange={(e) => setExpectedValue(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase text-slate-500">Datum uzavření</span>
                <input
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase text-slate-500">Klient</span>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm bg-white"
                >
                  <option value="">— bez klienta —</option>
                  {contactOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={pending || !title.trim()}
                onClick={() =>
                  runMutation(
                    () =>
                      updateOpportunity(opp.id, {
                        title: title.trim(),
                        caseType: caseType.trim() || undefined,
                        expectedValue: expectedValue.trim() || null,
                        expectedCloseDate: expectedCloseDate || null,
                        contactId: contactId || null,
                      }),
                    "Změny uloženy."
                  )
                }
                className="w-full min-h-[48px] rounded-xl bg-indigo-600 text-white text-sm font-black active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                {pending ? "Ukládám…" : "Uložit změny"}
              </button>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Uzavřít případ</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Označit jako vyhraný?")) return;
                  runMutation(() => closeOpportunity(opp.id, true), "Případ uzavřen jako vyhraný.");
                }}
                className="min-h-[44px] rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98] disabled:opacity-50"
              >
                <Trophy size={14} /> Vyhraný
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Označit jako prohraný?")) return;
                  runMutation(() => closeOpportunity(opp.id, false), "Případ uzavřen jako prohraný.");
                }}
                className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98] disabled:opacity-50"
              >
                <Ban size={14} /> Prohraný
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Posunout do fáze</p>
            <div className="space-y-1.5">
              {stages.map((stage, stageIdx) => {
                const theme = getPipelineColumnTheme(stageIdx);
                return (
                  <button
                    key={stage.id}
                    type="button"
                    disabled={pending}
                    onClick={() => onMove(stage.id)}
                    className={cx(
                      "w-full min-h-[44px] rounded-xl border text-left px-4 text-sm font-semibold flex items-center justify-between transition-colors active:scale-[0.99]",
                      stage.name === opp.stageName
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50",
                      "border-l-4",
                      theme.mobileBorderL
                    )}
                  >
                    {stage.name}
                    {stage.name === opp.stageName ? (
                      <span className="text-[10px] font-black text-indigo-500 uppercase">Aktuální</span>
                    ) : (
                      <ArrowRight size={14} className="text-slate-300" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {opp.contactId ? (
            <button
              type="button"
              onClick={() => onOpenContact(opp.contactId!)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 text-slate-700 text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Users size={14} /> Otevřít klienta <ChevronRight size={14} />
            </button>
          ) : null}
        </div>
      </BottomSheet>
    </>
  );
}

export interface PipelineScreenProps {
  pipeline: StageWithOpportunities[];
  deviceClass: DeviceClass;
  /** Shell transition (e.g. refresh) — suppress empty-state flash while data may be stale. */
  refreshing?: boolean;
  onMoveOpportunity: (oppId: string, toStageId: string) => void;
  contactOptions: Array<{ id: string; label: string }>;
  onOpenContact: (contactId: string) => void;
  onPipelineRefresh: () => void;
}

export function PipelineScreen({
  pipeline,
  deviceClass,
  refreshing = false,
  onMoveOpportunity,
  contactOptions,
  onOpenContact,
  onPipelineRefresh,
}: PipelineScreenProps) {
  const [selectedOpp, setSelectedOpp] = useState<OppSelected | null>(null);
  const [quickMoveOpp, setQuickMoveOpp] = useState<OppSelected | null>(null);

  const totalDeals = useMemo(() => pipeline.reduce((s, st) => s + st.opportunities.length, 0), [pipeline]);
  const totalValue = useMemo(
    () =>
      pipeline
        .flatMap((st) => st.opportunities)
        .reduce((s, o) => s + (o.expectedValue ? Number(o.expectedValue) : 0), 0),
    [pipeline]
  );

  const isTablet = deviceClass === "tablet";

  return (
    <div className="space-y-4">
      {!refreshing && pipeline.length === 0 ? (
        <EmptyState title="Pipeline je prázdná" description="Začněte přidáním prvního případu." />
      ) : null}
      {pipeline.length === 0 && !refreshing ? null : (
        <>
      <div className="flex gap-3">
        <MobileCard className="flex-1 p-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Celkem</p>
          <p className="text-xl font-black text-slate-900 mt-0.5">{totalDeals}</p>
          <p className="text-xs text-slate-500">případů</p>
        </MobileCard>
        <MobileCard className="flex-1 p-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hodnota</p>
          <p className="text-lg font-black text-slate-900 mt-0.5">{formatValue(String(totalValue))}</p>
          <p className="text-xs text-slate-500">celkem</p>
        </MobileCard>
      </div>

      <div className={cx("grid gap-3", isTablet ? "grid-cols-2" : "grid-cols-1")}>
        {pipeline.map((stage, stageIdx) => {
          const theme = getPipelineColumnTheme(stageIdx);
          const stageValue = stage.opportunities.reduce(
            (s, o) => s + (o.expectedValue ? Number(o.expectedValue) : 0),
            0
          );
          const urgentCount = stage.opportunities.filter(
            (o) => o.expectedCloseDate && o.expectedCloseDate < new Date().toISOString().slice(0, 10)
          ).length;

          return (
            <MobileSection key={stage.id} title={stage.name}>
              <MobileCard className="p-0 overflow-hidden border border-slate-200/80 shadow-sm">
                <div className={cx("h-1.5 w-full shrink-0", theme.mobileHeaderBar)} aria-hidden />
                <div
                  className={cx(
                    "p-3 flex items-center gap-3 border-b",
                    theme.color,
                    theme.borderColor
                  )}
                >
                  <div
                    className={cx(
                      "w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0 text-xs font-black",
                      theme.solidBg
                    )}
                  >
                    {stageIdx + 1}
                  </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-black text-slate-900">{stage.opportunities.length}</p>
                  <p className="text-xs text-slate-500 font-bold">
                    {stageValue > 0 ? formatValue(String(stageValue)) : "bez hodnoty"}
                  </p>
                </div>
                {urgentCount > 0 ? (
                  <span className="text-[10px] font-black text-rose-600 bg-white/80 px-2 py-1 rounded-lg border border-rose-100">
                    {urgentCount} prošlé
                  </span>
                ) : null}
                </div>
              </MobileCard>

              {stage.opportunities.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">Prázdná fáze</p>
              ) : (
                stage.opportunities.map((opp) => {
                  const isPastDue =
                    opp.expectedCloseDate &&
                    opp.expectedCloseDate < new Date().toISOString().slice(0, 10);
                  const rowSelected = { ...opp, stageName: stage.name, stageId: stage.id };
                  return (
                    <div
                      key={opp.id}
                      className={cx(
                        "flex rounded-2xl border bg-white shadow-sm overflow-hidden transition-all border-l-4",
                        theme.mobileBorderL,
                        isPastDue ? "border-t-rose-200 border-r-rose-200 border-b-rose-200 bg-rose-50/30" : "border-t-slate-200 border-r-slate-200 border-b-slate-200"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedOpp(rowSelected)}
                        className="flex-1 min-w-0 text-left p-3.5 active:bg-slate-50/80 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-bold text-slate-900 leading-snug flex-1">{opp.title}</p>
                          <ChevronRight size={14} className="text-slate-300 flex-shrink-0 mt-0.5" />
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                          {opp.contactName ? (
                            <span className="flex items-center gap-1 text-[11px] text-slate-500 font-bold">
                              <Users size={11} /> {opp.contactName}
                            </span>
                          ) : null}
                          {opp.expectedValue ? (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                              <Banknote size={11} /> {formatValue(opp.expectedValue)}
                            </span>
                          ) : null}
                          {opp.expectedCloseDate ? (
                            <span
                              className={cx(
                                "flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded",
                                isPastDue ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"
                              )}
                            >
                              <Calendar size={11} /> {formatCloseDate(opp.expectedCloseDate)}
                            </span>
                          ) : null}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickMoveOpp(rowSelected)}
                        className="shrink-0 w-[52px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 border-l border-slate-100 bg-slate-50/90 text-slate-600 active:bg-indigo-50 active:text-indigo-700"
                        aria-label="Přesunout do jiné fáze"
                      >
                        <ArrowRightLeft size={18} />
                        <span className="text-[9px] font-black uppercase tracking-tighter leading-none text-center px-0.5">
                          Fáze
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
            </MobileSection>
          );
        })}
      </div>

      {quickMoveOpp ? (
        <QuickMoveSheet
          opp={quickMoveOpp}
          stages={pipeline}
          onClose={() => setQuickMoveOpp(null)}
          onMove={(toStageId) => {
            onMoveOpportunity(quickMoveOpp.id, toStageId);
            setQuickMoveOpp(null);
            onPipelineRefresh();
          }}
        />
      ) : null}

      {selectedOpp ? (
        <OpportunityDetailSheet
          opp={selectedOpp}
          stages={pipeline}
          contactOptions={contactOptions}
          onClose={() => setSelectedOpp(null)}
          onMove={(toStageId) => {
            onMoveOpportunity(selectedOpp.id, toStageId);
            setSelectedOpp(null);
            onPipelineRefresh();
          }}
          onOpenContact={onOpenContact}
          onAfterMutation={onPipelineRefresh}
        />
      ) : null}
        </>
      )}
    </div>
  );
}
