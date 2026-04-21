"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import type { TaskRow, TaskCounts } from "@/app/actions/tasks";
import type { ContactRow } from "@/app/actions/contacts";
import {
  BottomSheet,
  EmptyState,
  FilterChips,
  MobileCard,
  SearchBar,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";
import { VirtualizedColumn } from "@/app/shared/mobile-ui/VirtualizedColumn";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import { isDueDateBeforeLocalToday, localCalendarTodayYmd, normalizeIsoDateOnly } from "@/lib/date/date-only";

const TASK_LIST_VIRTUAL_THRESHOLD = 25;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type TaskFilter = "all" | "today" | "week" | "overdue" | "completed";

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
    <BottomSheet open title={task.title} onClose={onClose}>
      <div className="space-y-4">
        {/* Status + Date */}
        <div className="flex flex-wrap gap-2">
          <span
            className={cx(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-widest",
              isDone
                ? "bg-emerald-50 text-emerald-700"
                : isOverdue
                  ? "bg-rose-50 text-rose-700"
                  : "bg-amber-50 text-amber-700"
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

        {/* Description */}
        {task.description ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)] leading-relaxed bg-[color:var(--wp-surface-muted)] rounded-xl px-4 py-3">
            {task.description}
          </p>
        ) : null}

        {/* Overdue quick-fix */}
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

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={onToggle}
            className={cx(
              "min-h-[48px] rounded-xl text-sm font-bold flex items-center justify-center gap-2",
              isDone
                ? "border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]"
                : "bg-emerald-600 text-white"
            )}
          >
            {isDone ? (
              <><Circle size={16} /> Znovu otevřít</>
            ) : (
              <><CheckCircle2 size={16} /> Dokončit</>
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

function TaskRowCard({
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
    <MobileCard
      className={cx("p-0 overflow-hidden", isOverdue && !isDone && "border-rose-200")}
    >
      <div className="flex items-stretch gap-0">
        <button
          type="button"
          onClick={() => onToggleTask(task)}
          className={cx(
            "w-14 flex-shrink-0 flex items-center justify-center transition-colors",
            isDone
              ? "bg-emerald-50 text-emerald-500"
              : isOverdue
                ? "bg-rose-50 text-rose-300"
                : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)]"
          )}
          aria-label={isDone ? "Znovu otevřít" : "Označit jako hotovo"}
        >
          {isDone ? (
            <CheckCircle2 size={22} className="text-emerald-500" />
          ) : (
            <Circle size={22} />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectTask(task)}
          className="flex flex-1 min-w-0 items-center gap-2 p-3.5 text-left"
        >
          <div className="min-w-0 flex-1">
            <p
              className={cx(
                "text-sm font-bold leading-snug",
                isDone ? "line-through text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text)]"
              )}
            >
              {task.title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {task.dueDate ? (
                <span
                  className={cx(
                    "text-[10px] font-black uppercase tracking-widest flex items-center gap-1",
                    isOverdue && !isDone
                      ? "text-rose-500"
                      : isToday && !isDone
                        ? "text-amber-500"
                        : "text-[color:var(--wp-text-tertiary)]"
                  )}
                >
                  <CalendarDays size={10} />
                  {label}
                </span>
              ) : null}
              {task.contactName ? (
                <StatusBadge tone="info">{task.contactName}</StatusBadge>
              ) : null}
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
        </button>
      </div>
    </MobileCard>
  );
}

interface TasksScreenProps {
  tasks: TaskRow[];
  taskCounts: TaskCounts;
  taskFilter: TaskFilter;
  contacts: ContactRow[];
  deviceClass: DeviceClass;
  /** Shell transition (e.g. refresh) — suppress empty-state flash while data may be stale. */
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
  deviceClass,
  refreshing = false,
  onFilterChange,
  onToggleTask,
  onDeleteTask,
  onQuickOverdueFix,
}: TasksScreenProps) {
  const todayStr = localCalendarTodayYmd();
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);

  const filterOptions = useMemo(
    () => [
      { id: "all", label: "Vše", badge: taskCounts.all },
      { id: "today", label: "Dnes", badge: taskCounts.today },
      { id: "week", label: "Týden", badge: taskCounts.week },
      { id: "overdue", label: "Po termínu", badge: taskCounts.overdue, tone: "warning" as const },
      { id: "completed", label: "Hotovo", badge: taskCounts.completed },
    ],
    [taskCounts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.contactName ?? "").toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
    );
  }, [tasks, search]);

  const overdueCount = tasks.filter((t) => !t.completedAt && !!t.dueDate && isDueDateBeforeLocalToday(t.dueDate)).length;

  return (
    <div className={cx("space-y-3", deviceClass === "tablet" && "max-w-2xl mx-auto")}>
      <SearchBar value={search} onChange={setSearch} placeholder="Hledat úkol…" />

      <FilterChips
        value={taskFilter}
        onChange={(id) => onFilterChange(id as TaskFilter)}
        options={filterOptions}
      />

      {/* Overdue banner */}
      {overdueCount > 0 && taskFilter !== "overdue" && taskFilter !== "completed" ? (
        <MobileCard className="border-rose-200 bg-rose-50/50 p-3.5">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="text-rose-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-rose-800">
                {overdueCount} {overdueCount === 1 ? "úkol" : overdueCount < 5 ? "úkoly" : "úkolů"} po termínu
              </p>
            </div>
            <button
              type="button"
              onClick={() => onFilterChange("overdue")}
              className="text-xs font-bold text-rose-700 min-h-[44px] px-3 rounded-lg border border-rose-200 bg-[color:var(--wp-surface-card)] shrink-0"
            >
              Zobrazit
            </button>
          </div>
        </MobileCard>
      ) : null}

      {/* Task list */}
      {!refreshing && filtered.length === 0 ? (
        <EmptyState
          title="Žádné úkoly"
          description={search ? "Žádné výsledky hledání." : "V tomto filtru nejsou žádné položky."}
        />
      ) : filtered.length > 0 ? (
        <VirtualizedColumn
          count={filtered.length}
          estimateSize={118}
          enabled={filtered.length >= TASK_LIST_VIRTUAL_THRESHOLD}
          fallback={filtered.map((task) => (
            <TaskRowCard
              key={task.id}
              task={task}
              todayStr={todayStr}
              onToggleTask={onToggleTask}
              onSelectTask={setSelectedTask}
            />
          ))}
        >
          {(index) => {
            const task = filtered[index];
            if (!task) return null;
            return (
              <div className="pb-3">
                <TaskRowCard
                  task={task}
                  todayStr={todayStr}
                  onToggleTask={onToggleTask}
                  onSelectTask={setSelectedTask}
                />
              </div>
            );
          }}
        </VirtualizedColumn>
      ) : null}

      {/* Task detail bottom sheet */}
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
