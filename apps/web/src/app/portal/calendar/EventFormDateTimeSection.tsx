"use client";

import { useMemo, useState, useEffect } from "react";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { formatDateLocal } from "./date-utils";

const MONTH_NAMES = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

const WEEKDAYS_MON = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function parseLocalDateTime(iso: string): { date: string; hour: number; minute: number } {
  if (!iso || !iso.includes("T")) {
    const d = new Date();
    return {
      date: formatDateLocal(d),
      hour: 9,
      minute: 0,
    };
  }
  const [datePart, timePart = "09:00"] = iso.split("T");
  const [h = "9", m = "0"] = timePart.split(":");
  let hour = Number(h);
  let minute = Number(m);
  if (!Number.isFinite(hour)) hour = 9;
  if (!Number.isFinite(minute)) minute = 0;
  minute = Math.round(minute / 15) * 15;
  if (minute >= 60) {
    minute = 0;
    hour = Math.min(23, hour + 1);
  }
  return { date: datePart, hour: Math.min(23, Math.max(0, hour)), minute };
}

function composeLocalDateTime(date: string, hour: number, minute: number): string {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeInputValue(v: string): { hour: number; minute: number } | null {
  const [h, m] = (v || "").split(":");
  let hour = Number(h);
  let minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  hour = Math.min(23, Math.max(0, hour));
  minute = Math.round(minute / 15) * 15;
  if (minute >= 60) {
    minute = 0;
    hour = Math.min(23, hour + 1);
  }
  return { hour, minute };
}

function formatPrimaryLine(startIso: string, endIso: string, allDay: boolean): string {
  if (allDay) {
    const sd = startIso.slice(0, 10);
    const ed = endIso.slice(0, 10) || sd;
    const s = new Date(sd + "T12:00:00");
    const e = new Date(ed + "T12:00:00");
    return `${s.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${
      ed !== sd ? ` – ${e.toLocaleDateString("cs-CZ", { day: "numeric", month: "long" })}` : ""
    } (celý den)`;
  }
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date(start.getTime() + 60 * 60 * 1000);
  const dayPart = start.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const t0 = start.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const t1 = end.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  return `${dayPart}  ${t0} – ${t1}`;
}

function formatDateLongButton(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return dt.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function MiniMonthGrid({
  selectedDateStr,
  onSelect,
}: {
  selectedDateStr: string;
  onSelect: (dateStr: string) => void;
}) {
  const parsed = useMemo(() => {
    const [y, m, d] = selectedDateStr.split("-").map(Number);
    return { y, m: m - 1, d };
  }, [selectedDateStr]);

  const [viewYear, setViewYear] = useState(parsed.y);
  const [viewMonth, setViewMonth] = useState(parsed.m);

  useEffect(() => {
    setViewYear(parsed.y);
    setViewMonth(parsed.m);
  }, [parsed.y, parsed.m]);

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const last = new Date(viewYear, viewMonth + 1, 0);
    const count = last.getDate();
    let startDow = first.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const out: ({ empty: true } | { dateStr: string; day: number })[] = [];
    for (let i = 0; i < startDow; i++) out.push({ empty: true });
    for (let day = 1; day <= count; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      out.push({ dateStr, day });
    }
    return out;
  }, [viewYear, viewMonth]);

  function goPrev() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  }

  function goNext() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  }

  return (
    <div
      className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-2 mt-2 shadow-sm"
      role="grid"
      aria-label="Výběr dne"
    >
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <button
          type="button"
          onClick={goPrev}
          className="min-h-9 min-w-9 rounded-lg text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
          aria-label="Předchozí měsíc"
        >
          ‹
        </button>
        <span className="text-xs font-black text-[color:var(--wp-text)] uppercase tracking-wide">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="min-h-9 min-w-9 rounded-lg text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
          aria-label="Další měsíc"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS_MON.map((w) => (
          <div key={w} className="text-center text-[9px] font-black text-[color:var(--wp-text-tertiary)] py-1">
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if ("empty" in c && c.empty) {
            return <div key={`e-${i}`} className="h-8" />;
          }
          if (!("dateStr" in c)) return <div key={`u-${i}`} className="h-8" />;
          return (
            <button
              key={c.dateStr}
              type="button"
              onClick={() => onSelect(c.dateStr)}
              className={`h-8 rounded-full text-xs font-bold transition-colors
                ${c.dateStr === selectedDateStr
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                }`}
            >
              {c.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  startAt: string;
  endAt: string;
  allDay: boolean;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
  onChangeAllDay: (v: boolean) => void;
  startInvalid?: boolean;
  onClearStartInvalid?: () => void;
  eLabelClass: string;
  eInputClass: string;
  /** Skryje „Celý den“ (např. rychlý formulář). */
  hideAllDay?: boolean;
};

export function EventFormDateTimeSection({
  startAt,
  endAt,
  allDay,
  onChangeStart,
  onChangeEnd,
  onChangeAllDay,
  startInvalid,
  onClearStartInvalid,
  eLabelClass,
  eInputClass,
  hideAllDay = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState<null | "start" | "end">(null);

  useEffect(() => {
    if (!expanded) setCalendarOpen(null);
  }, [expanded]);

  const startP = useMemo(() => parseLocalDateTime(startAt), [startAt]);
  const endP = useMemo(() => parseLocalDateTime(endAt || startAt), [endAt, startAt]);

  const primary = useMemo(
    () => formatPrimaryLine(startAt || composeLocalDateTime(startP.date, startP.hour, startP.minute), endAt, allDay),
    [startAt, endAt, allDay, startP.date, startP.hour, startP.minute],
  );

  const setStartParts = (date: string, hour: number, minute: number) => {
    onChangeStart(composeLocalDateTime(date, hour, minute));
    onClearStartInvalid?.();
  };

  const setEndParts = (date: string, hour: number, minute: number) => {
    onChangeEnd(composeLocalDateTime(date, hour, minute));
  };

  const showTimed = hideAllDay || !allDay;

  return (
    <div className="bg-[color:var(--wp-surface-muted)] p-5 rounded-[24px] border border-[color:var(--wp-surface-card-border)] space-y-4">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-[color:var(--wp-text-tertiary)]" />
        <span className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
          Kdy se to koná?
        </span>
      </div>

      {!hideAllDay && (
        <label className="flex items-center gap-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => onChangeAllDay(e.target.checked)}
            className="rounded w-4 h-4 border-[color:var(--wp-border-strong)] text-indigo-600 focus:ring-indigo-500"
          />
          Celý den
        </label>
      )}

      {showTimed && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className="w-full text-left rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-3.5 transition-colors hover:border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 min-h-[44px]"
          >
            <p className="text-sm sm:text-base font-bold text-[color:var(--wp-text)] leading-snug">{primary}</p>
            <p className="text-xs text-[color:var(--wp-text-tertiary)] mt-1.5 font-medium">
              Časové pásmo: lokální čas zařízení · minuty jen po 15 min
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs font-bold text-indigo-600">
              {expanded ? (
                <>
                  <ChevronUp size={14} aria-hidden /> Skrýt výběr data a času
                </>
              ) : (
                <>
                  <ChevronDown size={14} aria-hidden /> Změnit datum a čas
                </>
              )}
            </div>
          </button>

          {expanded && (
            <div className="space-y-5 pt-1 border-t border-[color:var(--wp-surface-card-border)]/60">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <span className={eLabelClass}>Začátek</span>
                  <button
                    type="button"
                    onClick={() => setCalendarOpen((c) => (c === "start" ? null : "start"))}
                    className={`${eInputClass} flex min-h-[44px] items-center justify-between gap-2 text-left ${startInvalid ? "!border-red-400 !ring-red-100" : ""}`}
                  >
                    <span className="truncate text-sm font-bold">{formatDateLongButton(startP.date)}</span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-[color:var(--wp-text-tertiary)] transition-transform ${calendarOpen === "start" ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {calendarOpen === "start" && (
                    <MiniMonthGrid
                      selectedDateStr={startP.date}
                      onSelect={(dateStr) => {
                        setStartParts(dateStr, startP.hour, startP.minute);
                        setCalendarOpen(null);
                      }}
                    />
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] uppercase tracking-wide">
                      Čas (po 15 min)
                    </label>
                    <input
                      type="time"
                      step={900}
                      value={`${String(startP.hour).padStart(2, "0")}:${String(startP.minute).padStart(2, "0")}`}
                      onChange={(e) => {
                        const p = parseTimeInputValue(e.target.value);
                        if (!p) return;
                        setStartParts(startP.date, p.hour, p.minute);
                      }}
                      className={`${eInputClass} mt-1 min-h-[44px] font-mono tabular-nums`}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <span className={eLabelClass}>Konec</span>
                  <button
                    type="button"
                    onClick={() => setCalendarOpen((c) => (c === "end" ? null : "end"))}
                    className={`${eInputClass} flex min-h-[44px] items-center justify-between gap-2 text-left`}
                  >
                    <span className="truncate text-sm font-bold">{formatDateLongButton(endP.date)}</span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-[color:var(--wp-text-tertiary)] transition-transform ${calendarOpen === "end" ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {calendarOpen === "end" && (
                    <MiniMonthGrid
                      selectedDateStr={endP.date}
                      onSelect={(dateStr) => {
                        setEndParts(dateStr, endP.hour, endP.minute);
                        setCalendarOpen(null);
                      }}
                    />
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] uppercase tracking-wide">
                      Čas (po 15 min)
                    </label>
                    <input
                      type="time"
                      step={900}
                      value={`${String(endP.hour).padStart(2, "0")}:${String(endP.minute).padStart(2, "0")}`}
                      onChange={(e) => {
                        const p = parseTimeInputValue(e.target.value);
                        if (!p) return;
                        setEndParts(endP.date, p.hour, p.minute);
                      }}
                      className={`${eInputClass} mt-1 min-h-[44px] font-mono tabular-nums`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!hideAllDay && allDay && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={eLabelClass}>Od</label>
            <input
              type="date"
              value={startAt.slice(0, 10)}
              onChange={(e) => {
                const d = e.target.value;
                onChangeStart(`${d}T00:00`);
                onClearStartInvalid?.();
              }}
              className={`${eInputClass} ${startInvalid ? "!border-red-400 !ring-red-100" : ""}`}
            />
          </div>
          <div>
            <label className={eLabelClass}>Do</label>
            <input
              type="date"
              value={(endAt || startAt).slice(0, 10)}
              onChange={(e) => onChangeEnd(`${e.target.value}T23:59`)}
              className={eInputClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}
