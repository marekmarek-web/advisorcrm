"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
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
  GripVertical,
  Phone,
  Mail,
  MoreHorizontal,
  Search,
  Sparkles,
  Filter,
  User,
  Clock,
  Briefcase,
  Layers,
} from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { useToast } from "@/app/components/Toast";

type ContactOption = { id: string; firstName: string; lastName: string };

const CASE_TYPES = [
  { value: "hypotéka", label: "Hypotéka" },
  { value: "investice", label: "Investice" },
  { value: "pojištění", label: "Pojištění" },
  { value: "úvěr", label: "Úvěr" },
  { value: "jiné", label: "Jiné" },
];

// v2-style: color, textColor, borderColor, solidBg (for number badge), accent (card border)
const COLUMN_THEMES = [
  { color: "bg-emerald-50/80", textColor: "text-emerald-700", borderColor: "border-emerald-100", solidBg: "bg-emerald-500", accent: "border-b-emerald-400" },
  { color: "bg-blue-50/80", textColor: "text-blue-700", borderColor: "border-blue-100", solidBg: "bg-blue-500", accent: "border-b-blue-400" },
  { color: "bg-indigo-50/80", textColor: "text-indigo-700", borderColor: "border-indigo-100", solidBg: "bg-indigo-500", accent: "border-b-indigo-400" },
  { color: "bg-amber-50/80", textColor: "text-amber-700", borderColor: "border-amber-100", solidBg: "bg-amber-500", accent: "border-b-amber-400" },
  { color: "bg-rose-50/80", textColor: "text-rose-700", borderColor: "border-rose-100", solidBg: "bg-rose-500", accent: "border-b-rose-400" },
  { color: "bg-purple-50/80", textColor: "text-purple-700", borderColor: "border-purple-100", solidBg: "bg-purple-500", accent: "border-b-purple-400" },
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
  if (t.includes("hypo")) return { icon: <Home size={12} />, color: "text-blue-700 bg-blue-50 border-blue-200", label: "Hypotéka" };
  if (t.includes("invest")) return { icon: <TrendingUp size={12} />, color: "text-emerald-700 bg-emerald-50 border-emerald-200", label: "Investice" };
  if (t.includes("pojis")) return { icon: <Shield size={12} />, color: "text-rose-700 bg-rose-50 border-rose-200", label: "Pojištění" };
  if (t.includes("úvěr")) return { icon: <PiggyBank size={12} />, color: "text-purple-700 bg-purple-50 border-purple-200", label: "Úvěr" };
  return { icon: <CheckCircle2 size={12} />, color: "text-slate-600 bg-slate-50 border-slate-200", label: type || "Jiné" };
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

function formatDateShort(dateString?: string | null) {
  if (!dateString) return "Neurčeno";
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Dnes";
  if (diff === 1) return "Zítra";
  if (diff === -1) return "Včera";
  return formatDate(dateString);
}

function formatValue(val: string | number | null | undefined, valueType?: string) {
  if (val == null || val === "") return "—";
  const n = Number(val);
  if (Number.isNaN(n)) return "—";
  const formatted = n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${(n / 1_000).toFixed(0)}k`;
  return valueType === "měs" ? `${formatted} / měs` : `${formatted} Kč`;
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
  defaultContactId,
  hideContactSelector,
  onMutationComplete,
}: {
  stageId: string;
  stages: StageWithOpportunities[];
  contacts: ContactOption[];
  onDone: () => void;
  defaultContactId?: string;
  hideContactSelector?: boolean;
  onMutationComplete?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState(CASE_TYPES[0].value);
  const [contactId, setContactId] = useState(defaultContactId ?? "");
  const [expectedValue, setExpectedValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [selectedStage, setSelectedStage] = useState(stageId);
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveContactId = hideContactSelector ? defaultContactId ?? contactId : contactId;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      setFormError(null);
      try {
        await createOpportunity({
          title,
          caseType,
          contactId: effectiveContactId || undefined,
          stageId: selectedStage,
          expectedValue: expectedValue || undefined,
          expectedCloseDate: expectedCloseDate || undefined,
        });
        router.refresh();
        onMutationComplete?.();
        onDone();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Uložení se nepodařilo.");
      }
    });
  }

  const inputClass =
    "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-[var(--wp-radius-sm)] text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all";

  const contactDisplayName = hideContactSelector
    ? (contacts.length > 0 ? `${contacts[0].firstName} ${contacts[0].lastName}`.trim() || "Tento klient" : "Tento klient")
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Název případu *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required placeholder="Např. Refinancování bytu..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Typ případu</label>
          <CustomDropdown
            value={caseType}
            onChange={setCaseType}
            options={CASE_TYPES.map((ct) => ({ id: ct.value, label: ct.label }))}
            placeholder="Typ případu"
            icon={Briefcase}
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Stupeň</label>
          <CustomDropdown
            value={selectedStage}
            onChange={setSelectedStage}
            options={stages.map((s) => ({ id: s.id, label: s.name }))}
            placeholder="Stupeň"
            icon={Layers}
          />
        </div>
      </div>
      {!hideContactSelector && (
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Klient / Kontakt</label>
        <CustomDropdown
          value={contactId}
          onChange={setContactId}
          options={[{ id: "", label: "— Bez přiřazení —" }, ...contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))]}
          placeholder="— Bez přiřazení —"
          icon={User}
        />
      </div>
      )}
      {hideContactSelector && contactDisplayName && (
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Klient</label>
        <p className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-[var(--wp-radius-sm)] text-sm text-slate-700 font-medium">
          {contactDisplayName}
        </p>
      </div>
      )}
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
      {formError && (
        <p className="rounded-[var(--wp-radius-sm)] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {formError}
        </p>
      )}
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
  onMutationComplete,
}: {
  opp: OpportunityCard;
  stages: StageWithOpportunities[];
  contacts: ContactOption[];
  onDone: () => void;
  onMutationComplete?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(opp.title);
  const [caseType, setCaseType] = useState(opp.caseType);
  const [contactId, setContactId] = useState(opp.contactId ?? "");
  const [expectedValue, setExpectedValue] = useState(opp.expectedValue ?? "");
  const [expectedCloseDate, setExpectedCloseDate] = useState(opp.expectedCloseDate ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      setFormError(null);
      try {
        await updateOpportunity(opp.id, {
          title,
          caseType,
          contactId: contactId || null,
          expectedValue: expectedValue || null,
          expectedCloseDate: expectedCloseDate || null,
        });
        router.refresh();
        onMutationComplete?.();
        onDone();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Uložení se nepodařilo.");
      }
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
        <CustomDropdown
          value={caseType}
          onChange={setCaseType}
          options={CASE_TYPES.map((ct) => ({ id: ct.value, label: ct.label }))}
          placeholder="Typ případu"
          icon={Briefcase}
        />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 ml-1">Klient / Kontakt</label>
        <CustomDropdown
          value={contactId}
          onChange={setContactId}
          options={[{ id: "", label: "— Bez přiřazení —" }, ...contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))]}
          placeholder="— Bez přiřazení —"
          icon={User}
        />
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
      {formError && (
        <p className="rounded-[var(--wp-radius-sm)] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {formError}
        </p>
      )}
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
  contactContext,
  onMutationComplete,
  initialOpenCreateStageId,
  onOpenCreateConsumed,
  totalPotential: totalPotentialProp,
}: {
  stages: StageWithOpportunities[];
  contacts?: ContactOption[];
  /** When set, create form locks new opportunities to this contact (client tab). */
  contactContext?: { contactId: string };
  /** Called after create/update/delete/move so client-scoped board can refetch. */
  onMutationComplete?: () => void;
  /** When set, open create modal for this stage on mount (e.g. from client empty state CTA). */
  initialOpenCreateStageId?: string | null;
  /** Called after opening create modal from initialOpenCreateStageId so parent can clear it. */
  onOpenCreateConsumed?: () => void;
  /** Total pipeline potential (from server); when set, shows v2 local header. */
  totalPotential?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [localStages, setLocalStages] = useState<StageWithOpportunities[]>(stages);
  const [createStageId, setCreateStageId] = useState<string | null>(null);

  useEffect(() => {
    setLocalStages(stages);
  }, [stages]);

  useEffect(() => {
    if (initialOpenCreateStageId) {
      setCreateStageId(initialOpenCreateStageId);
      onOpenCreateConsumed?.();
    }
  }, [initialOpenCreateStageId, onOpenCreateConsumed]);
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [editOpp, setEditOpp] = useState<OpportunityCard | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [draggedOppId, setDraggedOppId] = useState<string | null>(null);
  const [dragSourceStageId, setDragSourceStageId] = useState<string | null>(null);
  const [dropTargetStageId, setDropTargetStageId] = useState<string | null>(null);
  const [openMenuOppId, setOpenMenuOppId] = useState<string | null>(null);

  const moveTo = useCallback(
    (opportunityId: string, stageId: string) => {
      setLocalStages((prev) => {
        let moved: OpportunityCard | null = null;
        const stripped = prev.map((stage) => {
          const remaining = stage.opportunities.filter((opp) => {
            if (opp.id === opportunityId) {
              moved = opp;
              return false;
            }
            return true;
          });
          return { ...stage, opportunities: remaining };
        });
        if (!moved) return prev;
        return stripped.map((stage) =>
          stage.id === stageId ? { ...stage, opportunities: [...stage.opportunities, moved as OpportunityCard] } : stage
        );
      });
      startTransition(async () => {
        const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        try {
          await updateOpportunityStage(opportunityId, stageId);
          router.refresh();
          onMutationComplete?.();
          if (process.env.NODE_ENV !== "production") {
            const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
            console.info("[perf] pipeline-move-ms", Math.round(t1 - t0), { opportunityId, stageId });
          }
        } catch (error) {
          toast.showToast(error instanceof Error ? error.message : "Přesun se nepodařil.", "error");
          router.refresh();
          onMutationComplete?.();
        }
      });
    },
    [router, startTransition, onMutationComplete, toast]
  );

  async function doDelete(id: string) {
    setDeletePending(true);
    try {
      await deleteOpportunity(id);
      setDeleteConfirmId(null);
      router.refresh();
      onMutationComplete?.();
    } finally {
      setDeletePending(false);
    }
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

  const filteredStages = localStages.map((stage) => {
    const opps = stage.opportunities.filter((opp) => {
      const q = pipelineSearch.toLowerCase();
      const matchSearch = !q || opp.title.toLowerCase().includes(q) || (opp.contactName?.toLowerCase().includes(q) ?? false);
      const matchType = filterType === "all" || (opp.caseType?.toLowerCase() ?? "") === filterType;
      return matchSearch && matchType;
    });
    return { ...stage, opportunities: opps };
  });

  const totalPotential =
    totalPotentialProp ?? filteredStages.reduce((sum, s) => sum + s.opportunities.reduce((a, o) => a + Number(o.expectedValue || 0), 0), 0);
  const showLocalHeader = totalPotentialProp !== undefined;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
        .font-pipeline-sans { font-family: 'Inter', sans-serif; }
        .font-pipeline-display { font-family: 'Plus Jakarta Sans', sans-serif; }
        .hide-scrollbar::-webkit-scrollbar { width: 4px; }
        .hide-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .hide-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
        .hide-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
      `}</style>

      <ConfirmDeleteModal
        open={deleteConfirmId !== null}
        title="Opravdu smazat tuto příležitost?"
        onConfirm={() => deleteConfirmId && doDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        loading={deletePending}
      />

      <div className="font-pipeline-sans text-slate-800 flex flex-col flex-1 min-h-0">
        {/* Local header (v2): Obchodní Pipeline, metadata, Všechny filtry */}
        {showLocalHeader && (
          <div className="px-0 py-6 flex flex-wrap justify-between items-end gap-4 border-b border-slate-100 flex-shrink-0 z-10 bg-white rounded-t-xl">
            <div>
              <h1 className="font-pipeline-display text-2xl font-black text-slate-900 leading-tight mb-1">Obchodní Pipeline</h1>
              <div className="flex items-center gap-3 text-sm font-medium text-slate-500 mt-1 flex-wrap">
                <span>Potenciál: <strong className="text-slate-800 font-bold">{new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(totalPotential)}</strong></span>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <span className="text-rose-500 flex items-center gap-1 font-bold"><AlertCircle size={14} /> 2 úkoly k řešení</span>
              </div>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFilterPopoverOpen((o) => !o)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all min-h-[44px]"
              >
                <Filter size={16} /> Všechny filtry
              </button>
              {filterPopoverOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterPopoverOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full mt-2 z-20 py-2 px-3 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[180px]">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">Typ případu</p>
                    {[{ v: "all", l: "Vše" }, ...CASE_TYPES.map((t) => ({ v: t.value, l: t.label }))].map((f) => (
                      <button
                        key={f.v}
                        type="button"
                        onClick={() => { setFilterType(f.v); setFilterPopoverOpen(false); }}
                        className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-bold transition-all ${filterType === f.v ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        {f.l}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Toolbar: search, AI, Nový obchod (v2 style) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 py-4 flex-shrink-0">
          <div className="relative group max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search size={16} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Rychlé hledání obchodu (jméno, telefon)..."
              value={pipelineSearch}
              onChange={(e) => setPipelineSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-slate-700 placeholder:text-slate-400 placeholder:font-medium min-h-[44px]"
            />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => toast.showToast("AI analýza pipeline bude brzy k dispozici.")}
              className="flex items-center gap-2 px-3 py-2 text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl text-xs font-bold transition-colors min-h-[44px]"
            >
              <Sparkles size={14} className="text-amber-500" /> AI Analýza pipeline
            </button>
            <button
              type="button"
              onClick={() => setCreateStageId(localStages[0]?.id ?? null)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1a1c2e] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-[#2a2d4a] transition-all hover:-translate-y-0.5 active:scale-95 min-h-[44px]"
            >
              <Plus size={14} /> Nový obchod
            </button>
          </div>
        </div>

        {/* Grid 3x2 (v2) */}
        <main className="flex-1 overflow-y-auto hide-scrollbar min-h-0">
          <div className="max-w-[1600px] mx-auto h-full pb-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
              {filteredStages.map((stage, stageIdx) => {
                const theme = COLUMN_THEMES[stageIdx % COLUMN_THEMES.length];
                const isDropTarget = dropTargetStageId === stage.id;
                const subtitle = STAGE_SUBTITLES[stageIdx];
                const stageNameWithoutNumber = stage.name.includes(". ") ? stage.name.split(". ")[1] : stage.name;

                return (
                  <div
                    key={stage.id}
                    className={`flex flex-col h-[480px] bg-slate-50/60 rounded-[24px] border transition-all duration-300 overflow-hidden ${isDropTarget ? "border-indigo-400 shadow-md ring-4 ring-indigo-50" : "border-slate-200/70 shadow-sm hover:border-slate-300"}`}
                    onDragOver={(e) => handleColumnDragOver(e, stage.id)}
                    onDragLeave={handleColumnDragLeave}
                    onDrop={(e) => handleColumnDrop(e, stage.id)}
                  >
                    <div className={`px-5 py-4 flex items-center justify-between border-b ${theme.borderColor} ${theme.color}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center text-[13px] font-black text-white shadow-sm ${theme.solidBg}`}>
                          {stageIdx + 1}
                        </div>
                        <div className="flex flex-col">
                          <h3 className={`font-bold text-[14px] uppercase tracking-wide ${theme.textColor}`}>
                            {stageNameWithoutNumber}
                          </h3>
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-0.5 text-slate-600">
                            {subtitle ?? ""}
                          </p>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-lg bg-white/80 text-[13px] font-black shadow-sm border border-white ${theme.textColor}`}>
                        {stage.opportunities.length}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto hide-scrollbar p-4 flex flex-col gap-4">
                      {stage.opportunities.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[16px] bg-white/50 p-6 m-2 opacity-60 min-h-[120px]">
                          <CheckCircle2 size={32} className="text-slate-300 mb-2" />
                          <p className="text-xs font-bold text-center uppercase tracking-widest">Žádné obchody</p>
                        </div>
                      ) : (
                        stage.opportunities.map((opp) => {
                          const product = getProductDesign(opp.caseType);
                          const urgency = getUrgencyProps(opp.expectedCloseDate);
                          const isDragging = draggedOppId === opp.id;
                          const isMenuOpen = openMenuOppId === opp.id;
                          const dateShort = formatDateShort(opp.expectedCloseDate);
                          const isTodayOrYesterday = dateShort === "Dnes" || dateShort === "Včera";

                          return (
                            <div
                              key={opp.id}
                              draggable
                              onDragStart={(e) => handleCardDragStart(e, opp.id, stage.id)}
                              onDragEnd={handleCardDragEnd}
                              onClick={() => { if (!isMenuOpen) router.push(`/portal/pipeline/${opp.id}`); }}
                              className={`bg-white rounded-[20px] p-4 border border-slate-200 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg hover:border-indigo-300 hover:-translate-y-0.5 transition-all duration-200 cursor-grab active:cursor-grabbing group flex flex-col relative shrink-0 ${theme.accent} border-b-[3px] ${isDragging ? "opacity-40 scale-95" : ""}`}
                            >
                              <div className="absolute left-1 top-1/2 -translate-y-1/2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <GripVertical size={14} />
                              </div>

                              <div className="flex justify-between items-start mb-3 pl-2">
                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black tracking-wide uppercase border ${product.color}`}>
                                  {product.icon} {product.label}
                                </div>
                                <div className="font-bold text-sm text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                  {formatValue(opp.expectedValue, undefined)}
                                </div>
                              </div>

                              <div className="mb-3 pl-2">
                                <h4 className="font-pipeline-display font-bold text-slate-900 leading-snug mb-1 group-hover:text-indigo-600 transition-colors text-[15px]">
                                  {opp.title}
                                </h4>
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
                                  <User size={12} className="text-slate-400" /> {opp.contactName || "Bez kontaktu"}
                                </div>
                              </div>

                              {urgency.alert && (
                                <div className="mb-3 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-start gap-1.5 border ml-2 bg-rose-50 text-rose-700 border-rose-200">
                                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                  <span className="leading-snug">{urgency.alert}</span>
                                </div>
                              )}

                              <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 flex flex-col gap-2 mt-auto ml-2">
                                <div className="flex items-start gap-2">
                                  <CheckCircle2 size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                  <span className="text-[12px] font-semibold text-slate-700 leading-snug">
                                    Otevřít detail
                                  </span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-slate-200/60">
                                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${urgency.class}`}>
                                    {isTodayOrYesterday ? <Clock size={10} /> : <CalendarClock size={10} />}
                                    {dateShort}
                                  </div>
                                  <div className="flex gap-1">
                                    {opp.contactId && (
                                      <>
                                        <Link href={`/portal/contacts/${opp.contactId}`} onClick={(e) => e.stopPropagation()} className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 border border-slate-200 transition-colors" title="Zavolat"><Phone size={12} /></Link>
                                        <Link href={`/portal/contacts/${opp.contactId}`} onClick={(e) => e.stopPropagation()} className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 transition-colors" title="Napsat e-mail"><Mail size={12} /></Link>
                                      </>
                                    )}
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditOpp(opp); }} className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-slate-200 transition-colors" title="Upravit"><Edit2 size={12} /></button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setOpenMenuOppId(isMenuOpen ? null : opp.id); }}
                                      className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 border border-slate-200 transition-colors"
                                      title="Možnosti"
                                    >
                                      <MoreHorizontal size={12} />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {isMenuOpen && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpenMenuOppId(null); }} aria-hidden />
                                  <div className="absolute right-2 bottom-14 z-20 py-1 rounded-lg bg-white border border-slate-200 shadow-lg min-w-[140px]">
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
                          );
                        })
                      )}

                      <button
                        type="button"
                        onClick={() => setCreateStageId(stage.id)}
                        className="flex items-center justify-center gap-2 w-full py-3 mt-1 rounded-[16px] text-slate-500 text-[11px] font-black uppercase tracking-widest bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 hover:text-indigo-600 transition-all active:scale-[0.98] min-h-[44px]"
                      >
                        <Plus size={16} strokeWidth={2.5} /> Přidat
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      <Modal open={createStageId !== null} onClose={() => setCreateStageId(null)} title="Nová příležitost">
        {createStageId && (
          <CreateForm
            stageId={createStageId}
            stages={localStages}
            contacts={contacts}
            onDone={() => setCreateStageId(null)}
            defaultContactId={contactContext?.contactId}
            hideContactSelector={!!contactContext}
            onMutationComplete={onMutationComplete}
          />
        )}
      </Modal>

      <Modal open={editOpp !== null} onClose={() => setEditOpp(null)} title="Upravit příležitost">
        {editOpp && (
          <EditForm
            opp={editOpp}
            stages={localStages}
            contacts={contacts}
            onDone={() => setEditOpp(null)}
            onMutationComplete={onMutationComplete}
          />
        )}
      </Modal>
    </>
  );
}
