"use client";

import { useEffect, useState } from "react";
import { CheckSquare, ChevronRight } from "lucide-react";
import { getTasksForDate, type TaskRow } from "@/app/actions/tasks";
import { MobileCard } from "@/app/shared/mobile-ui/primitives";

export function CalendarDayTasksStrip({
  dateStr,
  onOpenTasks,
}: {
  dateStr: string;
  onOpenTasks: () => void;
}) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getTasksForDate(dateStr)
      .then((rows) => {
        if (!cancelled) {
          setTasks(rows.filter((t) => !t.completedAt));
          setError(null);
        }
      })
      .catch((err) => {
        console.error("[CalendarDayTasksStrip] getTasksForDate failed", err);
        if (!cancelled) {
          setTasks([]);
          setError("Úkoly se nepodařilo načíst.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  const open = tasks.filter((t) => !t.completedAt);
  // V případě chyby zobrazíme lištu, aby uživatel věděl, že něco selhalo (dříve
  // se prázdný seznam tvářil jako „žádné úkoly dnes“).
  if (!loading && !error && open.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80 px-2 py-2">
      <button
        type="button"
        onClick={onOpenTasks}
        className="flex w-full min-h-[44px] items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-left shadow-sm active:bg-[color:var(--wp-surface-muted)]"
      >
        <CheckSquare size={18} className="shrink-0 text-indigo-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">Úkoly v den</p>
          <p className="truncate text-sm font-bold text-[color:var(--wp-text)]">
            {loading
              ? "Načítám…"
              : error
                ? error
                : `${open.length} otevřených úkolů`}
          </p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
      </button>
      {!loading && open.length > 0 ? (
        <MobileCard className="mt-2 max-h-[140px] overflow-y-auto py-0">
          <ul className="divide-y divide-[color:var(--wp-surface-card-border)]">
            {open.slice(0, 5).map((t) => (
              <li key={t.id} className="px-3 py-2 text-sm font-semibold text-[color:var(--wp-text)]">
                {t.title}
              </li>
            ))}
            {open.length > 5 ? (
              <li className="px-3 py-2 text-center text-xs font-bold text-indigo-600">+ další v úkolech</li>
            ) : null}
          </ul>
        </MobileCard>
      ) : null}
    </div>
  );
}
