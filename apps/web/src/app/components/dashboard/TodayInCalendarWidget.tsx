"use client";

import Link from "next/link";
import {
  Landmark,
  Gift,
  Cake,
  ChevronRight,
  Send,
  CalendarHeart,
} from "lucide-react";

export type TodayInCalendarBirthdayRow = {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
};

export type TodayInCalendarWidgetProps = {
  czPublicHolidayToday: string | null;
  czNameDaysToday: string[];
  birthdaysToday: TodayInCalendarBirthdayRow[];
  /** Desktop: show link to full calendar. Mobile can hide if redundant. */
  showViewCalendarLink?: boolean;
};

const AVATAR_COLORS = [
  "bg-orange-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-sky-500",
] as const;

function initials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || "?";
}

function birthdayClientsBadgeLabel(count: number): string {
  if (count === 1) return "1 KLIENT";
  if (count >= 2 && count <= 4) return `${count} KLIENTI`;
  return `${count} KLIENTŮ`;
}

export function TodayInCalendarWidget({
  czPublicHolidayToday,
  czNameDaysToday,
  birthdaysToday,
  showViewCalendarLink = true,
}: TodayInCalendarWidgetProps) {
  const holidayActive = czPublicHolidayToday != null;
  const hasBirthdays = birthdaysToday.length > 0;
  const nameLine =
    czNameDaysToday.length === 0 ? null : czNameDaysToday.join(", ");

  return (
    <div
      className="w-full rounded-[32px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.03),0_0_1px_rgba(15,23,42,0.04)] transition-all duration-[400ms] md:p-10 relative overflow-hidden dark:shadow-[0_4px_28px_-8px_rgba(0,0,0,0.45),0_0_1px_rgba(255,255,255,0.06)] [font-family:var(--wp-font)]"
    >
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#5A4BFF] via-purple-400 to-emerald-400 opacity-80 dark:opacity-90" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 pt-1">
          <h2 className="text-base md:text-lg font-extrabold text-[color:var(--wp-text)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center text-[#5A4BFF] dark:text-indigo-300 shrink-0">
              <CalendarHeart size={20} aria-hidden />
            </div>
            Dnes v kalendáři
          </h2>
          {showViewCalendarLink ? (
            <Link
              href="/portal/calendar"
              className="text-xs font-bold text-[#5A4BFF] dark:text-indigo-400 uppercase tracking-widest hover:underline flex items-center gap-1 min-h-[44px] sm:min-h-0 self-start sm:self-auto"
            >
              Zobrazit kalendář <ChevronRight size={14} aria-hidden />
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Státní svátek */}
          <div
            className={`rounded-[24px] p-6 border transition-all duration-500 flex flex-col justify-center ${
              holidayActive
                ? "bg-rose-50 dark:bg-rose-950/45 border-rose-100/80 dark:border-rose-500/25 shadow-[0_4px_20px_-4px_rgba(244,63,94,0.15)] dark:shadow-[0_4px_20px_-4px_rgba(244,63,94,0.2)] scale-[1.02]"
                : "bg-[color:var(--wp-surface-muted)] border-[color:var(--wp-border)] hover:bg-[color:var(--wp-surface-raised)]"
            }`}
          >
            <div className="flex items-center gap-4 mb-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                  holidayActive
                    ? "bg-rose-500 text-white shadow-md shadow-rose-200 dark:shadow-rose-900/40"
                    : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-icon-default)] border border-[color:var(--wp-surface-card-border)] shadow-sm"
                }`}
              >
                <Landmark size={22} strokeWidth={holidayActive ? 2.5 : 2} aria-hidden />
              </div>
              <div className="min-w-0">
                <p
                  className={`text-[10px] font-extrabold uppercase tracking-widest mb-0.5 ${
                    holidayActive ? "text-rose-500 dark:text-rose-400" : "text-[color:var(--wp-text-tertiary)]"
                  }`}
                >
                  Státní svátek
                </p>
                <p
                  className={`font-bold text-lg leading-tight ${
                    holidayActive
                      ? "text-rose-950 dark:text-rose-100"
                      : "text-[color:var(--wp-text)]"
                  }`}
                >
                  {holidayActive ? czPublicHolidayToday : "Žádný"}
                </p>
                <p
                  className={`text-xs font-medium mt-0.5 ${
                    holidayActive ? "text-rose-700 dark:text-rose-300/90" : "text-[color:var(--wp-text-secondary)]"
                  }`}
                >
                  {holidayActive ? "Státní svátek" : "(běžný pracovní den)"}
                </p>
              </div>
            </div>
          </div>

          {/* Svátek podle jmen */}
          <div className="rounded-[24px] p-6 border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] dark:bg-[color:var(--wp-surface-muted)] hover:border-indigo-100 dark:hover:border-indigo-500/30 hover:shadow-[0_8px_24px_-8px_rgba(90,75,255,0.15)] dark:hover:shadow-[0_8px_24px_-8px_rgba(99,102,241,0.2)] transition-all duration-300 flex flex-col justify-center group cursor-default">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-[#5A4BFF] dark:text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-100/50 dark:border-indigo-500/25 group-hover:scale-110 group-hover:bg-[#5A4BFF] dark:group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                <Gift size={22} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold text-[color:var(--wp-text-tertiary)] uppercase tracking-widest mb-0.5">
                  Svátek slaví
                </p>
                {nameLine ? (
                  <p className="font-bold text-xl md:text-2xl text-[color:var(--wp-text)] tracking-tight break-words">
                    {nameLine}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mt-0.5">
                    Dnes žádné jméno v kalendáři
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Narozeniny klientů */}
          <div
            className={`rounded-[24px] p-6 border transition-all duration-500 flex flex-col justify-center relative overflow-hidden ${
              hasBirthdays
                ? "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/35 border-orange-200/50 dark:border-orange-500/25 shadow-[0_8px_24px_-8px_rgba(249,115,22,0.2)] dark:shadow-[0_8px_24px_-8px_rgba(249,115,22,0.15)]"
                : "bg-[color:var(--wp-surface-muted)] border-[color:var(--wp-border)] border-dashed"
            }`}
          >
            {hasBirthdays ? (
              <Cake
                size={120}
                className="absolute -right-6 -bottom-6 text-orange-500/5 dark:text-orange-400/[0.07] rotate-12 pointer-events-none"
                aria-hidden
              />
            ) : null}

            <div className="relative z-10 flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                  hasBirthdays
                    ? "bg-orange-500 text-white shadow-md shadow-orange-200 dark:shadow-orange-950/50"
                    : "bg-[color:var(--wp-surface-inset)] text-[color:var(--wp-text-tertiary)]"
                }`}
              >
                <Cake size={22} strokeWidth={hasBirthdays ? 2.5 : 2} aria-hidden />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p
                    className={`text-[10px] font-extrabold uppercase tracking-widest ${
                      hasBirthdays ? "text-orange-600 dark:text-orange-400" : "text-[color:var(--wp-text-tertiary)]"
                    }`}
                  >
                    Narozeniny klientů
                  </p>
                  {hasBirthdays ? (
                    <span className="px-2 py-0.5 bg-orange-200/50 dark:bg-orange-500/20 text-orange-700 dark:text-orange-200 text-[10px] font-black rounded-lg shrink-0">
                      {birthdayClientsBadgeLabel(birthdaysToday.length)}
                    </span>
                  ) : null}
                </div>

                {!hasBirthdays ? (
                  <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mt-1">
                    Dnes nikdo z kontaktů nemá narozeniny.
                  </p>
                ) : (
                  <div className="space-y-3 mt-3">
                    {birthdaysToday.map((bday, index) => (
                      <div
                        key={bday.id}
                        className="flex items-center justify-between gap-2 group/bday"
                      >
                        <Link
                          href={`/portal/contacts/${bday.id}`}
                          className="flex items-center gap-2.5 min-w-0 rounded-lg -m-1 p-1 hover:bg-orange-100/40 dark:hover:bg-orange-500/15 transition-colors"
                        >
                          <div
                            className={`w-8 h-8 rounded-full ${AVATAR_COLORS[index % AVATAR_COLORS.length]} text-white flex items-center justify-center text-xs font-bold shadow-sm shrink-0`}
                          >
                            {initials(bday.firstName, bday.lastName)}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="font-bold text-sm text-[color:var(--wp-text)] leading-none">
                              {bday.firstName} {bday.lastName}
                            </p>
                            <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 mt-0.5">
                              {bday.age} let
                            </p>
                          </div>
                        </Link>
                        <Link
                          href={`/portal/messages?contact=${bday.id}`}
                          aria-label={`Napsat zprávu: ${bday.firstName} ${bday.lastName}`}
                          className="min-h-[44px] min-w-[44px] shrink-0 rounded-full bg-[color:var(--wp-surface)] border border-orange-200 dark:border-orange-500/40 text-orange-500 dark:text-orange-400 flex items-center justify-center hover:bg-orange-500 hover:text-white hover:border-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-sm"
                        >
                          <Send size={14} className="ml-0.5" aria-hidden />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
