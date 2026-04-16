"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getTasksList,
  getTasksCounts,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  reopenTask,
  moveTaskToNotesBoard,
  type TaskRow,
  type TaskCounts,
} from "@/app/actions/tasks";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { getOpenOpportunitiesForSelect } from "@/app/actions/pipeline";
import { ContactSearchInput } from "@/app/components/ContactSearchInput";
import { SkeletonLine } from "@/app/components/Skeleton";
import { SwipeTaskItem } from "@/app/components/SwipeTaskItem";
import { CustomDropdown as CustomDropdownUI } from "@/app/components/ui/CustomDropdown";
import clsx from "clsx";
import { CreateActionButton, portalPrimaryButtonClassName } from "@/app/components/ui/CreateActionButton";
import { useConfirm } from "@/app/components/ConfirmDialog";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Circle,
  Calendar,
  User,
  AlertCircle,
  Phone,
  Mail,
  MoreVertical,
  Sparkles,
  Plus,
  Search,
  CheckSquare,
  Settings2,
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  Check,
  Flag,
  Bell,
  X,
  Briefcase,
  ChevronDown,
  LayoutDashboard,
  FileText,
} from "lucide-react";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import { defaultTaskDueDateYmd, isDueDateBeforeLocalToday, localCalendarTodayYmd } from "@/lib/date/date-only";

type Filter = "all" | "today" | "week" | "overdue" | "completed";

const FILTERS: { key: Filter; label: string; shortLabel: string; alert?: boolean }[] = [
  { key: "all", label: "Vše", shortLabel: "Vše" },
  { key: "today", label: "Dnes", shortLabel: "Dnes" },
  { key: "week", label: "Tento týden", shortLabel: "Týden" },
  { key: "overdue", label: "Po termínu", shortLabel: "Po termínu", alert: true },
  { key: "completed", label: "Dokončené", shortLabel: "Hotovo" },
];

const REMINDER_OPTIONS = [
  { id: "none", label: "Bez připomenutí" },
  { id: "5m", label: "5 minut předem" },
  { id: "15m", label: "15 minut předem" },
  { id: "30m", label: "30 minut předem" },
  { id: "1h", label: "1 hodinu předem" },
  { id: "1d", label: "1 den předem" },
];

const SETTINGS_KEY = "portal-tasks-settings";
type TaskSettings = { hideCompleted: boolean; defaultTab: string; defaultPriority: string };

function loadSettings(): TaskSettings {
  if (typeof window === "undefined") return { hideCompleted: false, defaultTab: "all", defaultPriority: "normal" };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { hideCompleted: false, defaultTab: "all", defaultPriority: "normal" };
    return JSON.parse(raw);
  } catch {
    return { hideCompleted: false, defaultTab: "all", defaultPriority: "normal" };
  }
}

function saveSettings(s: TaskSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

function formatDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = date.getTime() - today.getTime();
  const dayMs = 86400000;
  if (diff >= 0 && diff < dayMs) return "Dnes";
  if (diff >= dayMs && diff < 2 * dayMs) return "Zítra";
  if (diff >= -dayMs && diff < 0) return "Včera";
  return formatDisplayDateCs(d) || "—";
}

function isOverdue(dueDate: string | null, completedAt: Date | null) {
  if (!dueDate || completedAt) return false;
  return isDueDateBeforeLocalToday(dueDate);
}

/* ==========================================
   PORTAL DROPDOWN (React Portal) — 1:1 spec
   ========================================== */
type DropdownOption = { id: string; label: string };

function CustomDropdown({
  value,
  onChange,
  options,
  placeholder,
  icon: Icon,
  direction = "down",
  variant = "input",
}: {
  value: string;
  onChange: (id: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  icon?: LucideIcon;
  direction?: "up" | "down";
  variant?: "input" | "compact";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const selected = options.find((o) => o.id === value);
  const isPlaceholder = !selected || selected.id === "none";
  const isInput = variant === "input";

  const buttonClasses = isInput
    ? `w-full px-4 py-3.5 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] hover:border-emerald-300 rounded-xl text-sm font-bold transition-all focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 flex items-center justify-between ${isPlaceholder ? "text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text)]"}`
    : `flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-700 transition-all shadow-sm active:scale-95`;

  const toggleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const pickerHeight = Math.min(options.length * 44 + 16, 240);
      const spaceBelow = window.innerHeight - rect.bottom;
      const styles: React.CSSProperties = { left: rect.left, width: isInput ? rect.width : 224 };
      if (direction === "up" || (spaceBelow < pickerHeight && rect.top > pickerHeight)) {
        styles.bottom = window.innerHeight - rect.top + 8;
      } else {
        styles.top = rect.bottom + 8;
      }
      setDropdownStyles(styles);
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <button ref={buttonRef} type="button" onClick={toggleOpen} className={buttonClasses}>
        {isInput ? (
          <div className="flex items-center gap-3 truncate">
            {Icon && <Icon size={18} className={isPlaceholder ? "text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text-secondary)]"} />}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </div>
        ) : (
          <>
            {Icon && <Icon size={14} className={!isPlaceholder ? "fill-indigo-200" : ""} />}
            {selected ? selected.label : placeholder}
          </>
        )}
        <ChevronDown size={isInput ? 16 : 14} className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${isInput ? "text-[color:var(--wp-text-tertiary)]" : ""}`} />
      </button>

      {isOpen && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} onWheel={() => setIsOpen(false)} onTouchMove={() => setIsOpen(false)} />
          <div
            className="fixed bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-2xl shadow-xl shadow-indigo-900/10 py-2 z-[9999] animate-in fade-in duration-200 max-h-60 overflow-y-auto custom-scrollbar"
            style={dropdownStyles}
          >
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setIsOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[color:var(--wp-surface-muted)]
                  ${value === opt.id ? "text-emerald-600 bg-emerald-50/50" : "text-[color:var(--wp-text-secondary)]"}
                `}
              >
                <span className="truncate pr-4">{opt.label}</span>
                {value === opt.id && <Check size={16} strokeWidth={3} className="shrink-0" />}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

/* ==========================================
   CUSTOM DATE PICKER (React Portal) — 1:1 spec
   ========================================== */
function CustomDatePicker({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>({});

  useEffect(() => setMounted(true), []);

  const toggleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const pickerHeight = 350;
      const spaceBelow = window.innerHeight - rect.bottom;
      const styles: React.CSSProperties = { left: rect.left };
      if (spaceBelow < pickerHeight && rect.top > pickerHeight) {
        styles.bottom = window.innerHeight - rect.top + 8;
      } else {
        styles.top = rect.bottom + 8;
      }
      setDropdownStyles(styles);
    }
    setIsOpen(!isOpen);
  };

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return placeholder || "dd.mm.rrrr";
    const d = new Date(dateString);
    return d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: startOffset }, (_, i) => i);
  const monthsCZ = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
  const weekDaysCZ = ["po", "út", "st", "čt", "pá", "so", "ne"];

  const todayDate = new Date();
  const todayStr = todayDate.toISOString().slice(0, 10);

  const handlePrevMonth = (e: React.MouseEvent) => { e.stopPropagation(); setViewDate(new Date(year, month - 1, 1)); };
  const handleNextMonth = (e: React.MouseEvent) => { e.stopPropagation(); setViewDate(new Date(year, month + 1, 1)); };

  const handleSelectDate = (d: number) => {
    const selected = new Date(Date.UTC(year, month, d));
    onChange(selected.toISOString().split("T")[0]);
    setIsOpen(false);
  };

  const setToday = () => {
    onChange(todayStr);
    setViewDate(todayDate);
    setIsOpen(false);
  };

  const clearDate = () => {
    onChange("");
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="w-full pl-11 pr-4 py-3.5 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] hover:border-emerald-300 rounded-xl text-sm font-bold transition-all focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 flex items-center justify-between text-left text-[color:var(--wp-text)]"
      >
        <span className={!value ? "text-[color:var(--wp-text-tertiary)] font-medium" : ""}>{formatDisplayDate(value)}</span>
      </button>

      {isOpen && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} onWheel={() => setIsOpen(false)} onTouchMove={() => setIsOpen(false)} />
          <div
            className="fixed w-72 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-2xl shadow-xl shadow-indigo-900/10 p-5 z-[9999] animate-in fade-in zoom-in-95 duration-200"
            style={dropdownStyles}
          >
            <div className="flex justify-between items-center mb-5">
              <span className="font-black text-[color:var(--wp-text)] text-sm capitalize">{monthsCZ[month]} {year}</span>
              <div className="flex gap-1">
                <button type="button" onClick={handlePrevMonth} className="p-1.5 rounded-md text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] transition-colors"><ChevronLeft size={16} /></button>
                <button type="button" onClick={handleNextMonth} className="p-1.5 rounded-md text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] transition-colors"><ChevronRight size={16} /></button>
              </div>
            </div>

            <div className="grid grid-cols-7 mb-3">
              {weekDaysCZ.map((day) => (
                <div key={day} className="text-center text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-2 gap-x-1 mb-4">
              {blanks.map((b) => <div key={`b-${b}`} className="h-8" />)}
              {days.map((d) => {
                const dateStr = new Date(Date.UTC(year, month, d)).toISOString().split("T")[0];
                const isSelected = value === dateStr;
                const isDayToday = dateStr === todayStr;

                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleSelectDate(d)}
                    className={`h-8 w-8 mx-auto flex items-center justify-center rounded-full text-xs font-bold transition-all
                      ${isSelected ? "bg-emerald-500 text-white shadow-md" : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"}
                      ${isDayToday && !isSelected ? "ring-2 ring-inset ring-emerald-500 text-emerald-600 bg-emerald-50" : ""}
                    `}
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[color:var(--wp-surface-card-border)]">
              <button type="button" onClick={clearDate} className="text-xs font-bold text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] transition-colors px-2 py-1">Vymazat</button>
              <button type="button" onClick={setToday} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg">Dnes</button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

/* ==========================================
   SETTINGS MODAL — 1:1 spec
   ========================================== */
function TaskSettingsModal({ settings, onSave, onClose }: { settings: TaskSettings; onSave: (s: TaskSettings) => void; onClose: () => void }) {
  const [hideCompleted, setHideCompleted] = useState(settings.hideCompleted);
  const [defaultTab, setDefaultTab] = useState(settings.defaultTab);
  const [defaultPriority, setDefaultPriority] = useState(settings.defaultPriority);

  const handleSave = () => {
    onSave({ hideCompleted, defaultTab, defaultPriority });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm p-4 sm:p-6 modal-overlay">
      <div className="bg-[color:var(--wp-surface-card)] rounded-[32px] shadow-2xl w-full max-w-[500px] flex flex-col overflow-hidden border border-[color:var(--wp-surface-card-border)] modal-content">

        <div className="px-8 py-6 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-surface-muted)]/80 rounded-t-[32px]">
          <h2 className="text-xl font-black text-[color:var(--wp-text)] tracking-tight flex items-center gap-3">
            <Settings2 className="text-[color:var(--wp-text-secondary)]" /> Nastavení úkolů
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] flex items-center justify-center text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors shadow-sm">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] border-b border-[color:var(--wp-surface-card-border)] pb-2">Zobrazení a třídění</h3>

            <label className="flex items-center justify-between cursor-pointer group p-4 border border-[color:var(--wp-surface-card-border)] rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-[color:var(--wp-text)] mb-0.5">Skrýt dokončené úkoly</div>
                <div className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Automaticky přesune splněné úkoly do historie.</div>
              </div>
              <div className="relative inline-flex items-center ml-4 shrink-0">
                <input type="checkbox" className="sr-only peer" checked={hideCompleted} onChange={() => setHideCompleted(!hideCompleted)} />
                <div className="w-11 h-6 bg-[color:var(--wp-surface-card-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-[color:var(--wp-surface-card)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[color:var(--wp-surface-card)] after:border-[color:var(--wp-border-strong)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-aidv-create" />
              </div>
            </label>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 ml-1">Výchozí pohled</label>
              <CustomDropdownUI
                value={defaultTab}
                onChange={setDefaultTab}
                options={[
                  { id: "all", label: "Všechny úkoly" },
                  { id: "today", label: "Dnešní úkoly" },
                  { id: "week", label: "Tento týden" },
                ]}
                placeholder="Výchozí pohled"
                icon={LayoutDashboard}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] border-b border-[color:var(--wp-surface-card-border)] pb-2">Nové úkoly</h3>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2 ml-1">Výchozí priorita</label>
              <div className="flex bg-[color:var(--wp-surface-muted)] p-1.5 rounded-xl border border-[color:var(--wp-surface-card-border)]">
                <button onClick={() => setDefaultPriority("low")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${defaultPriority === "low" ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm border border-[color:var(--wp-surface-card-border)]" : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)]"}`}>Nízká</button>
                <button onClick={() => setDefaultPriority("normal")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${defaultPriority === "normal" ? "bg-[color:var(--wp-surface-card)] text-indigo-700 shadow-sm border border-[color:var(--wp-surface-card-border)]" : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)]"}`}>Běžná</button>
                <button onClick={() => setDefaultPriority("high")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${defaultPriority === "high" ? "bg-[color:var(--wp-surface-card)] text-rose-600 shadow-sm border border-rose-200" : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)]"}`}>
                  <Flag size={14} className={defaultPriority === "high" ? "fill-rose-100" : ""} /> Urgentní
                </button>
              </div>
            </div>
          </div>

        </div>

        <div className="px-8 py-5 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80 flex items-center justify-end gap-4 rounded-b-[32px]">
          <button onClick={onClose} className="px-6 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-sm font-bold hover:bg-[color:var(--wp-surface-muted)] transition-colors shadow-sm">
            Zrušit
          </button>
          <CreateActionButton type="button" onClick={handleSave} icon={Check}>
            Uložit
          </CreateActionButton>
        </div>

      </div>
    </div>
  );
}

/* ==========================================
   NEW TASK WIZARD — 1:1 spec
   ========================================== */
function NewTaskWizard({
  onClose,
  onCreated,
  contacts,
  opportunities,
  initialContactId,
}: {
  onClose: () => void;
  onCreated: () => void;
  contacts: ContactRow[];
  opportunities: Array<{ id: string; title: string }>;
  initialContactId?: string | null;
}) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskData, setTaskData] = useState({
    title: "",
    date: defaultTaskDueDateYmd(),
    priority: "normal",
    reminder: "1h",
    client:
      initialContactId && String(initialContactId).trim() ? String(initialContactId).trim() : "none",
    deal: "none",
    desc: "",
  });

  useEffect(() => {
    const cid = initialContactId?.trim();
    if (!cid || contacts.length === 0) return;
    if (!contacts.some((c) => c.id === cid)) return;
    setTaskData((prev) => (prev.client === "none" ? { ...prev, client: cid } : prev));
  }, [initialContactId, contacts]);

  const isStep1Valid = taskData.title.trim() !== "" && taskData.date !== "";

  const clientOptions: DropdownOption[] = [
    { id: "none", label: "— Bez klienta —" },
    ...contacts.map((c) => ({ id: c.id, label: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || c.id })),
  ];

  const dealOptions: DropdownOption[] = [
    { id: "none", label: "— Žádný obchod —" },
    ...opportunities.map((o) => ({ id: o.id, label: o.title })),
  ];

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const contactId = taskData.client !== "none" ? taskData.client : undefined;
      const dealId = taskData.deal !== "none" ? taskData.deal : undefined;
      const id = await createTask({
        title: taskData.title.trim(),
        description: taskData.desc.trim() || undefined,
        contactId,
        dueDate: taskData.date || undefined,
        opportunityId: dealId,
      });
      if (id) {
        onCreated();
        onClose();
      } else {
        setError("Úkol se nepodařilo vytvořit.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepodařilo se vytvořit úkol.");
    } finally {
      setSubmitting(false);
    }
  };

  const labelClass = "block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1.5 ml-1";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm p-4 sm:p-6 modal-overlay">
      <div className="bg-[color:var(--wp-surface-card)] rounded-[32px] shadow-2xl w-full max-w-[500px] flex flex-col border border-[color:var(--wp-surface-card-border)] min-h-[500px] modal-content">

        <div className="px-8 pt-6 pb-0 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] relative z-10 rounded-t-[32px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-[color:var(--wp-text)] tracking-tight flex items-center gap-2">
              <CheckSquare className="text-emerald-500" /> Nový úkol
            </h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] flex items-center justify-center text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors shadow-sm">
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center justify-between pb-4 relative">
            <div className="absolute left-0 top-3 w-full h-1 bg-[color:var(--wp-surface-muted)] rounded-full -z-10" />
            <div className="absolute left-0 top-3 h-1 bg-emerald-500 rounded-full -z-10 transition-all duration-500" style={{ width: step === 1 ? "0%" : step === 2 ? "50%" : "100%" }} />

            {[
              { id: 1, label: "Základ" },
              { id: 2, label: "Kontext" },
              { id: 3, label: "Detaily" },
            ].map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-2 bg-[color:var(--wp-surface-card)] px-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border-2 transition-colors duration-300
                  ${step === s.id ? "border-emerald-500 bg-emerald-50 text-emerald-600 shadow-sm" :
                    step > s.id ? "border-emerald-500 bg-emerald-500 text-white" :
                    "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)]"}
                `}>
                  {step > s.id ? <Check size={12} strokeWidth={4} /> : s.id}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest ${step >= s.id ? "text-[color:var(--wp-text)]" : "text-[color:var(--wp-text-tertiary)]"}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 flex-1 flex flex-col justify-center overflow-y-auto custom-scrollbar">
          {error && <p className="text-sm font-medium text-rose-600 mb-4">{error}</p>}

          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <label className={labelClass}>Název úkolu *</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Např. Urgovat výpisy z účtu"
                  value={taskData.title}
                  onChange={(e) => setTaskData({ ...taskData, title: e.target.value })}
                  className="w-full px-4 py-4 bg-[color:var(--wp-surface-card)] border-2 border-[color:var(--wp-surface-card-border)] rounded-2xl text-lg font-black outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 transition-all text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Termín splnění *</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)] pointer-events-none z-10" />
                    <CustomDatePicker
                      value={taskData.date}
                      onChange={(val) => setTaskData({ ...taskData, date: val })}
                      placeholder="dd.mm.rrrr"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Připomenutí</label>
                  <CustomDropdown
                    value={taskData.reminder}
                    onChange={(val) => setTaskData({ ...taskData, reminder: val })}
                    options={REMINDER_OPTIONS}
                    icon={Bell}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Priorita</label>
                <div className="flex bg-[color:var(--wp-surface-muted)] p-1.5 rounded-xl border border-[color:var(--wp-surface-card-border)]">
                  <button onClick={() => setTaskData({ ...taskData, priority: "low" })} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${taskData.priority === "low" ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm border border-[color:var(--wp-surface-card-border)]" : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)]"}`}>Nízká</button>
                  <button onClick={() => setTaskData({ ...taskData, priority: "normal" })} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${taskData.priority === "normal" ? "bg-[color:var(--wp-surface-card)] text-indigo-700 shadow-sm border border-[color:var(--wp-surface-card-border)]" : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)]"}`}>Běžná</button>
                  <button onClick={() => setTaskData({ ...taskData, priority: "high" })} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${taskData.priority === "high" ? "bg-[color:var(--wp-surface-card)] text-rose-600 shadow-sm border border-rose-200" : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)]"}`}>
                    <Flag size={14} className={taskData.priority === "high" ? "fill-rose-100" : ""} /> Urgentní
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3 mb-4">
                <Sparkles size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-emerald-900/80 leading-relaxed">
                  Propojením úkolu s klientem zajistíte, že se tento úkol zobrazí přímo na jeho klientské kartě.
                </p>
              </div>

              <div>
                <label className={labelClass}>Propojit s klientem (Volitelné)</label>
                <CustomDropdown
                  value={taskData.client}
                  onChange={(val) => setTaskData({ ...taskData, client: val })}
                  options={clientOptions}
                  placeholder="— Bez klienta —"
                  icon={User}
                />
              </div>

              <div>
                <label className={labelClass}>Propojit s obchodem (Volitelné)</label>
                <CustomDropdown
                  value={taskData.deal}
                  onChange={(val) => setTaskData({ ...taskData, deal: val })}
                  options={dealOptions}
                  placeholder="— Žádný obchod —"
                  icon={Briefcase}
                  direction="up"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-300 h-full flex flex-col">
              <div className="flex-1">
                <label className={labelClass}>Detailní popis úkolu</label>
                <textarea
                  rows={6}
                  value={taskData.desc}
                  onChange={(e) => setTaskData({ ...taskData, desc: e.target.value })}
                  placeholder="Přidejte kontext, co je potřeba udělat..."
                  className="w-full p-4 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 transition-all text-[color:var(--wp-text)] resize-none leading-relaxed custom-scrollbar"
                />
              </div>

              <div className="bg-[color:var(--wp-surface-muted)] p-4 rounded-xl border border-[color:var(--wp-surface-card-border)] flex items-center justify-between cursor-pointer hover:border-indigo-200 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black">MD</div>
                  <div>
                    <p className="text-xs font-bold text-[color:var(--wp-text)]">Přiřazeno vám</p>
                    <p className="text-[10px] font-medium text-[color:var(--wp-text-secondary)]">Klikněte pro delegování</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />
              </div>
            </div>
          )}

        </div>

        <div className="px-8 py-5 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80 flex items-center justify-between gap-4 rounded-b-[32px]">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-6 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-sm font-bold hover:bg-[color:var(--wp-surface-muted)] transition-colors shadow-sm flex items-center gap-2"
          >
            {step > 1 ? <><ChevronLeft size={16} /> Zpět</> : "Zrušit"}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !isStep1Valid}
              className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black tracking-wide shadow-md shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Další krok <ChevronRight size={16} />
            </button>
          ) : (
            <CreateActionButton
              type="button"
              onClick={handleCreate}
              isLoading={submitting}
              icon={Check}
            >
              {submitting ? "Vytvářím..." : "Vytvořit úkol"}
            </CreateActionButton>
          )}
        </div>

      </div>
    </div>
  );
}

/* ==========================================
   MORE ACTIONS DROPDOWN
   ========================================== */
const MORE_MENU_MIN_W = 220;
const MORE_MENU_GAP = 4;
/** Odhad výšky menu (3 položky × 44px + rámeček); při nedostatku místa se použije maxHeight + scroll */
const MORE_MENU_APPROX_H = 200;

function MoreActionsMenu({
  onEdit,
  onDelete,
  onMoveToNotes,
  moveToNotesLoading,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onMoveToNotes: () => void;
  moveToNotesLoading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyles, setMenuStyles] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const spaceBelow = vh - rect.bottom - MORE_MENU_GAP;
      const spaceAbove = rect.top - MORE_MENU_GAP;
      const openUpward = spaceBelow < MORE_MENU_APPROX_H && spaceAbove > spaceBelow;

      const left = Math.min(Math.max(MORE_MENU_GAP, rect.right - MORE_MENU_MIN_W), vw - MORE_MENU_MIN_W - MORE_MENU_GAP);

      if (openUpward) {
        const maxH = Math.max(120, spaceAbove - MORE_MENU_GAP);
        setMenuStyles({
          left,
          top: "auto",
          bottom: vh - rect.top + MORE_MENU_GAP,
          maxHeight: maxH,
          overflowY: "auto",
        });
      } else {
        const maxH = Math.max(120, spaceBelow - MORE_MENU_GAP);
        setMenuStyles({
          left,
          top: rect.bottom + MORE_MENU_GAP,
          bottom: "auto",
          maxHeight: maxH,
          overflowY: "auto",
        });
      }
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2.5 text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] rounded-xl transition-all"
        aria-label="Více možností"
        aria-expanded={isOpen}
      >
        <MoreVertical size={16} />
      </button>
      {isOpen && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed min-w-[13.5rem] max-w-[min(100vw-1rem,16rem)] bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl shadow-xl py-1 z-[9999] custom-scrollbar"
            style={menuStyles}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onEdit();
                setIsOpen(false);
              }}
              className="w-full min-h-[44px] px-4 py-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] text-left transition-colors"
            >
              Upravit
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={moveToNotesLoading}
              onClick={() => {
                onMoveToNotes();
                setIsOpen(false);
              }}
              className="w-full min-h-[44px] px-4 py-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] text-left transition-colors flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              <FileText size={16} className="shrink-0 text-amber-600" aria-hidden />
              {moveToNotesLoading ? "Ukládám…" : "Na board Zápisků"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDelete();
                setIsOpen(false);
              }}
              className="w-full min-h-[44px] px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 text-left transition-colors"
            >
              Smazat
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

/* ==========================================
   MAIN PAGE — 1:1 spec layout
   ========================================== */
function TasksPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const initialSettings = loadSettings();

  const initialFilter = (() => {
    const f = searchParams.get("filter");
    if (f && FILTERS.some((x) => x.key === f)) return f as Filter;
    if (FILTERS.some((x) => x.key === initialSettings.defaultTab)) return initialSettings.defaultTab as Filter;
    return "all";
  })();

  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [searchQuery, setSearchQuery] = useState("");
  const [settings, setSettings] = useState<TaskSettings>(initialSettings);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [mobileEditId, setMobileEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", contactId: "", dueDate: "" });
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [moveToNotesError, setMoveToNotesError] = useState<string | null>(null);

  useEffect(() => {
    const contactId = searchParams.get("contactId");
    if (contactId) setIsWizardOpen(true);
    const filterParam = searchParams.get("filter");
    if (filterParam && FILTERS.some((f) => f.key === filterParam)) setFilter(filterParam as Filter);
  }, [searchParams]);

  const { data: taskBoard, isPending: loading, isError: loadError } = useQuery({
    queryKey: queryKeys.tasks.board(filter),
    queryFn: async () => {
      const [rows, c] = await Promise.all([getTasksList(filter), getTasksCounts()]);
      return { rows, counts: c };
    },
  });
  const tasks = taskBoard?.rows ?? [];
  const counts = taskBoard?.counts ?? { all: 0, today: 0, week: 0, overdue: 0, completed: 0 };

  const { data: contacts = [] } = useQuery({
    queryKey: queryKeys.contacts.list(),
    queryFn: getContactsList,
    staleTime: 120_000,
  });

  const { data: opportunityOptions = [] } = useQuery({
    queryKey: queryKeys.pipeline.openForSelect,
    queryFn: getOpenOpportunitiesForSelect,
    staleTime: 120_000,
  });

  const invalidateTasks = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }), [queryClient]);

  const filteredBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q) || t.contactName?.toLowerCase().includes(q));
  }, [tasks, searchQuery]);

  function handleFilterChange(f: Filter) {
    setFilter(f);
    setEditId(null);
  }

  async function handleToggle(task: TaskRow) {
    if (task.completedAt) await reopenTask(task.id);
    else await completeTask(task.id);
    await invalidateTasks();
  }

  async function handleQuickAdd() {
    if (!newTaskTitle.trim()) return;
    setQuickAddSubmitting(true);
    try {
      await createTask({ title: newTaskTitle.trim() });
      setNewTaskTitle("");
      setIsInputFocused(false);
      await invalidateTasks();
    } finally {
      setQuickAddSubmitting(false);
    }
  }

  function handleSettingsSave(s: TaskSettings) {
    setSettings(s);
    saveSettings(s);
    if (FILTERS.some((f) => f.key === s.defaultTab) && s.defaultTab !== filter) {
      handleFilterChange(s.defaultTab as Filter);
    }
  }

  function startEdit(task: TaskRow) {
    setEditId(task.id);
    setEditForm({ title: task.title, description: task.description ?? "", contactId: task.contactId ?? "", dueDate: task.dueDate ?? "" });
  }

  async function handleSaveEdit() {
    if (!editId) return;
    await updateTask(editId, { title: editForm.title, description: editForm.description, contactId: editForm.contactId, dueDate: editForm.dueDate });
    setEditId(null);
    setMobileEditId(null);
    await invalidateTasks();
    await queryClient.refetchQueries({ queryKey: queryKeys.tasks.all });
  }

  async function handleDelete(id: string) {
    if (
      !(await confirm({
        title: "Smazat úkol",
        message: "Opravdu chcete smazat tento úkol?",
        confirmLabel: "Smazat",
        variant: "destructive",
      }))
    ) {
      return;
    }
    await deleteTask(id);
    await invalidateTasks();
  }

  async function handleMoveToNotes(taskId: string) {
    setMoveToNotesError(null);
    if (
      !(await confirm({
        title: "Přesunout do zápisků",
        message:
          "Úkol bude odebrán ze seznamu Úkolů a uložen jako interní zápisek na board Zápisky (pouze pro práci poradce v CRM). Pokračovat?",
        confirmLabel: "Přesunout",
      }))
    ) {
      return;
    }
    setMovingTaskId(taskId);
    try {
      const { noteId } = await moveTaskToNotesBoard(taskId);
      setEditId(null);
      setMobileEditId(null);
      router.push(`/portal/notes?noteId=${encodeURIComponent(noteId)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Akci se nepodařilo dokončit.";
      setMoveToNotesError(msg);
    } finally {
      setMovingTaskId(null);
    }
  }

  async function handleMoveToToday(id: string) {
    await updateTask(id, { dueDate: localCalendarTodayYmd() });
    await invalidateTasks();
  }

  function openMobileEdit(task: TaskRow) {
    startEdit(task);
    setMobileEditId(task.id);
  }

  const activeTasksCount = filteredBySearch.filter((t) => !t.completedAt).length;
  const completedTasksCount = filteredBySearch.filter((t) => !!t.completedAt).length;
  const totalInView = filteredBySearch.length;
  const progressPercent = totalInView > 0 ? Math.round((completedTasksCount / totalInView) * 100) : 0;

  const overdueTask = tasks.find((t) => !t.completedAt && t.dueDate && isDueDateBeforeLocalToday(t.dueDate));

  const visibleTasks = useMemo(() => {
    if (settings.hideCompleted && filter !== "completed") {
      return filteredBySearch.filter((t) => !t.completedAt);
    }
    return filteredBySearch;
  }, [filteredBySearch, settings.hideCompleted, filter]);

  return (
    <div className="min-h-screen bg-[color:var(--wp-bg)] pb-20 font-sans text-[color:var(--wp-text)]">
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 10px; }

        .modal-overlay { animation: fadeIn 0.2s ease-out forwards; }
        .modal-content { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <main className="max-w-[1400px] mx-auto p-6 md:p-8 grid grid-cols-1 xl:grid-cols-12 gap-8">

        {/* --- LEFT PANEL --- */}
        <div className="xl:col-span-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <h1 className="text-3xl font-black tracking-tight text-[color:var(--wp-text)] [font-family:var(--font-jakarta),var(--font-primary),system-ui,sans-serif]">
              Moje úkoly
            </h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-[color:var(--wp-surface-muted)] transition-all active:scale-95"
              >
                <Settings2 size={16} /> Nastavení
              </button>
              <CreateActionButton type="button" onClick={() => setIsWizardOpen(true)}>
                Nový úkol
              </CreateActionButton>
            </div>
          </div>

          {/* Quick add */}
          <div className={`bg-[color:var(--wp-surface-card)] rounded-[24px] border transition-all duration-300 overflow-hidden shadow-sm ${isInputFocused ? "border-indigo-400 ring-4 ring-indigo-50 shadow-md" : "border-[color:var(--wp-surface-card-border)] hover:border-indigo-300"}`}>
            <div className="p-1 flex flex-col md:flex-row items-center gap-2">
              <div className="flex-1 flex items-start w-full relative">
                <div className="p-4 text-[color:var(--wp-text-tertiary)] shrink-0"><Plus size={20} className={isInputFocused ? "text-indigo-500" : ""} /></div>
                <textarea
                  rows={isInputFocused ? 2 : 1}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => { if (!newTaskTitle) setIsInputFocused(false); }}
                  placeholder="Rychlý úkol: Co potřebujete udělat?..."
                  className="w-full py-4 pr-4 bg-transparent text-[color:var(--wp-text)] font-semibold placeholder:font-medium placeholder:text-[color:var(--wp-text-tertiary)] outline-none text-sm resize-none transition-all"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleQuickAdd(); } }}
                />
              </div>

              {isInputFocused && (
                <div className="flex flex-wrap items-center gap-2 px-4 pb-4 md:pb-0 w-full md:w-auto animate-in fade-in duration-200">
                  <button disabled={quickAddSubmitting} onMouseDown={(e) => { e.preventDefault(); handleQuickAdd(); }} className={clsx(portalPrimaryButtonClassName, "flex items-center justify-center px-5 py-2.5 text-sm font-black w-full md:w-auto shrink-0 mt-2 md:mt-0 disabled:opacity-50")}>
                    {quickAddSubmitting ? "..." : "Vytvořit rychle"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search (inline, matching spec header search style) */}
          {tasks.length > 0 && (
            <div className="relative group hidden lg:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)] group-focus-within:text-indigo-500 transition-colors" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Hledat úkol..." className="pl-9 pr-4 py-2.5 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] hover:border-[color:var(--wp-border-strong)] rounded-xl text-sm font-medium outline-none focus:bg-[color:var(--wp-surface-card)] focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all w-full" />
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-[color:var(--wp-surface-card-border)] pt-2 overflow-x-auto hide-scrollbar">
            {FILTERS.map((tab) => {
              const count = counts[tab.key as keyof TaskCounts] ?? 0;
              return (
                <button key={tab.key} onClick={() => handleFilterChange(tab.key)} className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-[3px] transition-all whitespace-nowrap ${filter === tab.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"} ${tab.alert && filter !== tab.key ? "text-rose-500" : ""}`}>
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${filter === tab.key ? "bg-indigo-100 text-indigo-700" : tab.alert ? "bg-rose-100 text-rose-600" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Error */}
          {loadError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3" role="alert">
              <p className="text-sm font-medium text-amber-800">Nepodařilo se načíst úkoly.</p>
              <button type="button" onClick={() => invalidateTasks()} className="shrink-0 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-sm font-semibold rounded-lg transition-colors">Zkusit znovu</button>
            </div>
          )}

          {moveToNotesError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" role="alert">
              <p className="text-sm font-medium text-rose-800">{moveToNotesError}</p>
              <button
                type="button"
                onClick={() => setMoveToNotesError(null)}
                className="shrink-0 min-h-[44px] px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-900 text-sm font-semibold rounded-lg transition-colors"
              >
                Zavřít
              </button>
            </div>
          )}

          {/* Task list */}
          <div className="space-y-3 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-[color:var(--wp-surface-card)] p-4 sm:p-5 rounded-[20px] border border-[color:var(--wp-surface-card-border)] flex items-center gap-4">
                    <SkeletonLine className="h-6 w-6 rounded-full" />
                    <div className="flex-1"><SkeletonLine className="h-4 w-3/4 mb-2" /><SkeletonLine className="h-3 w-1/2" /></div>
                  </div>
                ))}
              </div>
            ) : visibleTasks.length === 0 ? (
              <div className="bg-[color:var(--wp-surface-card)] rounded-[24px] border border-[color:var(--wp-surface-card-border)] border-dashed p-16 flex flex-col items-center justify-center text-center shadow-sm">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-400 mb-6 shadow-inner">
                  <CheckCircle2 size={40} strokeWidth={1.5} />
                </div>
                <h3 className="mb-2 text-xl font-bold text-[color:var(--wp-text)] [font-family:var(--font-jakarta),var(--font-primary),system-ui,sans-serif]">
                  Žádné aktivní úkoly
                </h3>
                <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] max-w-sm mb-8">V tomto výběru máte čistý stůl. Vytvořte si nový úkol pomocí průvodce, nebo si užijte volnou chvíli.</p>
                <button onClick={() => setIsWizardOpen(true)} className="px-6 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2">
                  <Plus size={16} strokeWidth={2.5} /> Přidat první úkol
                </button>
              </div>
            ) : (
              <>
                {/* Mobile: swipe list */}
                <div className="block md:hidden space-y-1">
                  {visibleTasks.map((t) => (
                    <div key={t.id} className="flex items-stretch gap-1">
                      <div className="min-w-0 flex-1">
                        <SwipeTaskItem
                          id={t.id}
                          title={t.title}
                          subtitle={[t.contactName, formatDate(t.dueDate)].filter(Boolean).join(" · ")}
                          onDelete={(id) => {
                            void handleDelete(id);
                          }}
                          onEdit={() => openMobileEdit(t)}
                          leftSlot={
                            <button
                              type="button"
                              onClick={() => handleToggle(t)}
                              className="flex-shrink-0 p-1"
                              aria-label={t.completedAt ? "Označit jako nedokončené" : "Označit jako hotovo"}
                            >
                              {t.completedAt ? (
                                <CheckCircle2 size={24} className="text-emerald-500" />
                              ) : (
                                <Circle size={24} className="text-[color:var(--wp-text-tertiary)]" />
                              )}
                            </button>
                          }
                        />
                      </div>
                      <div className="flex shrink-0 items-center self-center border-l border-[color:var(--wp-surface-card-border)] pl-1">
                        <MoreActionsMenu
                          onEdit={() => openMobileEdit(t)}
                          onDelete={() => handleDelete(t.id)}
                          onMoveToNotes={() => handleMoveToNotes(t.id)}
                          moveToNotesLoading={movingTaskId === t.id}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: rich cards — 1:1 spec */}
                <div className="hidden md:block space-y-3">
                  {visibleTasks.map((task) => {
                    const isCompleted = !!task.completedAt;
                    const overdue = isOverdue(task.dueDate, task.completedAt);

                    if (editId === task.id) {
                      return (
                        <div key={task.id} className="bg-[color:var(--wp-surface-card)] p-5 rounded-[20px] border border-[color:var(--wp-surface-card-border)] shadow-sm space-y-3">
                          <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" placeholder="Název úkolu" />
                          <div className="flex flex-wrap gap-3">
                            <div className="flex-1 min-w-[180px]">
                              <ContactSearchInput value={editForm.contactId} contacts={contacts} onChange={(cid) => setEditForm({ ...editForm, contactId: cid })} placeholder="Vyhledat klienta…" className="min-h-[40px]" />
                            </div>
                            <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                              className="px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium min-w-[160px] outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={handleSaveEdit} className={clsx(portalPrimaryButtonClassName, "px-5 py-2.5")}>Uložit</button>
                            <button type="button" onClick={() => setEditId(null)} className="px-5 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-sm font-bold hover:bg-[color:var(--wp-surface-muted)]">Zrušit</button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={task.id} className={`group bg-[color:var(--wp-surface-card)] p-4 sm:p-5 rounded-[20px] border transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${isCompleted ? "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 opacity-60 hover:opacity-100" : "border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-md hover:border-indigo-200"}`}>
                        <button onClick={() => handleToggle(task)} className={`mt-1 sm:mt-0 flex-shrink-0 transition-colors transform active:scale-90 ${isCompleted ? "text-emerald-500" : overdue ? "text-rose-400 hover:text-emerald-500" : "text-[color:var(--wp-text-tertiary)] hover:text-emerald-500"}`}>
                          {isCompleted ? <CheckCircle2 size={26} className="fill-emerald-50" /> : <Circle size={26} />}
                        </button>
                        <div className="flex-1 min-w-0 w-full">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {overdue && (
                              <span className="flex items-center gap-1 rounded border border-rose-300/50 bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-rose-800 shadow-none dark:border-rose-400/35 dark:bg-rose-950/55 dark:text-rose-200">
                                <AlertCircle size={10} className="text-rose-600 dark:text-rose-300" /> Po termínu
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]">Úkol</span>
                          </div>
                          <h3 className={`font-bold text-[15px] mb-1.5 transition-all leading-tight ${isCompleted ? "text-[color:var(--wp-text-tertiary)] line-through" : "text-[color:var(--wp-text)] group-hover:text-indigo-600"}`}>{task.title}</h3>
                          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-[color:var(--wp-text-secondary)]">
                            {task.contactId && task.contactName ? (
                              <Link href={`/portal/contacts/${task.contactId}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 hover:text-indigo-600 cursor-pointer transition-colors px-2 py-1 bg-[color:var(--wp-surface-muted)] rounded-md">
                                <User size={12} className="text-[color:var(--wp-text-tertiary)]" /> {task.contactName}
                              </Link>
                            ) : null}
                            <span
                              className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${
                                overdue
                                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                                  : "text-[color:var(--wp-text-secondary)]"
                              }`}
                            >
                              <CalendarDays size={12} className={overdue ? "text-rose-600 dark:text-rose-300" : "text-[color:var(--wp-text-tertiary)]"} />{" "}
                              {formatDate(task.dueDate)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity w-full sm:w-auto border-t sm:border-none border-[color:var(--wp-surface-card-border)] pt-3 sm:pt-0 mt-2 sm:mt-0">
                          {!isCompleted && (
                            <>
                              {task.contactPhone ? (
                                <a href={`tel:${task.contactPhone}`} onClick={(e) => e.stopPropagation()} className="p-2.5 text-[color:var(--wp-text-tertiary)] hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"><Phone size={16} /></a>
                              ) : (
                                <button className="p-2.5 text-[color:var(--wp-text-tertiary)] hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"><Phone size={16} /></button>
                              )}
                              {task.contactEmail ? (
                                <a href={`mailto:${task.contactEmail}`} onClick={(e) => e.stopPropagation()} className="p-2.5 text-[color:var(--wp-text-tertiary)] hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Mail size={16} /></a>
                              ) : (
                                <button className="p-2.5 text-[color:var(--wp-text-tertiary)] hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Mail size={16} /></button>
                              )}
                            </>
                          )}
                          <MoreActionsMenu
                            onEdit={() => startEdit(task)}
                            onDelete={() => handleDelete(task.id)}
                            onMoveToNotes={() => handleMoveToNotes(task.id)}
                            moveToNotesLoading={movingTaskId === task.id}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* --- RIGHT PANEL --- */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-gradient-to-br from-aidv-create to-[#0f172a] rounded-[32px] p-8 text-white shadow-xl shadow-indigo-900/10 relative overflow-hidden border border-white/20">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">V tomto výběru</h3>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/50 bg-white p-1 shadow-sm dark:border-white/70 dark:bg-white">
                  <AiAssistantBrandIcon size={22} variant="colorOnWhite" className="max-h-full max-w-full" />
                </div>
              </div>
              <div className="mb-8">
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-6xl font-black tracking-tighter [font-family:var(--font-jakarta),var(--font-primary),system-ui,sans-serif]">
                    {activeTasksCount}
                  </span>
                </div>
                <span className="text-sm font-bold text-[color:var(--wp-text-tertiary)]">Aktivních úkolů</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-[color:var(--wp-text-tertiary)]">
                  <span>Progres dnešní agendy</span>
                  <span className="text-emerald-400">{progressPercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-black/40 overflow-hidden shadow-inner">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000 ease-out relative" style={{ width: `${progressPercent}%` }}>
                     <div className="absolute top-0 left-0 w-full h-1/2 bg-[color:var(--wp-surface-card)]/20" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[color:var(--wp-surface-card)] rounded-[32px] border border-[color:var(--wp-surface-card-border)] p-6 shadow-sm relative group overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white dark:bg-white">
                <AiAssistantBrandIcon size={22} variant="colorOnWhite" className="max-h-full max-w-full" />
              </div>
              <h3 className="font-black text-sm uppercase tracking-widest text-[color:var(--wp-text)]">AI Priority</h3>
            </div>
            <div className="space-y-4">
              {overdueTask ? (
                <div className="rounded-2xl border border-rose-200/80 bg-rose-50/60 p-4 text-sm dark:border-rose-500/35 dark:bg-rose-950/40">
                  <p className="mb-1 flex items-center gap-2 font-bold text-rose-900 dark:text-rose-100">
                    <AlertCircle size={14} className="shrink-0 text-rose-600 dark:text-rose-300" /> Zpožděné úkoly
                  </p>
                  <p className="mb-3 text-xs font-medium leading-relaxed text-rose-800 dark:text-rose-200/90">
                    &ldquo;{overdueTask.title}&rdquo;{overdueTask.contactName ? ` pro klienta ${overdueTask.contactName}` : ""} mělo proběhnout {formatDate(overdueTask.dueDate)}.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleMoveToToday(overdueTask.id)}
                    className="w-full rounded-lg border border-rose-200 bg-[color:var(--wp-surface-card)] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-rose-700 transition-all hover:bg-rose-100 dark:border-rose-400/40 dark:bg-rose-950/50 dark:text-rose-100 dark:hover:bg-rose-900/60"
                  >
                    Přesunout na dnešek
                  </button>
                </div>
              ) : (
                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50 text-sm">
                  <p className="font-bold text-emerald-900 mb-1 flex items-center gap-2"><Check size={14} className="text-emerald-500" /> Vše v pořádku</p>
                  <p className="text-emerald-700/80 text-xs leading-relaxed font-medium">Nemáte žádné zpožděné úkoly. Skvělá práce!</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* Wizard */}
      {isWizardOpen && (
        <NewTaskWizard
          onClose={() => setIsWizardOpen(false)}
          onCreated={() => invalidateTasks()}
          contacts={contacts}
          opportunities={opportunityOptions}
          initialContactId={searchParams.get("contactId")}
        />
      )}

      {/* Settings */}
      {isSettingsOpen && (
        <TaskSettingsModal settings={settings} onSave={handleSettingsSave} onClose={() => setIsSettingsOpen(false)} />
      )}

      {/* Mobile edit overlay */}
      {mobileEditId && (
        <div className="fixed inset-0 z-[100] md:hidden flex flex-col bg-[color:var(--wp-surface-card)]" role="dialog" aria-modal="true" aria-labelledby="mobile-edit-title">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--wp-surface-card-border)] shrink-0">
            <h2 id="mobile-edit-title" className="text-lg font-bold text-[color:var(--wp-text)]">Upravit úkol</h2>
            <button type="button" onClick={() => { setMobileEditId(null); setEditId(null); }} className="p-2 text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)] rounded-lg" aria-label="Zavřít">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-wider mb-1">Název</label>
              <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 min-h-[44px]" placeholder="Název úkolu" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-wider mb-1">Klient</label>
              <ContactSearchInput value={editForm.contactId} contacts={contacts} onChange={(cid) => setEditForm({ ...editForm, contactId: cid })} placeholder="Vyhledat klienta…" className="min-h-[44px]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-wider mb-1">Termín</label>
              <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
            </div>
          </div>
          <div className="flex gap-3 p-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-[color:var(--wp-surface-card-border)] shrink-0">
            <button type="button" onClick={() => { setMobileEditId(null); setEditId(null); }} className="flex-1 px-5 py-3 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-sm font-bold hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]">Zrušit</button>
            <button type="button" onClick={handleSaveEdit} className={clsx(portalPrimaryButtonClassName, "flex-1 px-5 py-3 min-h-[44px]")}>Uložit</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================
   PAGE WRAPPER
   ========================================== */
export default function TasksPage() {
  return (
    <Suspense fallback={<TasksLoading />}>
      <TasksPageContent />
    </Suspense>
  );
}

function TasksLoading() {
  return (
    <div className="min-h-screen bg-[color:var(--wp-bg)] p-6 md:p-8">
      <div className="max-w-[1400px] mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-[color:var(--wp-surface-card-border)] rounded" />
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 w-24 bg-[color:var(--wp-surface-card-border)] rounded-xl" />)}
        </div>
        <div className="rounded-[24px] border-2 border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 space-y-3">
          <div className="h-4 w-32 bg-[color:var(--wp-surface-muted)] rounded" />
          <div className="h-12 bg-[color:var(--wp-surface-muted)] rounded-xl" />
          <div className="h-12 bg-[color:var(--wp-surface-muted)] rounded-xl" />
          <div className="h-10 w-24 bg-indigo-100 rounded-xl" />
        </div>
        <div className="h-64 bg-[color:var(--wp-surface-card)] rounded-[24px] border border-[color:var(--wp-surface-card-border)]" />
      </div>
    </div>
  );
}
