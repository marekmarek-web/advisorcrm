"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  ChevronRight,
  AlertCircle,
  CalendarDays,
  User,
  FileText,
  Trash2,
  ArrowRight,
  Search,
  Sparkles,
  ListTodo,
} from "lucide-react";
import type { TaskRow, TaskCounts } from "@/app/actions/tasks";
import type { ContactRow } from "@/app/actions/contacts";
import {
  BottomSheet,
  EmptyState,
  MobileCard,
  MobileLoadingState,
} from "@/app/shared/mobile-ui/primitives";
import { VirtualizedColumn } from "@/app/shared/mobile-ui/VirtualizedColumn";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import { isDueDateBeforeLocalToday, localCalendarTodayYmd, normalizeIsoDateOnly } from "@/lib/date/date-only";

const TASK_LIST_VIRTUAL_THRESHOLD = 25;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Synchronní s MobilePortalClient / getTasksList filtry. Starý „týden“ na mobilu mapujeme na „vše“. */
type TaskFilter = "all" | "today" | "week" | "overdue" | "completed";

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const yy = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mo}-${dd}`;
}

function completedLocalYmd(completedAt: Date | null): string | null {
  if (!completedAt) return null;
  const d = completedAt instanceof Date ? completedAt : new Date(completedAt);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

function getDateLabel(due: string | null, todayStr: string): { label: string; isOverdue: boolean; isToday: boolean } {
  if (!due) return { label: "Bez termínu", isOverdue: false, isToday: false };
  const dueNorm = normalizeIsoDateOnly(due);
  if (!dueNorm) return { label: "Bez termínu", isOverdue: false, isToday: false };
  const [yy, mm, dd] = todayStr.split("-").map(Number);
  const next = new Date(yy, mm - 1, dd + 1);
  const tomorrowStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  if (dueNorm < todayStr) return { label: "Po termínu", isOverdue: true, isToday: false };
  if (dueNorm === todayStr) return { label: "Dnes", isOverdue: false, isToday: true };
  if (dueNorm === tomorrowStr) return { label: "Zítra", isOverdue: false, isToday: false };
  return {
    label: formatDisplayDateCs(dueNorm) || dueNorm,
    isOverdue: false,
    isToday: false,
  };
}

function formatTaskCount(count: number): string {
  if (count === 1) return "1 úkol";
  if (count >= 2 && count <= 4) return `${count} úkoly`;
  return `${count} úkolů`;
}

function getProgressPercent(todayTotal: number, todayOpen: number): number {
  if (todayTotal <= 0) return 100;
  return Math.round(((todayTotal - todayOpen) / todayTotal) * 100);
}

function applyDayStrip(tasks: TaskRow[], stripYmd: string, taskFilter: TaskFilter, todayStr: string): TaskRow[] {
  if (taskFilter === "all") return tasks;
  if (taskFilter === "week") return tasks;
  if (taskFilter === "today") {
    return tasks.filter((t) => normalizeIsoDateOnly(t.dueDate) === todayStr);
  }
  if (taskFilter === "overdue") {
    return tasks.filter((t) => {
      const due = normalizeIsoDateOnly(t.dueDate);
      return Boolean(due && due === stripYmd && isDueDateBeforeLocalToday(due));
    });
  }
  if (taskFilter === "completed") {
    return tasks.filter((t) => {
      const c = completedLocalYmd(t.completedAt);
      return Boolean(c && c === stripYmd);
    });
  }
  return tasks.filter((t) => {
    const due = normalizeIsoDateOnly(t.dueDate);
    if (!due) return stripYmd === todayStr;
    return due === stripYmd;
  });
}

function TaskProgressCard({ taskCounts, todayStr }: { taskCounts: TaskCounts; todayStr: string }) {
  const dateShort = formatDisplayDateCs(todayStr) ?? todayStr;
  const todayTotal = taskCounts.today + taskCounts.completed;
  const progress = getProgressPercent(todayTotal, taskCounts.today);

  return (
    <section className="relative overflow-hidden rounded-[34px] border border-white/60 bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-500 p-5 text-white shadow-[0_26px_68px_-30px_rgba(79,70,229,.7)]">
      <div className="absolute -right-16 -top-20 h-44 w-44 rounded-full bg-white/15 blur-2xl" aria-hidden />
      <div className="absolute -bottom-16 left-0 h-40 w-40 rounded-full bg-cyan-300/20 blur-2xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/65">Dnešní souhrn</p>
          <h2 className="mt-2 text-[30px] font-black leading-none tracking-tight">{formatTaskCount(taskCounts.today)}</h2>
          <p className="mt-2 text-[13px] font-bold text-white/72">{dateShort} · otevřené položky poradce</p>
        </div>
        <ListTodo size={28} className="shrink-0 text-white drop-shadow-sm" aria-hidden />
      </div>

      <div className="relative mt-6 grid grid-cols-3 gap-2">
        <div className="rounded-[20px] border border-white/14 bg-white/13 p-3 backdrop-blur-md">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/55">Po termínu</p>
          <p className="mt-1 text-[24px] font-black leading-none">{taskCounts.overdue}</p>
        </div>
        <div className="rounded-[20px] border border-white/14 bg-white/13 p-3 backdrop-blur-md">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/55">Hotovo</p>
          <p className="mt-1 text-[24px] font-black leading-none">{taskCounts.completed}</p>
        </div>
        <div className="rounded-[20px] border border-white/14 bg-white/13 p-3 backdrop-blur-md">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/55">Progress</p>
          <p className="mt-1 text-[24px] font-black leading-none">{progress}%</p>
        </div>
      </div>

      <div className="relative mt-5 h-2.5 overflow-hidden rounded-full bg-white/18">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-200 to-white transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
        />
      </div>
    </section>
  );
}

function AccentCard({
  children,
  className,
  accent = "from-indigo-500 via-violet-500 to-blue-500",
  accentHeight = "h-1.5",
}: {
  children: React.ReactNode;
  className?: string;
  accent?: string;
  accentHeight?: "h-1" | "h-[5px]" | "h-1.5";
}) {
  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-[30px] border border-white/75 bg-white/80 shadow-[0_22px_54px_-36px_rgba(15,23,42,.36)] ring-1 ring-[color:var(--wp-surface-card-border)]/45 backdrop-blur-xl",
        className,
      )}
    >
      <div className={cx("absolute left-0 right-0 top-0 z-20 rounded-t-[30px] bg-gradient-to-r", accentHeight, accent)} />
      <div className="relative z-10">{children}</div>
    </section>
  );
}

function AnimatedLinearProgress({ progress }: { progress: number }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    setAnimated(0);
    const timeoutId = window.setTimeout(() => setAnimated(progress), 140);
    return () => window.clearTimeout(timeoutId);
  }, [progress]);

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-500 transition-[width] duration-1000 ease-out"
        style={{ width: `${Math.max(4, Math.min(100, animated))}%` }}
      />
    </div>
  );
}

function AnimatedProgressCircle({ progress }: { progress: number }) {
  const [animated, setAnimated] = useState(0);
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c - (animated / 100) * c;

  useEffect(() => {
    setAnimated(0);
    const timeoutId = window.setTimeout(() => setAnimated(progress), 120);
    return () => window.clearTimeout(timeoutId);
  }, [progress]);

  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white shadow-[0_12px_24px_-18px_rgba(15,23,42,.38)] ring-1 ring-slate-100">
      <svg width="44" height="44" className="-rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} stroke="currentColor" strokeWidth="4" fill="none" className="text-slate-100" />
        <circle
          cx="22"
          cy="22"
          r={r}
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="text-indigo-500 transition-[stroke-dashoffset] duration-1000 ease-out"
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[11px] font-black text-slate-700">{progress}%</span>
    </div>
  );
}

function TaskFocusCard({
  tasks,
  todayStr,
  progress,
  onToggleTask,
  onSelectTask,
}: {
  tasks: TaskRow[];
  todayStr: string;
  progress: number;
  onToggleTask: (task: TaskRow) => void;
  onSelectTask: (task: TaskRow) => void;
}) {
  return (
    <AccentCard className="p-4 pt-5" accent="from-emerald-300 via-teal-400 to-cyan-400">
      <div className="mb-4 flex items-center gap-4 px-1 pt-1">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] border border-emerald-100 bg-white text-emerald-600 shadow-sm">
          <ListTodo size={24} aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[18px] font-black text-[color:var(--wp-text)]">{formatTaskCount(tasks.length)} dnes</h3>
          <p className="text-[12px] font-semibold text-[color:var(--wp-text-secondary)]">Fronta nejdůležitější práce</p>
        </div>

        <AnimatedProgressCircle progress={progress} />
      </div>

      <div className="mb-4 px-1">
        <AnimatedLinearProgress progress={progress} />
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-[21px] border border-dashed border-emerald-100 bg-emerald-50/55 px-4 py-5 text-center">
          <p className="text-sm font-bold text-emerald-800">Dnešní fronta je prázdná.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.slice(0, 3).map((task) => (
            <ModernTaskRow
              key={task.id}
              task={task}
              todayStr={todayStr}
              onToggleTask={onToggleTask}
              onSelectTask={onSelectTask}
            />
          ))}
        </div>
      )}
    </AccentCard>
  );
}

function InternalSummaryCard({
  overdueCount,
  todayOpen,
  progress,
}: {
  overdueCount: number;
  todayOpen: number;
  progress: number;
}) {
  return (
    <AccentCard className="p-5 pt-6" accent="from-violet-400 via-indigo-500 to-blue-500">
      <div className="absolute -right-10 -top-16 h-40 w-40 rounded-full bg-violet-300/30 blur-3xl" aria-hidden />
      <div className="absolute -bottom-20 -left-14 h-44 w-44 rounded-full bg-emerald-200/35 blur-3xl" aria-hidden />

      <div className="relative flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-[color:var(--wp-text)] text-white shadow-[0_16px_30px_-18px_rgba(15,23,42,.7)]">
          <Sparkles size={23} aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--wp-text-secondary)]">Interní souhrn</p>
            <span className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">
              poradce
            </span>
          </div>

          <h3 className="text-[18px] font-black leading-6 tracking-tight text-[color:var(--wp-text)]">
            Největší tlak je ve starších úkolech.
          </h3>

          <p className="mt-2 text-[13px] font-semibold leading-5 text-[color:var(--wp-text-secondary)]">
            Dnes zkontrolujte {todayOpen} otevřené položky a potom uzavřete {overdueCount} úkoly po termínu.
            Výstupy AI Review smluv držte jako interní podklad ke kontrole poradcem.
          </p>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-white/70 bg-white/70 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Dnes</p>
          <p className="mt-1 text-[22px] font-black text-slate-950">{todayOpen}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/70 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Po termínu</p>
          <p className="mt-1 text-[22px] font-black text-rose-600">{overdueCount}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/70 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Hotovo</p>
          <p className="mt-1 text-[22px] font-black text-indigo-600">{progress}%</p>
        </div>
      </div>
    </AccentCard>
  );
}

function DayStrip({
  todayStr,
  selectedYmd,
  onSelect,
}: {
  todayStr: string;
  selectedYmd: string;
  onSelect: (ymd: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -4; i <= 10; i++) {
      out.push(addDaysYmd(todayStr, i));
    }
    return out;
  }, [todayStr]);

  const scrollToSelected = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const sel = el.querySelector<HTMLElement>('[data-strip-active="true"]');
    sel?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  }, []);

  useEffect(() => {
    scrollToSelected();
  }, [selectedYmd, scrollToSelected]);

  return (
    <div
      ref={scrollerRef}
      className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1 snap-x snap-mandatory scroll-px-2"
      role="tablist"
      aria-label="Výběr dne"
    >
      {days.map((ymd) => {
        const isToday = ymd === todayStr;
        const active = ymd === selectedYmd;
        const ddmmyyyy = formatDisplayDateCs(ymd) ?? ymd;
        return (
          <button
            key={ymd}
            type="button"
            data-strip-active={active ? "true" : undefined}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(ymd)}
            className={cx(
              "relative min-h-[62px] min-w-[52px] shrink-0 snap-center overflow-hidden rounded-[20px] border px-2.5 py-2 text-center shadow-[0_12px_24px_-22px_rgba(15,23,42,.4)] transition-all active:scale-[0.98]",
              active
                ? "border-indigo-500 bg-[color:var(--wp-text)] text-white"
                : "border-white/75 bg-white/72 text-[color:var(--wp-text-secondary)] ring-1 ring-[color:var(--wp-surface-card-border)]/45 backdrop-blur-xl",
            )}
          >
            {active ? <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-violet-400 via-indigo-400 to-sky-400" /> : null}
            <span
              className={cx(
                "block text-[9px] font-black uppercase tracking-wider",
                active ? "text-white/72" : isToday ? "text-indigo-600" : "text-[color:var(--wp-text-tertiary)]",
              )}
            >
              {isToday ? "Dnes" : new Date(ymd + "T12:00:00").toLocaleDateString("cs-CZ", { weekday: "short" })}
            </span>
            <span className={cx("mt-0.5 block text-[16px] font-black tabular-nums leading-tight", active ? "text-white" : "text-[color:var(--wp-text)]")}>{ddmmyyyy.slice(0, 2)}</span>
          </button>
        );
      })}
    </div>
  );
}

function TaskSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)]">
        <Search size={18} />
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Hledat úkol nebo klienta…"
        className="min-h-[52px] w-full rounded-[22px] border border-white/70 bg-white/78 pl-12 pr-4 text-[14px] font-semibold text-[color:var(--wp-text)] shadow-[0_16px_30px_-26px_rgba(15,23,42,.34)] outline-none ring-1 ring-[color:var(--wp-surface-card-border)]/50 backdrop-blur-xl placeholder:text-[color:var(--wp-text-tertiary)] focus:border-indigo-200 focus:ring-4 focus:ring-indigo-100/70"
      />
    </label>
  );
}

function TaskFilterChip({
  active,
  label,
  count,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone: "navy" | "blue" | "rose" | "emerald";
  onClick: () => void;
}) {
  const styles = {
    navy: { gradient: "from-zinc-800 to-zinc-950", text: "text-[color:var(--wp-text)]" },
    blue: { gradient: "from-sky-400 to-indigo-500", text: "text-blue-700" },
    rose: { gradient: "from-rose-400 to-pink-600", text: "text-rose-700" },
    emerald: { gradient: "from-emerald-400 to-teal-500", text: "text-emerald-700" },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "relative flex min-h-[44px] shrink-0 items-center gap-2 overflow-hidden rounded-full border px-4 text-[13px] font-black shadow-[0_12px_22px_-18px_rgba(15,23,42,.45)] transition active:scale-95",
        active ? "border-[color:var(--wp-text)] bg-[color:var(--wp-text)] text-white" : "border-white/75 bg-white/76 backdrop-blur-xl",
      )}
    >
      {!active ? <span className={cx("absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r", styles.gradient)} /> : null}
      <span className={cx("h-2 w-2 shrink-0 rounded-full", active ? "bg-white/70" : "bg-gradient-to-br", styles.gradient)} />
      <span className={active ? "text-white" : styles.text}>{label}</span>
      <span className={cx("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px]", active ? "bg-white/14 text-white" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]")}>
        {count}
      </span>
    </button>
  );
}

function TaskDetailSheet({
  task,
  onClose,
  onToggle,
  onDelete,
  onQuickFix,
  todayStr,
}: {
  task: TaskRow;
  onClose: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onQuickFix: () => void;
  todayStr: string;
}) {
  const { label, isOverdue } = getDateLabel(task.dueDate, todayStr);
  const isDone = Boolean(task.completedAt);

  return (
    <BottomSheet
      open
      title={task.title}
      onClose={onClose}
      compact
      reserveMobileBottomNav
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggle}
            className={cx(
              "min-h-[48px] rounded-xl text-sm font-bold flex items-center justify-center gap-2",
              isDone
                ? "border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]"
                : "bg-emerald-600 text-white",
            )}
          >
            {isDone ? (
              <>
                <Circle size={16} /> Znovu otevřít
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> Dokončit
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="min-h-[48px] rounded-xl border border-rose-200 text-rose-700 text-sm font-bold flex items-center justify-center gap-2"
          >
            <Trash2 size={16} /> Smazat
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <span
            className={cx(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-widest",
              isDone
                ? "bg-emerald-50 text-emerald-700"
                : isOverdue
                  ? "bg-rose-50 text-rose-700"
                  : "bg-amber-50 text-amber-700",
            )}
          >
            <Clock size={11} />
            {isDone ? "Dokončeno" : label}
          </span>
          {task.contactName && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]">
              <User size={11} /> {task.contactName}
            </span>
          )}
          {task.opportunityTitle && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700">
              <FileText size={11} /> {task.opportunityTitle}
            </span>
          )}
        </div>

        {task.description ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)] leading-relaxed bg-[color:var(--wp-surface-muted)] rounded-xl px-4 py-3">
            {task.description}
          </p>
        ) : null}

        {isOverdue && !isDone ? (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
            <AlertCircle size={16} className="text-rose-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-rose-800">Úkol je po termínu</p>
              <button
                type="button"
                onClick={onQuickFix}
                className="mt-1.5 text-xs font-bold text-rose-700 underline-offset-2 hover:underline"
              >
                Přesunout na dnešek →
              </button>
            </div>
          </div>
        ) : null}

        {task.contactId ? (
          <a
            href={`/portal/contacts/${task.contactId}`}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] text-sm font-bold flex items-center justify-center gap-2"
          >
            <User size={14} /> Otevřít klienta <ArrowRight size={14} />
          </a>
        ) : null}
      </div>
    </BottomSheet>
  );
}

function ModernTaskRow({
  task,
  todayStr,
  onToggleTask,
  onSelectTask,
}: {
  task: TaskRow;
  todayStr: string;
  onToggleTask: (task: TaskRow) => void;
  onSelectTask: (task: TaskRow) => void;
}) {
  const isDone = Boolean(task.completedAt);
  const { label, isOverdue, isToday } = getDateLabel(task.dueDate, todayStr);
  return (
    <article
      className={cx(
        "overflow-hidden rounded-[26px] border bg-white/92 shadow-[0_16px_34px_-26px_rgba(15,23,42,.28)] ring-1 ring-[color:var(--wp-surface-card-border)] backdrop-blur-xl",
        isOverdue && !isDone ? "border-rose-200" : "border-white/80",
      )}
    >
      <div className="flex items-stretch gap-0">
        <button
          type="button"
          onClick={() => onToggleTask(task)}
          className={cx(
            "min-h-[92px] w-[3.5rem] shrink-0 flex items-center justify-center transition-colors",
            isDone
              ? "bg-emerald-50 text-emerald-500"
              : isOverdue
                ? "bg-rose-50 text-rose-400"
                : "bg-gradient-to-b from-indigo-50/80 to-violet-50/50 text-indigo-300",
          )}
          aria-label={isDone ? "Znovu otevřít" : "Označit jako hotovo"}
        >
          {isDone ? <CheckCircle2 size={24} className="text-emerald-500" /> : <Circle size={24} strokeWidth={2} />}
        </button>

        <button
          type="button"
          onClick={() => onSelectTask(task)}
          className="flex min-h-[92px] flex-1 min-w-0 items-center gap-2 p-4 text-left"
        >
          <div className="min-w-0 flex-1">
            <p
              className={cx(
                "text-[16px] font-black leading-snug tracking-tight",
                isDone ? "line-through text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text)]",
              )}
            >
              {task.title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {task.dueDate ? (
                <span
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest",
                    isOverdue && !isDone
                      ? "bg-rose-50 text-rose-600"
                      : isToday && !isDone
                        ? "bg-amber-50 text-amber-600"
                        : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)]",
                  )}
                >
                  <CalendarDays size={10} />
                  {label}
                </span>
              ) : null}
              {task.contactName ? (
                <span className="inline-flex max-w-[150px] items-center gap-1 rounded-full bg-[color:var(--wp-surface-muted)] px-2.5 py-1 text-[10px] font-black text-[color:var(--wp-text-secondary)]">
                  <User size={11} />
                  <span className="truncate">{task.contactName}</span>
                </span>
              ) : null}
            </div>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)]">
            <ChevronRight size={18} aria-hidden />
          </span>
        </button>
      </div>
    </article>
  );
}

interface TasksScreenProps {
  tasks: TaskRow[];
  taskCounts: TaskCounts;
  taskFilter: TaskFilter;
  contacts: ContactRow[];
  deviceClass: DeviceClass;
  refreshing?: boolean;
  onFilterChange: (filter: TaskFilter) => void;
  onToggleTask: (task: TaskRow) => void;
  onDeleteTask: (taskId: string) => void;
  onQuickOverdueFix: (task: TaskRow) => void;
}

export function TasksScreen({
  tasks,
  taskCounts,
  taskFilter,
  contacts: _contacts,
  deviceClass,
  refreshing = false,
  onFilterChange,
  onToggleTask,
  onDeleteTask,
  onQuickOverdueFix,
}: TasksScreenProps) {
  void _contacts;

  const todayStr = localCalendarTodayYmd();
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [stripYmd, setStripYmd] = useState(todayStr);

  const onStripDaySelect = useCallback(
    (ymd: string) => {
      if (taskFilter === "today" && ymd !== todayStr) {
        onFilterChange("all");
      }
      setStripYmd(ymd);
    },
    [taskFilter, todayStr, onFilterChange],
  );

  const filterOptions = useMemo(
    () => [
      { id: "all", label: "Vše", badge: taskCounts.all },
      { id: "today", label: "Dnes", badge: taskCounts.today },
      { id: "week", label: "Týden", badge: taskCounts.week },
      { id: "overdue", label: "Po termínu", badge: taskCounts.overdue, tone: "warning" as const },
      { id: "completed", label: "Hotovo", badge: taskCounts.completed },
    ],
    [taskCounts],
  );

  const chipValue = taskFilter as "all" | "today" | "week" | "overdue" | "completed";

  const overdueCount = tasks.filter((t) => !t.completedAt && !!t.dueDate && isDueDateBeforeLocalToday(t.dueDate)).length;
  const todayTasks = tasks.filter((t) => !t.completedAt && normalizeIsoDateOnly(t.dueDate) === todayStr);
  const todayTotal = taskCounts.today + taskCounts.completed;
  const progress = getProgressPercent(todayTotal, taskCounts.today);
  const todayLabel = new Date(todayStr + "T12:00:00").toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const filtered = useMemo(() => {
    return applyDayStrip(tasks, stripYmd, taskFilter, todayStr);
  }, [tasks, stripYmd, taskFilter, todayStr]);

  const listAccent =
    chipValue === "overdue"
      ? "from-rose-400 via-pink-500 to-orange-400"
      : chipValue === "completed"
        ? "from-emerald-300 via-teal-400 to-cyan-400"
        : chipValue === "week"
          ? "from-amber-300 via-orange-400 to-orange-600"
          : chipValue === "today"
            ? "from-sky-400 via-blue-500 to-indigo-500"
            : "from-indigo-500 via-violet-500 to-blue-500";

  const listTitle =
    chipValue === "all"
      ? "Všechny úkoly"
      : chipValue === "today"
        ? "Dnes"
        : chipValue === "week"
          ? "Tento týden"
          : chipValue === "overdue"
            ? "Po termínu"
            : "Hotovo";

  return (
    <div className={cx("w-full min-w-0 space-y-6 overflow-x-hidden pb-6", deviceClass === "tablet" && "mx-auto max-w-2xl")}>
      <section className="flex items-end justify-between gap-4 pt-2">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--wp-text-secondary)]">
            {todayLabel}
          </p>
          <h1 className="mt-1 text-[32px] font-black leading-tight tracking-tight text-[color:var(--wp-text)]">
            Úkoly dnes
          </h1>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-[color:var(--wp-text)] text-white shadow-[0_12px_24px_-14px_rgba(15,23,42,.45)]">
          <Sparkles size={21} />
        </div>
      </section>

      <div>
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.1em] text-[color:var(--wp-text-secondary)]">
          Vyberte den
        </p>
        <DayStrip todayStr={todayStr} selectedYmd={stripYmd} onSelect={onStripDaySelect} />
      </div>

      <TaskFocusCard
        tasks={todayTasks}
        todayStr={todayStr}
        progress={progress}
        onToggleTask={onToggleTask}
        onSelectTask={setSelectedTask}
      />

      <InternalSummaryCard overdueCount={overdueCount} todayOpen={taskCounts.today} progress={progress} />

      <section className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 no-scrollbar">
        {filterOptions.map((option) => (
          <TaskFilterChip
            key={option.id}
            active={chipValue === option.id}
            label={option.label}
            count={option.badge}
            tone={option.id === "overdue" ? "rose" : option.id === "completed" ? "emerald" : option.id === "today" ? "blue" : "navy"}
            onClick={() => onFilterChange(option.id as TaskFilter)}
          />
        ))}
      </section>

      {overdueCount > 0 && chipValue !== "overdue" && chipValue !== "completed" ? (
        <MobileCard className="overflow-hidden border-rose-100 bg-gradient-to-br from-rose-50 via-white to-orange-50/80 p-4 shadow-[0_18px_36px_-30px_rgba(244,63,94,.45)]">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px] bg-rose-500 text-white shadow-[0_12px_24px_-16px_rgba(244,63,94,.65)]">
              <AlertCircle size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-500">Vyžaduje pozornost</p>
              <p className="mt-0.5 text-[15px] font-black text-rose-950">
                {formatTaskCount(overdueCount)} po termínu
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStripYmd(todayStr);
                onFilterChange("overdue");
              }}
              className="min-h-[44px] shrink-0 rounded-[16px] border border-rose-200 bg-white px-3 text-xs font-black text-rose-700 shadow-sm"
            >
              Zobrazit
            </button>
          </div>
        </MobileCard>
      ) : null}

      {refreshing && tasks.length === 0 ? (
        <MobileLoadingState variant="card" rows={5} label="Načítám úkoly" />
      ) : !refreshing && filtered.length === 0 ? (
        <EmptyState
          title="Žádné úkoly"
          description="V tomto výběru dne a filtru nejsou žádné položky."
        />
      ) : filtered.length > 0 ? (
        <AccentCard className="p-4 pt-5" accent={listAccent} accentHeight="h-[5px]">
          <div className="mb-4 flex items-center justify-between px-1">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--wp-text-secondary)]">Seznam</p>
              <h2 className="mt-0.5 text-[22px] font-black tracking-tight text-[color:var(--wp-text)]">{listTitle}</h2>
            </div>
            <span className="rounded-full border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-1.5 text-[12px] font-black text-[color:var(--wp-text)]">
              {filtered.length}
            </span>
          </div>

          <VirtualizedColumn
            count={filtered.length}
            estimateSize={120}
            enabled={filtered.length >= TASK_LIST_VIRTUAL_THRESHOLD}
            fallback={
              <div className="space-y-2.5">
                {filtered.map((task) => (
                  <ModernTaskRow
                    key={task.id}
                    task={task}
                    todayStr={todayStr}
                    onToggleTask={onToggleTask}
                    onSelectTask={setSelectedTask}
                  />
                ))}
              </div>
            }
          >
            {(index) => {
              const task = filtered[index];
              if (!task) return null;
              return (
                <div className="pb-2.5">
                  <ModernTaskRow
                    task={task}
                    todayStr={todayStr}
                    onToggleTask={onToggleTask}
                    onSelectTask={setSelectedTask}
                  />
                </div>
              );
            }}
          </VirtualizedColumn>
        </AccentCard>
      ) : null}

      {selectedTask ? (
        <TaskDetailSheet
          task={selectedTask}
          todayStr={todayStr}
          onClose={() => setSelectedTask(null)}
          onToggle={() => {
            onToggleTask(selectedTask);
            setSelectedTask(null);
          }}
          onDelete={() => {
            onDeleteTask(selectedTask.id);
            setSelectedTask(null);
          }}
          onQuickFix={() => {
            onQuickOverdueFix(selectedTask);
            setSelectedTask(null);
          }}
        />
      ) : null}
    </div>
  );
}
