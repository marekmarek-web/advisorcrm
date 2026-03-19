"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getTasksList,
  getTasksCounts,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  reopenTask,
  type TaskRow,
  type TaskCounts,
} from "@/app/actions/tasks";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { getOpenOpportunitiesForSelect } from "@/app/actions/pipeline";
import { ContactSearchInput } from "@/app/components/ContactSearchInput";
import { SkeletonLine } from "@/app/components/Skeleton";
import { SwipeTaskItem } from "@/app/components/SwipeTaskItem";
import { CustomDropdown as CustomDropdownUI } from "@/app/components/ui/CustomDropdown";
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
  Target,
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
} from "lucide-react";

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
  return date.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}

function isOverdue(dueDate: string | null, completedAt: Date | null) {
  if (!dueDate || completedAt) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
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
  icon?: React.ComponentType<{ size?: number; className?: string }>;
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
    ? `w-full px-4 py-3.5 bg-slate-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-sm font-bold transition-all focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 flex items-center justify-between ${isPlaceholder ? "text-slate-400" : "text-slate-800"}`
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
            {Icon && <Icon size={18} className={isPlaceholder ? "text-slate-300" : "text-slate-500"} />}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </div>
        ) : (
          <>
            {Icon && <Icon size={14} className={!isPlaceholder ? "fill-indigo-200" : ""} />}
            {selected ? selected.label : placeholder}
          </>
        )}
        <ChevronDown size={isInput ? 16 : 14} className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${isInput ? "text-slate-400" : ""}`} />
      </button>

      {isOpen && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} onWheel={() => setIsOpen(false)} onTouchMove={() => setIsOpen(false)} />
          <div
            className="fixed bg-white border border-slate-100 rounded-2xl shadow-xl shadow-indigo-900/10 py-2 z-[9999] animate-in fade-in duration-200 max-h-60 overflow-y-auto custom-scrollbar"
            style={dropdownStyles}
          >
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setIsOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold transition-colors hover:bg-slate-50
                  ${value === opt.id ? "text-emerald-600 bg-emerald-50/50" : "text-slate-600"}
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
        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-sm font-bold transition-all focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 flex items-center justify-between text-left text-slate-800"
      >
        <span className={!value ? "text-slate-400 font-medium" : ""}>{formatDisplayDate(value)}</span>
      </button>

      {isOpen && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} onWheel={() => setIsOpen(false)} onTouchMove={() => setIsOpen(false)} />
          <div
            className="fixed w-72 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-indigo-900/10 p-5 z-[9999] animate-in fade-in zoom-in-95 duration-200"
            style={dropdownStyles}
          >
            <div className="flex justify-between items-center mb-5">
              <span className="font-black text-slate-800 text-sm capitalize">{monthsCZ[month]} {year}</span>
              <div className="flex gap-1">
                <button type="button" onClick={handlePrevMonth} className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"><ChevronLeft size={16} /></button>
                <button type="button" onClick={handleNextMonth} className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"><ChevronRight size={16} /></button>
              </div>
            </div>

            <div className="grid grid-cols-7 mb-3">
              {weekDaysCZ.map((day) => (
                <div key={day} className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400">{day}</div>
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
                      ${isSelected ? "bg-emerald-500 text-white shadow-md" : "text-slate-700 hover:bg-slate-100"}
                      ${isDayToday && !isSelected ? "ring-2 ring-inset ring-emerald-500 text-emerald-600 bg-emerald-50" : ""}
                    `}
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button type="button" onClick={clearDate} className="text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors px-2 py-1">Vymazat</button>
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-6 modal-overlay">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-[500px] flex flex-col overflow-hidden border border-slate-100 modal-content">

        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 rounded-t-[32px]">
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Settings2 className="text-slate-500" /> Nastavení úkolů
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shadow-sm">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Zobrazení a třídění</h3>

            <label className="flex items-center justify-between cursor-pointer group p-4 border border-slate-200 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-slate-800 mb-0.5">Skrýt dokončené úkoly</div>
                <div className="text-xs font-medium text-slate-500">Automaticky přesune splněné úkoly do historie.</div>
              </div>
              <div className="relative inline-flex items-center ml-4 shrink-0">
                <input type="checkbox" className="sr-only peer" checked={hideCompleted} onChange={() => setHideCompleted(!hideCompleted)} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1a1c2e]" />
              </div>
            </label>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Výchozí pohled</label>
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
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Nové úkoly</h3>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Výchozí priorita</label>
              <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <button onClick={() => setDefaultPriority("low")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${defaultPriority === "low" ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>Nízká</button>
                <button onClick={() => setDefaultPriority("normal")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${defaultPriority === "normal" ? "bg-white text-indigo-700 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>Běžná</button>
                <button onClick={() => setDefaultPriority("high")} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${defaultPriority === "high" ? "bg-white text-rose-600 shadow-sm border border-rose-200" : "text-slate-500 hover:text-slate-700"}`}>
                  <Flag size={14} className={defaultPriority === "high" ? "fill-rose-100" : ""} /> Urgentní
                </button>
              </div>
            </div>
          </div>

        </div>

        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-4 rounded-b-[32px]">
          <button onClick={onClose} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors shadow-sm">
            Zrušit
          </button>
          <button onClick={handleSave} className="px-8 py-2.5 bg-[#1a1c2e] hover:bg-[#2a2d4a] text-white rounded-xl text-sm font-black tracking-wide shadow-xl shadow-slate-900/20 transition-all active:scale-95 flex items-center gap-2">
            <Check size={16} /> Uložit
          </button>
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
}: {
  onClose: () => void;
  onCreated: () => void;
  contacts: ContactRow[];
  opportunities: Array<{ id: string; title: string }>;
}) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskData, setTaskData] = useState({
    title: "",
    date: new Date().toISOString().slice(0, 10),
    priority: "normal",
    reminder: "1h",
    client: "none",
    deal: "none",
    desc: "",
  });

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

  const labelClass = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-6 modal-overlay">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-[500px] flex flex-col border border-slate-100 min-h-[500px] modal-content">

        <div className="px-8 pt-6 pb-0 border-b border-slate-100 bg-white relative z-10 rounded-t-[32px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <CheckSquare className="text-emerald-500" /> Nový úkol
            </h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shadow-sm">
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center justify-between pb-4 relative">
            <div className="absolute left-0 top-3 w-full h-1 bg-slate-100 rounded-full -z-10" />
            <div className="absolute left-0 top-3 h-1 bg-emerald-500 rounded-full -z-10 transition-all duration-500" style={{ width: step === 1 ? "0%" : step === 2 ? "50%" : "100%" }} />

            {[
              { id: 1, label: "Základ" },
              { id: 2, label: "Kontext" },
              { id: 3, label: "Detaily" },
            ].map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-2 bg-white px-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border-2 transition-colors duration-300
                  ${step === s.id ? "border-emerald-500 bg-emerald-50 text-emerald-600 shadow-sm" :
                    step > s.id ? "border-emerald-500 bg-emerald-500 text-white" :
                    "border-slate-200 bg-slate-50 text-slate-400"}
                `}>
                  {step > s.id ? <Check size={12} strokeWidth={4} /> : s.id}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest ${step >= s.id ? "text-slate-800" : "text-slate-400"}`}>{s.label}</span>
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
                  className="w-full px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl text-lg font-black outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 transition-all text-slate-800 placeholder:text-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Termín splnění *</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
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
                <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                  <button onClick={() => setTaskData({ ...taskData, priority: "low" })} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${taskData.priority === "low" ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>Nízká</button>
                  <button onClick={() => setTaskData({ ...taskData, priority: "normal" })} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${taskData.priority === "normal" ? "bg-white text-indigo-700 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>Běžná</button>
                  <button onClick={() => setTaskData({ ...taskData, priority: "high" })} className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${taskData.priority === "high" ? "bg-white text-rose-600 shadow-sm border border-rose-200" : "text-slate-500 hover:text-slate-700"}`}>
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
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 transition-all text-slate-800 resize-none leading-relaxed custom-scrollbar"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between cursor-pointer hover:border-indigo-200 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black">MD</div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Přiřazeno vám</p>
                    <p className="text-[10px] font-medium text-slate-500">Klikněte pro delegování</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </div>
            </div>
          )}

        </div>

        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-4 rounded-b-[32px]">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors shadow-sm flex items-center gap-2"
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
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="px-8 py-2.5 bg-[#1a1c2e] hover:bg-[#2a2d4a] text-white rounded-xl text-sm font-black tracking-wide shadow-xl shadow-slate-900/20 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
            >
              <Check size={16} /> {submitting ? "Vytvářím..." : "Vytvořit úkol"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

/* ==========================================
   MORE ACTIONS DROPDOWN
   ========================================== */
function MoreActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyles, setMenuStyles] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuStyles({ top: rect.bottom + 4, left: rect.right - 160 });
    }
    setIsOpen(!isOpen);
  };

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all" aria-label="Více možností">
        <MoreVertical size={16} />
      </button>
      {isOpen && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
          <div className="fixed w-40 bg-white border border-slate-100 rounded-xl shadow-xl py-1 z-[9999]" style={menuStyles}>
            <button type="button" onClick={() => { onEdit(); setIsOpen(false); }} className="w-full px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 text-left transition-colors">Upravit</button>
            <button type="button" onClick={() => { onDelete(); setIsOpen(false); }} className="w-full px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 text-left transition-colors">Smazat</button>
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
  const initialSettings = loadSettings();

  const initialFilter = (() => {
    const f = searchParams.get("filter");
    if (f && FILTERS.some((x) => x.key === f)) return f as Filter;
    if (FILTERS.some((x) => x.key === initialSettings.defaultTab)) return initialSettings.defaultTab as Filter;
    return "all";
  })();

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [opportunityOptions, setOpportunityOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [counts, setCounts] = useState<TaskCounts>({ all: 0, today: 0, week: 0, overdue: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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

  useEffect(() => {
    const contactId = searchParams.get("contactId");
    if (contactId) setIsWizardOpen(true);
    const filterParam = searchParams.get("filter");
    if (filterParam && FILTERS.some((f) => f.key === filterParam)) setFilter(filterParam as Filter);
  }, [searchParams]);

  const reload = useCallback(async (f?: Filter) => {
    setLoading(true);
    setLoadError(false);
    try {
      const [rows, c] = await Promise.all([getTasksList(f ?? filter), getTasksCounts()]);
      setTasks(rows);
      setCounts(c);
    } catch {
      setLoadError(true);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    reload();
    getContactsList().then(setContacts).catch(() => {});
    getOpenOpportunitiesForSelect().then(setOpportunityOptions).catch(() => {});
  }, [reload]);

  const filteredBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q) || t.contactName?.toLowerCase().includes(q));
  }, [tasks, searchQuery]);

  async function handleFilterChange(f: Filter) {
    setFilter(f);
    setEditId(null);
    setLoading(true);
    try {
      const [rows, c] = await Promise.all([getTasksList(f), getTasksCounts()]);
      setTasks(rows);
      setCounts(c);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(task: TaskRow) {
    if (task.completedAt) await reopenTask(task.id);
    else await completeTask(task.id);
    await reload();
  }

  async function handleQuickAdd() {
    if (!newTaskTitle.trim()) return;
    setQuickAddSubmitting(true);
    try {
      await createTask({ title: newTaskTitle.trim(), dueDate: new Date().toISOString().slice(0, 10) });
      setNewTaskTitle("");
      setIsInputFocused(false);
      await reload();
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
    await reload();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Opravdu smazat tento úkol?")) return;
    await deleteTask(id);
    await reload();
  }

  async function handleMoveToToday(id: string) {
    await updateTask(id, { dueDate: new Date().toISOString().slice(0, 10) });
    await reload();
  }

  function openMobileEdit(task: TaskRow) {
    startEdit(task);
    setMobileEditId(task.id);
  }

  const activeTasksCount = filteredBySearch.filter((t) => !t.completedAt).length;
  const completedTasksCount = filteredBySearch.filter((t) => !!t.completedAt).length;
  const totalInView = filteredBySearch.length;
  const progressPercent = totalInView > 0 ? Math.round((completedTasksCount / totalInView) * 100) : 0;

  const overdueTask = tasks.find((t) => !t.completedAt && t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10));

  const visibleTasks = useMemo(() => {
    if (settings.hideCompleted && filter !== "completed") {
      return filteredBySearch.filter((t) => !t.completedAt);
    }
    return filteredBySearch;
  }, [filteredBySearch, settings.hideCompleted, filter]);

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 pb-20">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;700;800;900&display=swap');
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
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
            <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight">Moje úkoly</h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all active:scale-95"
              >
                <Settings2 size={16} /> Nastavení
              </button>
              <button
                onClick={() => setIsWizardOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95"
              >
                <Plus size={16} strokeWidth={2.5} /> Nový úkol
              </button>
            </div>
          </div>

          {/* Quick add */}
          <div className={`bg-white rounded-[24px] border transition-all duration-300 overflow-hidden shadow-sm ${isInputFocused ? "border-indigo-400 ring-4 ring-indigo-50 shadow-md" : "border-slate-200 hover:border-indigo-300"}`}>
            <div className="p-1 flex flex-col md:flex-row items-center gap-2">
              <div className="flex-1 flex items-start w-full relative">
                <div className="p-4 text-slate-300 shrink-0"><Plus size={20} className={isInputFocused ? "text-indigo-500" : ""} /></div>
                <textarea
                  rows={isInputFocused ? 2 : 1}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => { if (!newTaskTitle) setIsInputFocused(false); }}
                  placeholder="Rychlý úkol: Co potřebujete udělat?..."
                  className="w-full py-4 pr-4 bg-transparent text-slate-800 font-semibold placeholder:font-medium placeholder:text-slate-400 outline-none text-sm resize-none transition-all"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleQuickAdd(); } }}
                />
              </div>

              {isInputFocused && (
                <div className="flex flex-wrap items-center gap-2 px-4 pb-4 md:pb-0 w-full md:w-auto animate-in fade-in duration-200">
                  <button disabled={quickAddSubmitting} onMouseDown={(e) => { e.preventDefault(); handleQuickAdd(); }} className="flex items-center justify-center px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-sm transition-colors w-full md:w-auto shrink-0 mt-2 md:mt-0 disabled:opacity-50">
                    {quickAddSubmitting ? "..." : "Vytvořit rychle"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search (inline, matching spec header search style) */}
          {tasks.length > 0 && (
            <div className="relative group hidden lg:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Hledat úkol..." className="pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all w-full" />
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pt-2 overflow-x-auto hide-scrollbar">
            {FILTERS.map((tab) => {
              const count = counts[tab.key as keyof TaskCounts] ?? 0;
              return (
                <button key={tab.key} onClick={() => handleFilterChange(tab.key)} className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-[3px] transition-all whitespace-nowrap ${filter === tab.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"} ${tab.alert && filter !== tab.key ? "text-rose-500" : ""}`}>
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${filter === tab.key ? "bg-indigo-100 text-indigo-700" : tab.alert ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Error */}
          {loadError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3" role="alert">
              <p className="text-sm font-medium text-amber-800">Nepodařilo se načíst úkoly.</p>
              <button type="button" onClick={() => reload()} className="shrink-0 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-sm font-semibold rounded-lg transition-colors">Zkusit znovu</button>
            </div>
          )}

          {/* Task list */}
          <div className="space-y-3 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-white p-4 sm:p-5 rounded-[20px] border border-slate-100 flex items-center gap-4">
                    <SkeletonLine className="h-6 w-6 rounded-full" />
                    <div className="flex-1"><SkeletonLine className="h-4 w-3/4 mb-2" /><SkeletonLine className="h-3 w-1/2" /></div>
                  </div>
                ))}
              </div>
            ) : visibleTasks.length === 0 ? (
              <div className="bg-white rounded-[24px] border border-slate-200 border-dashed p-16 flex flex-col items-center justify-center text-center shadow-sm">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-400 mb-6 shadow-inner">
                  <CheckCircle2 size={40} strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-xl font-bold text-slate-900 mb-2">Žádné aktivní úkoly</h3>
                <p className="text-sm font-medium text-slate-500 max-w-sm mb-8">V tomto výběru máte čistý stůl. Vytvořte si nový úkol pomocí průvodce, nebo si užijte volnou chvíli.</p>
                <button onClick={() => setIsWizardOpen(true)} className="px-6 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2">
                  <Plus size={16} strokeWidth={2.5} /> Přidat první úkol
                </button>
              </div>
            ) : (
              <>
                {/* Mobile: swipe list */}
                <div className="block md:hidden space-y-1">
                  {visibleTasks.map((t) => (
                    <SwipeTaskItem key={t.id} id={t.id} title={t.title}
                      subtitle={[t.contactName, formatDate(t.dueDate)].filter(Boolean).join(" · ")}
                      onDelete={(id) => { if (window.confirm("Opravdu smazat tento úkol?")) handleDelete(id); }}
                      onEdit={() => openMobileEdit(t)}
                      leftSlot={
                        <button type="button" onClick={() => handleToggle(t)} className="flex-shrink-0 p-1" aria-label={t.completedAt ? "Označit jako nedokončené" : "Označit jako hotovo"}>
                          {t.completedAt ? <CheckCircle2 size={24} className="text-emerald-500" /> : <Circle size={24} className="text-slate-300" />}
                        </button>
                      }
                    />
                  ))}
                </div>

                {/* Desktop: rich cards — 1:1 spec */}
                <div className="hidden md:block space-y-3">
                  {visibleTasks.map((task) => {
                    const isCompleted = !!task.completedAt;
                    const overdue = isOverdue(task.dueDate, task.completedAt);

                    if (editId === task.id) {
                      return (
                        <div key={task.id} className="bg-white p-5 rounded-[20px] border border-slate-200 shadow-sm space-y-3">
                          <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" placeholder="Název úkolu" />
                          <div className="flex flex-wrap gap-3">
                            <div className="flex-1 min-w-[180px]">
                              <ContactSearchInput value={editForm.contactId} contacts={contacts} onChange={(cid) => setEditForm({ ...editForm, contactId: cid })} placeholder="Vyhledat klienta…" className="min-h-[40px]" />
                            </div>
                            <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                              className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium min-w-[160px] outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={handleSaveEdit} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold">Uložit</button>
                            <button type="button" onClick={() => setEditId(null)} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50">Zrušit</button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={task.id} className={`group bg-white p-4 sm:p-5 rounded-[20px] border transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center gap-4 ${isCompleted ? "border-slate-100 bg-slate-50/50 opacity-60 hover:opacity-100" : "border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200"}`}>
                        <button onClick={() => handleToggle(task)} className={`mt-1 sm:mt-0 flex-shrink-0 transition-colors transform active:scale-90 ${isCompleted ? "text-emerald-500" : overdue ? "text-rose-400 hover:text-emerald-500" : "text-slate-300 hover:text-emerald-500"}`}>
                          {isCompleted ? <CheckCircle2 size={26} className="fill-emerald-50" /> : <Circle size={26} />}
                        </button>
                        <div className="flex-1 min-w-0 w-full">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {overdue && <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 shadow-sm"><AlertCircle size={10} /> Po termínu</span>}
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-slate-200 bg-slate-50 text-slate-500">Úkol</span>
                          </div>
                          <h3 className={`font-bold text-[15px] mb-1.5 transition-all leading-tight ${isCompleted ? "text-slate-400 line-through" : "text-slate-900 group-hover:text-indigo-600"}`}>{task.title}</h3>
                          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-500">
                            {task.contactId && task.contactName ? (
                              <Link href={`/portal/contacts/${task.contactId}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 hover:text-indigo-600 cursor-pointer transition-colors px-2 py-1 bg-slate-100 rounded-md">
                                <User size={12} className="text-slate-400" /> {task.contactName}
                              </Link>
                            ) : null}
                            <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${overdue ? "text-rose-600 bg-rose-50" : "text-slate-500"}`}><CalendarDays size={12} className={overdue ? "text-rose-500" : "text-slate-400"} /> {formatDate(task.dueDate)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity w-full sm:w-auto border-t sm:border-none border-slate-100 pt-3 sm:pt-0 mt-2 sm:mt-0">
                          {!isCompleted && (
                            <>
                              {task.contactPhone ? (
                                <a href={`tel:${task.contactPhone}`} onClick={(e) => e.stopPropagation()} className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"><Phone size={16} /></a>
                              ) : (
                                <button className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"><Phone size={16} /></button>
                              )}
                              {task.contactEmail ? (
                                <a href={`mailto:${task.contactEmail}`} onClick={(e) => e.stopPropagation()} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Mail size={16} /></a>
                              ) : (
                                <button className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Mail size={16} /></button>
                              )}
                            </>
                          )}
                          <MoreActionsMenu onEdit={() => startEdit(task)} onDelete={() => handleDelete(task.id)} />
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
          <div className="bg-gradient-to-br from-[#1a1c2e] to-[#0f172a] rounded-[32px] p-8 text-white shadow-xl shadow-indigo-900/10 relative overflow-hidden border border-slate-800">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">V tomto výběru</h3>
                <Target size={18} className="text-indigo-400" />
              </div>
              <div className="mb-8">
                <div className="flex items-end gap-3 mb-1">
                  <span className="text-6xl font-display font-black tracking-tighter">{activeTasksCount}</span>
                </div>
                <span className="text-sm font-bold text-slate-400">Aktivních úkolů</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                  <span>Progres dnešní agendy</span>
                  <span className="text-emerald-400">{progressPercent}%</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000 ease-out relative" style={{ width: `${progressPercent}%` }}>
                     <div className="absolute top-0 left-0 w-full h-1/2 bg-white/20" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[32px] border border-slate-100 p-6 shadow-sm relative group overflow-hidden">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100"><Sparkles size={20} /></div>
              <h3 className="font-black text-sm uppercase tracking-widest text-slate-900">AI Priority</h3>
            </div>
            <div className="space-y-4">
              {overdueTask ? (
                <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-100/50 text-sm">
                  <p className="font-bold text-rose-900 mb-1 flex items-center gap-2"><AlertCircle size={14} className="text-rose-500" /> Zpožděné úkoly</p>
                  <p className="text-rose-700/80 mb-3 text-xs leading-relaxed font-medium">&ldquo;{overdueTask.title}&rdquo;{overdueTask.contactName ? ` pro klienta ${overdueTask.contactName}` : ""} mělo proběhnout {formatDate(overdueTask.dueDate)}.</p>
                  <button onClick={() => handleMoveToToday(overdueTask.id)} className="text-[10px] font-black uppercase tracking-widest text-rose-600 bg-white px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-100 transition-all w-full">Přesunout na dnešek</button>
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
        <NewTaskWizard onClose={() => setIsWizardOpen(false)} onCreated={() => reload()} contacts={contacts} opportunities={opportunityOptions} />
      )}

      {/* Settings */}
      {isSettingsOpen && (
        <TaskSettingsModal settings={settings} onSave={handleSettingsSave} onClose={() => setIsSettingsOpen(false)} />
      )}

      {/* Mobile edit overlay */}
      {mobileEditId && (
        <div className="fixed inset-0 z-[100] md:hidden flex flex-col bg-white" role="dialog" aria-modal="true" aria-labelledby="mobile-edit-title">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
            <h2 id="mobile-edit-title" className="text-lg font-bold text-slate-900">Upravit úkol</h2>
            <button type="button" onClick={() => { setMobileEditId(null); setEditId(null); }} className="p-2 text-slate-500 hover:text-slate-700 rounded-lg" aria-label="Zavřít">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Název</label>
              <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 min-h-[44px]" placeholder="Název úkolu" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Klient</label>
              <ContactSearchInput value={editForm.contactId} contacts={contacts} onChange={(cid) => setEditForm({ ...editForm, contactId: cid })} placeholder="Vyhledat klienta…" className="min-h-[44px]" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Termín</label>
              <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400" />
            </div>
          </div>
          <div className="flex gap-3 p-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-200 shrink-0">
            <button type="button" onClick={() => { setMobileEditId(null); setEditId(null); }} className="flex-1 px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 min-h-[44px]">Zrušit</button>
            <button type="button" onClick={handleSaveEdit} className="flex-1 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold min-h-[44px]">Uložit</button>
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
    <div className="min-h-screen bg-[#f8fafc] p-6 md:p-8">
      <div className="max-w-[1400px] mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 w-24 bg-slate-200 rounded-xl" />)}
        </div>
        <div className="rounded-[24px] border-2 border-slate-100 bg-white p-4 space-y-3">
          <div className="h-4 w-32 bg-slate-100 rounded" />
          <div className="h-12 bg-slate-50 rounded-xl" />
          <div className="h-12 bg-slate-50 rounded-xl" />
          <div className="h-10 w-24 bg-indigo-100 rounded-xl" />
        </div>
        <div className="h-64 bg-white rounded-[24px] border border-slate-200" />
      </div>
    </div>
  );
}
