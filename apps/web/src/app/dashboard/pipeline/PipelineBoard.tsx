"use client";

import { useState, useTransition, useCallback, useEffect, memo, type DragEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
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
  Filter,
  User,
  Clock,
  Briefcase,
  Layers,
  Save,
} from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { useToast } from "@/app/components/Toast";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { useOptionalAiAssistantDrawer } from "@/app/portal/AiAssistantDrawerContext";
import { PIPELINE_COLUMN_THEMES as COLUMN_THEMES } from "@/lib/pipeline/column-themes";

type ContactOption = { id: string; firstName: string; lastName: string };

const CASE_TYPES = [
  { value: "hypotéka", label: "Hypotéka" },
  { value: "investice", label: "Investice" },
  { value: "pojištění", label: "Pojištění" },
  { value: "úvěr", label: "Úvěr" },
  { value: "jiné", label: "Jiné" },
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
  if (t.includes("hypo")) return { icon: <Home size={12} />, color: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-200 dark:bg-blue-950/60 dark:border-blue-700/60", label: "Hypotéka" };
  if (t.includes("invest")) return { icon: <TrendingUp size={12} />, color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-700/60", label: "Investice" };
  if (t.includes("pojis")) return { icon: <Shield size={12} />, color: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-200 dark:bg-rose-950/60 dark:border-rose-700/60", label: "Pojištění" };
  if (t.includes("úvěr")) return { icon: <PiggyBank size={12} />, color: "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-200 dark:bg-purple-950/60 dark:border-purple-700/60", label: "Úvěr" };
  return {
    icon: <CheckCircle2 size={12} />,
    color:
      "text-[color:var(--wp-text-muted)] bg-[color:var(--wp-surface-muted)] border-[color:var(--wp-border)]",
    label: type || "Jiné",
  };
}

function getUrgencyProps(dateString?: string | null) {
  if (!dateString)
    return {
      class:
        "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-muted)] border-[color:var(--wp-border)]",
      alert: null,
    };
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date.getTime() < today.getTime()) return { class: "bg-red-50 text-red-700 border-red-200", alert: "Po termínu!" };
  if (date.getTime() === today.getTime()) return { class: "bg-orange-50 text-orange-700 border-orange-200", alert: null };
  return {
    class:
      "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-muted)] border-[color:var(--wp-border)]",
    alert: null,
  };
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80 px-6 py-4">
          <h2 className="text-lg font-bold text-[color:var(--wp-text)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--wp-surface-raised)] text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)]"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/** Izolovaná karta obchodu – méně práce pro překreslení rodiče při změnách mimo tuto kartu. */
const PipelineOpportunityCard = memo(function PipelineOpportunityCard({
  opp,
  stageId,
  themeAccent,
  isDragging,
  isMenuOpen,
  onDragStart,
  onDragEnd,
  onNavigateDetail,
  onRequestEdit,
  onToggleMenu,
  onCloseMenu,
  onMenuEdit,
  onMenuDelete,
}: {
  opp: OpportunityCard;
  stageId: string;
  themeAccent: string;
  isDragging: boolean;
  isMenuOpen: boolean;
  onDragStart: (e: DragEvent, opportunityId: string, stageId: string) => void;
  onDragEnd: () => void;
  onNavigateDetail: (opportunityId: string) => void;
  onRequestEdit: (opportunity: OpportunityCard) => void;
  onToggleMenu: (opportunityId: string) => void;
  onCloseMenu: () => void;
  onMenuEdit: (opportunity: OpportunityCard) => void;
  onMenuDelete: (opportunityId: string) => void;
}) {
  const handleDragStart = useCallback(
    (e: DragEvent) => onDragStart(e, opp.id, stageId),
    [onDragStart, opp.id, stageId],
  );
  const handleShellClick = useCallback(() => {
    if (!isMenuOpen) onNavigateDetail(opp.id);
  }, [isMenuOpen, onNavigateDetail, opp.id]);
  const handleEdit = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onRequestEdit(opp);
    },
    [onRequestEdit, opp],
  );
  const handleMenuToggle = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onToggleMenu(opp.id);
    },
    [onToggleMenu, opp.id],
  );
  const handleMenuBackdrop = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onCloseMenu();
    },
    [onCloseMenu],
  );
  const handleMenuEdit = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onMenuEdit(opp);
    },
    [onMenuEdit, opp],
  );
  const handleMenuContactNav = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onCloseMenu();
    },
    [onCloseMenu],
  );
  const handleMenuDelete = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onMenuDelete(opp.id);
    },
    [onMenuDelete, opp.id],
  );

  const product = getProductDesign(opp.caseType);
  const urgency = getUrgencyProps(opp.expectedCloseDate);
  const dateShort = formatDateShort(opp.expectedCloseDate);
  const isTodayOrYesterday = dateShort === "Dnes" || dateShort === "Včera";
  const aiSubtitle =
    opp.customFields != null && typeof opp.customFields.aiSubtitle === "string"
      ? opp.customFields.aiSubtitle
      : null;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={handleShellClick}
      className={`group relative flex shrink-0 cursor-grab flex-col rounded-[20px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/50 hover:shadow-lg active:cursor-grabbing dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.45)] ${themeAccent} border-b-[3px] ${isDragging ? "scale-95 opacity-40" : ""}`}
    >
      <div className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical size={14} />
      </div>

      <div className="flex justify-between items-start mb-3 pl-2">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black tracking-wide uppercase border ${product.color}`}>
          {product.icon} {product.label}
        </div>
        <div className="rounded border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-2 py-0.5 text-sm font-bold text-[color:var(--wp-text)]">
          {formatValue(opp.expectedValue, undefined)}
        </div>
      </div>

      <div className="mb-3 pl-2">
        <h4 className="font-pipeline-display mb-1 text-[15px] font-bold leading-snug text-[color:var(--wp-text)] transition-colors group-hover:text-indigo-500 dark:group-hover:text-indigo-400">
          {opp.title}
        </h4>
        {aiSubtitle ? (
          <p
            className="text-[11px] font-medium text-[color:var(--wp-text-secondary)] leading-snug mb-0.5 truncate"
            title={aiSubtitle}
          >
            {aiSubtitle}
          </p>
        ) : null}
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--wp-text-secondary)]">
          <User size={12} className="text-[color:var(--wp-text-tertiary)]" /> {opp.contactName || "Bez kontaktu"}
        </div>
      </div>

      {urgency.alert && (
        <div className="mb-3 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-start gap-1.5 border ml-2 bg-rose-50 text-rose-700 border-rose-200">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span className="leading-snug">{urgency.alert}</span>
        </div>
      )}

      <div className="ml-2 mt-auto flex flex-col gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80 p-2.5">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[color:var(--wp-text-tertiary)]" />
          <span className="text-[12px] font-semibold leading-snug text-[color:var(--wp-text-secondary)]">Otevřít detail</span>
        </div>
        <div className="flex items-center justify-between border-t border-[color:var(--wp-surface-card-border)] pt-2">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${urgency.class}`}>
            {isTodayOrYesterday ? <Clock size={10} /> : <CalendarClock size={10} />}
            {dateShort}
          </div>
          <div className="flex gap-1">
            {opp.contactId && (
              <>
                <Link
                  href={`/portal/contacts/${opp.contactId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] transition-colors hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-400"
                  title="Zavolat"
                >
                  <Phone size={12} />
                </Link>
                <Link
                  href={`/portal/contacts/${opp.contactId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] transition-colors hover:bg-blue-500/15 hover:text-blue-600 dark:hover:text-blue-400"
                  title="Napsat e-mail"
                >
                  <Mail size={12} />
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={handleEdit}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)]"
              title="Upravit"
            >
              <Edit2 size={12} />
            </button>
            <button
              type="button"
              onClick={handleMenuToggle}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)]"
              title="Možnosti"
            >
              <MoreHorizontal size={12} />
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={handleMenuBackdrop} aria-hidden />
          <div className="absolute bottom-14 right-2 z-20 min-w-[140px] rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] py-1 shadow-lg">
            <button
              type="button"
              onClick={handleMenuEdit}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)]"
            >
              <Edit2 size={14} /> Upravit
            </button>
            {opp.contactId && (
              <Link
                href={`/portal/contacts/${opp.contactId}`}
                onClick={handleMenuContactNav}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)]"
              >
                <Phone size={14} /> Otevřít kontakt
              </Link>
            )}
            <button
              type="button"
              onClick={handleMenuDelete}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
            >
              <Trash2 size={14} /> Smazat
            </button>
          </div>
        </>
      )}
    </div>
  );
});

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
        onMutationComplete?.();
        onDone();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Uložení se nepodařilo.");
      }
    });
  }

  const inputClass =
    "w-full rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-4 py-2.5 text-sm text-[color:var(--wp-input-text)] outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25";

  const contactDisplayName = hideContactSelector
    ? (contacts.length > 0 ? `${contacts[0].firstName} ${contacts[0].lastName}`.trim() || "Tento klient" : "Tento klient")
    : null;

  const labelClass = "mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Název případu *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required placeholder="Např. Refinancování bytu..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Typ případu</label>
          <CustomDropdown
            value={caseType}
            onChange={setCaseType}
            options={CASE_TYPES.map((ct) => ({ id: ct.value, label: ct.label }))}
            placeholder="Typ případu"
            icon={Briefcase}
          />
        </div>
        <div>
          <label className={labelClass}>Stupeň</label>
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
        <label className={labelClass}>Klient / Kontakt</label>
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
        <label className={labelClass}>Klient</label>
        <p className="rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-4 py-2.5 text-sm font-medium text-[color:var(--wp-text)]">
          {contactDisplayName}
        </p>
      </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Hodnota (Kč)</label>
          <input type="number" step="0.01" value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} className={inputClass} placeholder="0.00" />
        </div>
        <div>
          <label className={labelClass}>Oček. uzavření</label>
          <input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} className={inputClass} />
        </div>
      </div>
      {formError && (
        <p className="rounded-[var(--wp-radius-sm)] border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {formError}
        </p>
      )}
      <div className="mt-2 flex justify-end gap-3 border-t border-[color:var(--wp-surface-card-border)] pt-4">
        <button type="button" onClick={onDone} className="rounded-[var(--wp-radius-sm)] px-5 py-2.5 font-semibold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)]">
          Zrušit
        </button>
        <CreateActionButton type="submit" isLoading={pending} icon={Briefcase} className="rounded-[14px] px-6 py-2.5">
          {pending ? "Ukládám…" : "Vytvořit případ"}
        </CreateActionButton>
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
        onMutationComplete?.();
        onDone();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Uložení se nepodařilo.");
      }
    });
  }

  const inputClass =
    "w-full rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] px-4 py-2.5 text-sm text-[color:var(--wp-input-text)] outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25";
  const labelClass = "mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Název případu *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>Typ případu</label>
        <CustomDropdown
          value={caseType}
          onChange={setCaseType}
          options={CASE_TYPES.map((ct) => ({ id: ct.value, label: ct.label }))}
          placeholder="Typ případu"
          icon={Briefcase}
        />
      </div>
      <div>
        <label className={labelClass}>Klient / Kontakt</label>
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
          <label className={labelClass}>Hodnota (Kč)</label>
          <input type="number" step="0.01" value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Oček. uzavření</label>
          <input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} className={inputClass} />
        </div>
      </div>
      {formError && (
        <p className="rounded-[var(--wp-radius-sm)] border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {formError}
        </p>
      )}
      <div className="mt-2 flex justify-end gap-3 border-t border-[color:var(--wp-surface-card-border)] pt-4">
        <button type="button" onClick={onDone} className="rounded-[var(--wp-radius-sm)] px-5 py-2.5 font-semibold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-muted)]">
          Zrušit
        </button>
        <CreateActionButton type="submit" isLoading={pending} icon={Save} className="rounded-[14px] px-6 py-2.5">
          {pending ? "Ukládám…" : "Uložit změny"}
        </CreateActionButton>
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
  const queryClient = useQueryClient();
  const toast = useToast();
  const aiAssistant = useOptionalAiAssistantDrawer();
  const [, startTransition] = useTransition();
  const [localStages, setLocalStages] = useState<StageWithOpportunities[]>(stages);

  const syncPipelineData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
  }, [queryClient]);

  const afterMutation = useCallback(() => {
    syncPipelineData();
    onMutationComplete?.();
  }, [syncPipelineData, onMutationComplete]);
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
          afterMutation();
          if (process.env.NODE_ENV !== "production") {
            const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
            console.info("[perf] pipeline-move-ms", Math.round(t1 - t0), { opportunityId, stageId });
          }
        } catch (error) {
          toast.showToast(error instanceof Error ? error.message : "Přesun se nepodařil.", "error");
          afterMutation();
        }
      });
    },
    [startTransition, afterMutation, toast]
  );

  async function doDelete(id: string) {
    setDeletePending(true);
    try {
      await deleteOpportunity(id);
      setDeleteConfirmId(null);
      afterMutation();
    } finally {
      setDeletePending(false);
    }
  }

  const handleCardDragStart = useCallback((e: DragEvent, oppId: string, stageId: string) => {
    setDraggedOppId(oppId);
    setDragSourceStageId(stageId);
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ opportunityId: oppId, stageId }));
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
  }, []);

  const handleCardDragEnd = useCallback(() => {
    setDraggedOppId(null);
    setDragSourceStageId(null);
    setDropTargetStageId(null);
  }, []);

  const navigateToPipelineDetail = useCallback(
    (opportunityId: string) => {
      router.push(`/portal/pipeline/${opportunityId}`);
    },
    [router],
  );

  const requestEditOpp = useCallback((opportunity: OpportunityCard) => {
    setEditOpp(opportunity);
  }, []);

  const toggleOppMenu = useCallback((opportunityId: string) => {
    setOpenMenuOppId((prev) => (prev === opportunityId ? null : opportunityId));
  }, []);

  const closeOppMenu = useCallback(() => {
    setOpenMenuOppId(null);
  }, []);

  const menuEditOpp = useCallback((opportunity: OpportunityCard) => {
    setOpenMenuOppId(null);
    setEditOpp(opportunity);
  }, []);

  const menuRequestDelete = useCallback((opportunityId: string) => {
    setOpenMenuOppId(null);
    setDeleteConfirmId(opportunityId);
  }, []);

  const handleColumnDragOver = useCallback((e: DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (e.dataTransfer.types.includes(DRAG_TYPE)) setDropTargetStageId(stageId);
  }, []);

  const handleColumnDragLeave = useCallback((e: DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) setDropTargetStageId(null);
  }, []);

  const handleColumnDrop = useCallback(
    (e: DragEvent, targetStageId: string) => {
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
    },
    [moveTo]
  );

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
        .hide-scrollbar::-webkit-scrollbar-thumb { background-color: var(--wp-scrollbar-thumb); border-radius: 10px; }
        .hide-scrollbar::-webkit-scrollbar-thumb:hover { background-color: var(--wp-scrollbar-thumb-hover); }
      `}</style>

      <ConfirmDeleteModal
        open={deleteConfirmId !== null}
        title="Opravdu smazat tuto příležitost?"
        onConfirm={() => deleteConfirmId && doDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        loading={deletePending}
      />

      <div className="font-pipeline-sans flex min-h-0 flex-1 flex-col text-[color:var(--wp-text)]">
        {/* Local header (v2): obchodní nástěnka, metadata, filtry */}
        {showLocalHeader && (
          <div className="z-10 flex flex-shrink-0 flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-0 py-4 sm:gap-4">
            <div>
              <h1 className="font-pipeline-display mb-1 text-2xl font-black leading-tight text-[color:var(--wp-text)]">Obchodní nástěnka</h1>
              <p className="text-xs font-medium text-[color:var(--wp-text-tertiary)] sm:text-sm">Přehled případů podle fáze jednání</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-medium text-[color:var(--wp-text-secondary)]">
                <span>Potenciál: <strong className="font-bold text-[color:var(--wp-text)]">{new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(totalPotential)}</strong></span>
                <span className="hidden text-[color:var(--wp-border-strong)] sm:inline">|</span>
                <span className="flex items-center gap-1 font-bold text-rose-500 dark:text-rose-400"><AlertCircle size={14} /> 2 úkoly k řešení</span>
              </div>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFilterPopoverOpen((o) => !o)}
                className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-4 py-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] shadow-sm transition-all hover:bg-[color:var(--wp-surface-raised)]"
              >
                <Filter size={16} /> Všechny filtry
              </button>
              {filterPopoverOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterPopoverOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full z-20 mt-2 min-w-[180px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 shadow-lg">
                    <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Typ případu</p>
                    {[{ v: "all", l: "Vše" }, ...CASE_TYPES.map((t) => ({ v: t.value, l: t.label }))].map((f) => (
                      <button
                        key={f.v}
                        type="button"
                        onClick={() => { setFilterType(f.v); setFilterPopoverOpen(false); }}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-bold transition-all ${filterType === f.v ? "bg-[color:var(--wp-nav-active-bg)] text-[color:var(--wp-nav-active-text)]" : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"}`}
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

        {/* Toolbar: hledání, AI asistent, nový obchod */}
        <div className="flex flex-shrink-0 flex-col items-stretch justify-between gap-3 py-3 sm:flex-row sm:items-center">
          <div className="group relative w-full max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <Search size={16} className="text-[color:var(--wp-text-tertiary)] transition-colors group-focus-within:text-indigo-500" />
            </div>
            <input
              type="text"
              placeholder="Rychlé hledání obchodu (jméno, telefon)..."
              value={pipelineSearch}
              onChange={(e) => setPipelineSearch(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] py-2.5 pl-11 pr-4 text-sm font-bold text-[color:var(--wp-input-text)] outline-none transition-all placeholder:font-medium placeholder:text-[color:var(--wp-text-tertiary)] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
            />
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (aiAssistant) {
                  aiAssistant.setOpen(true);
                } else {
                  toast.showToast("AI asistent je v portálu vpravo dole (ikona Ai).");
                }
              }}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-2 py-1.5 pr-3 text-sm font-semibold text-[color:var(--wp-text)] shadow-sm transition-colors hover:bg-[color:var(--wp-surface-muted)]"
              title="Otevře boční panel AI asistenta (dotazy k CRM, klientům, úkolům…)"
              aria-label="Otevřít AI asistenta"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--wp-surface-card-border)] bg-white dark:bg-white">
                <AiAssistantBrandIcon size={20} variant="colorOnWhite" className="max-h-full max-w-full" />
              </span>
              <span className="hidden sm:inline">AI asistent</span>
            </button>
            <CreateActionButton type="button" onClick={() => setCreateStageId(localStages[0]?.id ?? null)} icon={Plus}>
              Nový obchod
            </CreateActionButton>
          </div>
        </div>

        {/* Grid 3x2 (v2) */}
        <main className="flex-1 overflow-y-auto hide-scrollbar min-h-0">
          <div className="w-full h-full pb-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
              {filteredStages.map((stage, stageIdx) => {
                const theme = COLUMN_THEMES[stageIdx % COLUMN_THEMES.length];
                const isDropTarget = dropTargetStageId === stage.id;
                const subtitle = STAGE_SUBTITLES[stageIdx];
                const stageNameWithoutNumber = stage.name.includes(". ") ? stage.name.split(". ")[1] : stage.name;

                return (
                  <div
                    key={stage.id}
                    className={`flex h-[480px] flex-col overflow-hidden rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 transition-all duration-300 dark:bg-[color:var(--wp-surface-inset)]/60 ${isDropTarget ? "border-indigo-400 shadow-md ring-4 ring-indigo-500/25 dark:ring-indigo-500/20" : "shadow-sm hover:border-[color:var(--wp-border-strong)]"}`}
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
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-secondary)] opacity-95 dark:text-[color:var(--wp-text)] dark:opacity-90">
                            {subtitle ?? ""}
                          </p>
                        </div>
                      </div>
                      <div className={`rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/90 px-3 py-1 text-[13px] font-black shadow-sm dark:bg-[color:var(--wp-surface-inset)]/90 dark:text-[color:var(--wp-text)] ${theme.textColor}`}>
                        {stage.opportunities.length}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto hide-scrollbar p-4 flex flex-col gap-4">
                      {stage.opportunities.length === 0 ? (
                        <div className="m-2 flex min-h-[120px] flex-1 flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/40 p-6 text-[color:var(--wp-text-tertiary)]">
                          <CheckCircle2 size={32} className="mb-2 opacity-60" />
                          <p className="text-center text-xs font-bold uppercase tracking-widest">Žádné obchody</p>
                        </div>
                      ) : (
                        stage.opportunities.map((opp) => {
                          const isDragging = draggedOppId === opp.id;
                          const isMenuOpen = openMenuOppId === opp.id;
                          return (
                            <PipelineOpportunityCard
                              key={opp.id}
                              opp={opp}
                              stageId={stage.id}
                              themeAccent={theme.accent}
                              isDragging={isDragging}
                              isMenuOpen={isMenuOpen}
                              onDragStart={handleCardDragStart}
                              onDragEnd={handleCardDragEnd}
                              onNavigateDetail={navigateToPipelineDetail}
                              onRequestEdit={requestEditOpp}
                              onToggleMenu={toggleOppMenu}
                              onCloseMenu={closeOppMenu}
                              onMenuEdit={menuEditOpp}
                              onMenuDelete={menuRequestDelete}
                            />
                          );
                        })
                      )}

                      <button
                        type="button"
                        onClick={() => setCreateStageId(stage.id)}
                        className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[16px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] py-3 text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)] shadow-sm transition-all hover:border-indigo-400/50 hover:text-indigo-600 hover:shadow-md active:scale-[0.98] dark:hover:text-indigo-400"
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
            key={createStageId}
            stageId={createStageId}
            stages={localStages}
            contacts={contacts}
            onDone={() => setCreateStageId(null)}
            defaultContactId={contactContext?.contactId}
            hideContactSelector={!!contactContext}
            onMutationComplete={afterMutation}
          />
        )}
      </Modal>

      <Modal open={editOpp !== null} onClose={() => setEditOpp(null)} title="Upravit příležitost">
        {editOpp && (
          <EditForm
            key={editOpp.id}
            opp={editOpp}
            stages={localStages}
            contacts={contacts}
            onDone={() => setEditOpp(null)}
            onMutationComplete={afterMutation}
          />
        )}
      </Modal>
    </>
  );
}
