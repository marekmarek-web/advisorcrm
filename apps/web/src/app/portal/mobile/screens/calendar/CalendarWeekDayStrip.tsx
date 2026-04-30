"use client";

import { formatDateLocal } from "@/app/portal/calendar/date-utils";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

/** Horizontální strip dnů aktuálního týdne (kotva = anchor). */
export function CalendarWeekDayStrip({
  weekDays,
  anchorDate,
  todayStr,
  onPickDay,
}: {
  weekDays: Date[];
  anchorDate: Date;
  todayStr: string;
  onPickDay: (d: Date) => void;
}) {
  const anchorKey = formatDateLocal(anchorDate);

  return (
    <div
      className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 no-scrollbar snap-x snap-mandatory sm:-mx-6 sm:px-6"
      role="tablist"
      aria-label="Dny v týdnu"
    >
      {weekDays.map((d) => {
        const key = formatDateLocal(d);
        const active = key === anchorKey;
        const isToday = key === todayStr;
        const dayLabel = d.toLocaleDateString("cs-CZ", { weekday: "short" }).replace(".", "");
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${dayLabel} ${d.getDate()}${isToday ? ", dnes" : ""}`}
            onClick={() => onPickDay(d)}
            className={cx(
              "grid h-[72px] w-[58px] shrink-0 snap-center place-items-center rounded-[24px] border text-center shadow-[0_14px_26px_-24px_rgba(15,23,42,.35)] transition-all active:scale-95",
              active
                ? "border-indigo-500 bg-indigo-600 text-white"
                : "border-slate-200/70 bg-white/80 text-slate-600 backdrop-blur-xl",
            )}
          >
            <span className="text-[10px] font-black uppercase tracking-[0.14em]">
              {dayLabel}
            </span>
            <span className="-mt-1 text-[20px] font-black tabular-nums">{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}
