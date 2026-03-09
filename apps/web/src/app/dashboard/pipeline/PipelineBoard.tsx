"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  updateOpportunityStage,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
} from "@/app/actions/pipeline";
import type { StageWithOpportunities, OpportunityCard } from "@/app/actions/pipeline";
import { ConfirmDeleteModal } from "@/app/components/ConfirmDeleteModal";
import Link from "next/link";
import {
  Plus,
  CalendarClock,
  Shield,
  Home,
  TrendingUp,
  PiggyBank,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Phone,
  Mail,
  MoreHorizontal,
} from "lucide-react";

type ContactOption = { id: string; firstName: string; lastName: string };

const CASE_TYPES = [
  { value: "hypotéka", label: "Hypotéka" },
  { value: "investice", label: "Investice" },
  { value: "pojištění", label: "Pojištění" },
  { value: "úvěr", label: "Úvěr" },
  { value: "jiné", label: "Jiné" },
];

const COLUMN_THEMES = [
  { color: "bg-emerald-50", textColor: "text-emerald-700", borderColor: "border-emerald-200", accent: "border-b-emerald-400" },
  { color: "bg-blue-50", textColor: "text-blue-700", borderColor: "border-blue-200", accent: "border-b-blue-400" },
  { color: "bg-indigo-50", textColor: "text-indigo-700", borderColor: "border-indigo-200", accent: "border-b-indigo-400" },
  { color: "bg-amber-50", textColor: "text-amber-700", borderColor: "border-amber-200", accent: "border-b-amber-400" },
  { color: "bg-rose-50", textColor: "text-rose-700", borderColor: "border-rose-200", accent: "border-b-rose-400" },
  { color: "bg-purple-50", textColor: "text-purple-700", borderColor: "border-purple-200", accent: "border-b-purple-400" },
];

const STAGE_SUBTITLES: Record<number, string> = {
  0: "K volání / Domluvit",
  1: "Schůzka 1 / Sběr podkladů",
  2: "Práce u stolu / Modelace",
  3: "Schůzka 2 / Námitky",
  4: "Podpisy / Čeká na banku",
  5: "Výročí / Cross-sell",
};

function getProductDesign(type: string) {
  const t = type?.toLowerCase() || "";
  if (t.includes("hypo")) return { icon: <Home size={14} />, color: "text-blue-600 bg-blue-50", label: "Hypotéka" };
  if (t.includes("invest")) return { icon: <TrendingUp size={14} />, color: "text-emerald-600 bg-emerald-50", label: "Investice" };
  if (t.includes("pojis")) return { icon: <Shield size={14} />, color: "text-rose-600 bg-rose-50", label: "Pojištění" };
  if (t.includes("úvěr")) return { icon: <PiggyBank size={14} />, color: "text-purple-600 bg-purple-50", label: "Úvěr" };
  return { icon: <CheckCircle2 size={14} />, color: "text-slate-600 bg-slate-100", label: type || "Jiné" };
}

function getUrgencyProps(dateString?: string | null) {
  if (!dateString) return { class: "bg-slate-50 text-slate-500 border-slate-200", alert: null };
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date.getTime() < today.getTime()) return { class: "bg-red-50 text-red-700 border-red-200", alert: "Po termínu!" };
  if (date.getTime() === today.getTime()) return { class: "bg-orange-50 text-orange-700 border-orange-200", alert: null };
  return { class: "bg-slate-50 text-slate-600 border-slate-200", alert: null };
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "Neurčeno";
  return new Date(dateString).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" });
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[var(--wp-radius-sm)] w-full max-w-md shadow-2xl overflow-hidden border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <h2 className="font-bold text-lg text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function CreateForm({
  stageId,
  stages,
  contacts,
  onDone,
}: {
  stageId: string;
  stages: StageWithOpportunities[];
  contacts: ContactOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState(CASE_TYPES[0].value);
  const [contactId, setContactId] = useState("");
  const [expectedValue, setExpectedValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [selectedStage, setSelectedStage] = useState(stageId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      await createOpportunity({
        title,
        caseType,
        contactId: contactId || undefined,
        stageId: selectedStage,
        expectedValue: expectedValue || undefined,
        expectedCloseDate: expectedCloseDate || undefined,
      });
      router.refresh();
      onDone();
    });
  }

  const inputClass =
    "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-[var(--wp-radius-sm)] text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Název případu *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required placeholder="Např. Refinancování bytu..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Typ případu</label>
          <select value={caseType} onChange={(e) => setCaseType(e.target.value)} className={inputClass}>
            {CASE_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>
                {ct.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Stupeň</label>
          <select value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)} className={inputClass}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Klient / Kontakt</label>
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputClass}>
          <option value="">— Bez přiřazení —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Hodnota (Kč)</label>
          <input type="number" step="0.01" value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} className={inputClass} placeholder="0.00" />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Oček. uzavření</label>
          <input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
        <button type="button" onClick={onDone} className="px-5 py-2.5 rounded-[var(--wp-radius-sm)] font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
          Zrušit
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-2.5 rounded-[var(--wp-radius-sm)] font-bold bg-[#1a1c2e] text-white hover:bg-[#2a2d4a] shadow-lg shadow-indigo-900/20 transition-all disabled:opacity-70"
        >
          {pending ? "Ukládám…" : "Vytvořit případ"}
        </button>
      </div>
    </form>
  );
}

function EditForm({
  opp,
  stages,
  contacts,
  onDone,
}: {
  opp: OpportunityCard;
  stages: StageWithOpportunities[];
  contacts: ContactOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(opp.title);
  const [caseType, setCaseType] = useState(opp.caseType);
  const [contactId, setContactId] = useState(opp.contactId ?? "");
  const [expectedValue, setExpectedValue] = useState(opp.expectedValue ?? "");
  const [expectedCloseDate, setExpectedCloseDate] = useState(opp.expectedCloseDate ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      await updateOpportunity(opp.id, {
        title,
        caseType,
        contactId: contactId || null,
        expectedValue: expectedValue || null,
        expectedCloseDate: expectedCloseDate || null,
      });
      router.refresh();
      onDone();
    });
  }

  const inputClass =
    "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-[var(--wp-radius-sm)] text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Název případu *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Typ případu</label>
        <select value={caseType} onChange={(e) => setCaseType(e.target.value)} className={inputClass}>
          {CASE_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Klient / Kontakt</label>
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputClass}>
          <option value="">— Bez přiřazení —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Hodnota (Kč)</label>
          <input type="number" step="0.01" value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Oček. uzavření</label>
          <input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
        <button type="button" onClick={onDone} className="px-5 py-2.5 rounded-[var(--wp-radius-sm)] font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
          Zrušit
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-6 py-2.5 rounded-[var(--wp-radius-sm)] font-bold bg-[#1a1c2e] text-white hover:bg-[#2a2d4a] shadow-lg shadow-indigo-900/20 transition-all disabled:opacity-70"
        >
          {pending ? "Ukládám…" : "Uložit změny"}
        </button>
      </div>
    </form>
  );
}

const DRAG_TYPE = "application/x-pipeline-opportunity";

export function PipelineBoard({
  stages,
  contacts = [],
}: {
  stages: StageWithOpportunities[];
  contacts?: ContactOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [createStageId, setCreateStageId] = useState<string | null>(null);
  const [editOpp, setEditOpp] = useState<OpportunityCard | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [draggedOppId, setDraggedOppId] = useState<string | null>(null);
  const [dragSourceStageId, setDragSourceStageId] = useState<string | null>(null);
  const [dropTargetStageId, setDropTargetStageId] = useState<string | null>(null);
  const [openMenuOppId, setOpenMenuOppId] = useState<string | null>(null);

  const moveTo = useCallback(
    (opportunityId: string, stageId: string) => {
      startTransition(async () => {
        await updateOpportunityStage(opportunityId, stageId);
        router.refresh();
      });
    },
    [router, startTransition]
  );

  async function doDelete(id: string) {
    setDeletePending(true);
    try {
      await deleteOpportunity(id);
      setDeleteConfirmId(null);
      router.refresh();
    } finally {
      setDeletePending(false);
    }
  }

  function toggleStageCollapsed(stageId: string) {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  function handleCardDragStart(e: React.DragEvent, oppId: string, stageId: string) {
    setDraggedOppId(oppId);
    setDragSourceStageId(stageId);
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ opportunityId: oppId, stageId }));
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
  }

  function handleCardDragEnd() {
    setDraggedOppId(null);
    setDragSourceStageId(null);
    setDropTargetStageId(null);
  }

  function handleColumnDragOver(e: React.DragEvent, stageId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (e.dataTransfer.types.includes(DRAG_TYPE)) setDropTargetStageId(stageId);
  }

  function handleColumnDragLeave(e: React.DragEvent) {
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) setDropTargetStageId(null);
  }

  function handleColumnDrop(e: React.DragEvent, targetStageId: string) {
    e.preventDefault();
    setDropTargetStageId(null);
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    try {
      const { opportunityId, stageId: sourceStageId } = JSON.parse(raw);
      if (opportunityId && targetStageId !== sourceStageId) moveTo(opportunityId, targetStageId);
    } catch {
      // ignore
    }
    setDraggedOppId(null);
    setDragSourceStageId(null);
  }

  return (
    <>
      <style>{`
        .pipeline-board-grid { display: grid; grid-template-columns: repeat(3, minmax(340px, 1fr)); gap: 1.25rem; width: 100%; max-width: 100%; }
        @media (min-width: 1400px) { .pipeline-board-grid { grid-template-columns: repeat(3, minmax(380px, 1fr)); gap: 1.5rem; } }
        @media (max-width: 1024px) { .pipeline-board-grid { grid-template-columns: repeat(2, minmax(300px, 1fr)); } }
        @media (max-width: 640px)  { .pipeline-board-grid { grid-template-columns: 1fr; } }
        .pipeline-segment-body::-webkit-scrollbar { width: 8px; }
        .pipeline-segment-body::-webkit-scrollbar-track { background: transparent; }
        .pipeline-segment-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>

      <ConfirmDeleteModal
        open={deleteConfirmId !== null}
        title="Opravdu smazat tuto příležitost?"
        onConfirm={() => deleteConfirmId && doDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        loading={deletePending}
      />

      <div className="pipeline-board-grid pb-8 pt-2">
        {stages.map((stage, stageIdx) => {
          const theme = COLUMN_THEMES[stageIdx % COLUMN_THEMES.length];
          const isCollapsed = collapsedStages.has(stage.id);
          const isDropTarget = dropTargetStageId === stage.id;

          const subtitle = STAGE_SUBTITLES[stageIdx];

          return (
            <div
              key={stage.id}
              className="flex flex-col min-h-0 rounded-[var(--wp-radius-sm)] border bg-slate-50/50 overflow-hidden"
              style={{ minHeight: 360 }}
              onDragOver={(e) => handleColumnDragOver(e, stage.id)}
              onDragLeave={handleColumnDragLeave}
              onDrop={(e) => handleColumnDrop(e, stage.id)}
            >
              <button
                type="button"
                onClick={() => toggleStageCollapsed(stage.id)}
                className={`sticky top-0 z-10 flex items-center justify-between w-full p-5 rounded-t-2xl border-b text-left transition-colors ${theme.color} ${theme.borderColor} ${isDropTarget ? "ring-2 ring-blue-400 ring-offset-2" : ""}`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-slate-500">
                      {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                    </span>
                    <span className={`text-sm font-bold uppercase tracking-wider truncate ${theme.textColor}`}>
                      {stageIdx + 1}. {stage.name}
                    </span>
                  </div>
                  {subtitle && !isCollapsed && (
                    <span className={`text-[11px] font-semibold opacity-80 pl-7 ${theme.textColor}`}>
                      {subtitle}
                    </span>
                  )}
                </div>
                <span className="flex items-center justify-center min-w-[32px] h-8 px-2.5 rounded-full bg-white/70 font-bold text-sm text-slate-700 shadow-sm shrink-0">
                  {stage.opportunities.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="pipeline-segment-body flex flex-col gap-4 p-4 overflow-y-auto flex-1 min-h-0" style={{ maxHeight: 560 }}>
                  {stage.opportunities.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[var(--wp-radius-sm)] bg-white/50 p-6 min-h-[140px]">
                      <CheckCircle2 size={36} className="text-slate-300 mb-2" />
                      <p className="text-sm font-medium text-center">Vše hotovo</p>
                      <p className="text-xs text-center mt-0.5">Přetáhněte sem nebo přidejte</p>
                    </div>
                  ) : (
                    stage.opportunities.map((opp) => {
                      const product = getProductDesign(opp.caseType);
                      const urgency = getUrgencyProps(opp.expectedCloseDate);
                      const isDragging = draggedOppId === opp.id;
                      const isMenuOpen = openMenuOppId === opp.id;

                      return (
                        <div
                          key={opp.id}
                          draggable
                          onDragStart={(e) => handleCardDragStart(e, opp.id, stage.id)}
                          onDragEnd={handleCardDragEnd}
                          onClick={() => { if (!isMenuOpen) router.push(`/portal/pipeline/${opp.id}`); }}
                          className={`bg-white p-5 rounded-[var(--wp-radius-sm)] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] border border-slate-100 ${theme.accent} border-b-[3px] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-grab active:cursor-grabbing group flex flex-col shrink-0 ${isDragging ? "opacity-50 scale-95" : ""}`}
                        >
                          <div className="flex items-start gap-2 mb-3">
                            <span className="shrink-0 mt-0.5 text-slate-300 group-hover:text-slate-500" aria-hidden>
                              <GripVertical size={16} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex justify-between items-start gap-2 mb-2">
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--wp-radius-sm)] text-[11px] font-bold uppercase ${product.color}`}>
                                  {product.icon}
                                  {product.label}
                                </div>
                                {opp.expectedValue && (
                                  <span className="text-[13px] font-bold text-slate-600 bg-slate-100/80 px-2.5 py-1 rounded-[var(--wp-radius-xs)] shrink-0">
                                    {Number(opp.expectedValue).toLocaleString("cs-CZ")} Kč
                                  </span>
                                )}
                              </div>
                              <div className="flex justify-between items-center gap-2">
                                <h3 className="font-bold text-slate-800 text-[17px] leading-tight group-hover:text-blue-600 transition-colors truncate">
                                  {opp.title}
                                </h3>
                                <div className="flex gap-1.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                                  {opp.contactId && (
                                    <>
                                      <Link
                                        href={`/portal/contacts/${opp.contactId}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
                                        title="Kontakt"
                                      >
                                        <Phone size={14} />
                                      </Link>
                                      <Link
                                        href={`/portal/contacts/${opp.contactId}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                        title="Kontakt"
                                      >
                                        <Mail size={14} />
                                      </Link>
                                    </>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm font-medium text-slate-500 mt-0.5 truncate">{opp.contactName || "Bez kontaktu"}</p>
                            </div>
                          </div>

                          {urgency.alert && (
                            <div className="mb-3 px-3 py-2 rounded-[var(--wp-radius-sm)] text-xs font-bold flex items-center gap-2 bg-red-50 text-red-700 border border-red-100">
                              <AlertCircle size={14} className="shrink-0" />
                              {urgency.alert}
                            </div>
                          )}

                          <div className="bg-slate-50 rounded-[var(--wp-radius-sm)] p-3 border border-slate-100 flex flex-col gap-2 mt-auto">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 size={16} className="text-slate-400 shrink-0 mt-0.5" />
                              <span className="text-sm font-semibold text-slate-700 leading-snug">
                                {opp.title}
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                              <span className={`flex items-center gap-1.5 px-2 py-1 rounded-[var(--wp-radius-xs)] text-[11px] font-bold uppercase tracking-wide border ${urgency.class}`}>
                                <CalendarClock size={12} />
                                {formatDate(opp.expectedCloseDate)}
                              </span>
                              <div className="relative flex gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setOpenMenuOppId(isMenuOpen ? null : opp.id); }}
                                  className="w-7 h-7 flex items-center justify-center rounded-[var(--wp-radius-sm)] text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                                  title="Možnosti"
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                                {isMenuOpen && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpenMenuOppId(null); }} aria-hidden />
                                    <div className="absolute right-0 top-full mt-1 z-20 py-1 rounded-[var(--wp-radius-sm)] bg-white border border-slate-200 shadow-lg min-w-[140px]">
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenMenuOppId(null); setEditOpp(opp); }} className="w-full px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                        <Edit2 size={14} /> Upravit
                                      </button>
                                      {opp.contactId && (
                                        <Link href={`/portal/contacts/${opp.contactId}`} onClick={(e) => { e.stopPropagation(); setOpenMenuOppId(null); }} className="block px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                          <Phone size={14} /> Otevřít kontakt
                                        </Link>
                                      )}
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenMenuOppId(null); setDeleteConfirmId(opp.id); }} className="w-full px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-2">
                                        <Trash2 size={14} /> Smazat
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <button
                    type="button"
                    onClick={() => setCreateStageId(stage.id)}
                    className="flex items-center justify-center gap-2 w-full py-3.5 mt-1 rounded-[var(--wp-radius-sm)] text-slate-400 text-sm font-bold hover:bg-white hover:text-slate-600 border-2 border-dashed border-slate-200 hover:border-slate-300 transition-colors shrink-0"
                  >
                    <Plus size={18} /> Přidat
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={createStageId !== null} onClose={() => setCreateStageId(null)} title="Nová příležitost">
        {createStageId && <CreateForm stageId={createStageId} stages={stages} contacts={contacts} onDone={() => setCreateStageId(null)} />}
      </Modal>

      <Modal open={editOpp !== null} onClose={() => setEditOpp(null)} title="Upravit příležitost">
        {editOpp && <EditForm opp={editOpp} stages={stages} contacts={contacts} onDone={() => setEditOpp(null)} />}
      </Modal>
    </>
  );
}
