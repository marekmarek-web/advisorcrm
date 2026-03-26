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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&display=swap');
        .ticw-font { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
      `}</style>
      <div
        className="ticw-font w-full rounded-[32px] border border-[#E2E8F0] bg-white p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.03),0_0_1px_rgba(15,23,42,0.04)] transition-all duration-[400ms] md:p-10 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#5A4BFF] via-purple-400 to-emerald-400 opacity-80" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 pt-1">
          <h2 className="text-base md:text-lg font-extrabold text-[#0B1021] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-[#5A4BFF] shrink-0">
              <CalendarHeart size={20} aria-hidden />
            </div>
            Dnes v kalendáři
          </h2>
          {showViewCalendarLink ? (
            <Link
              href="/portal/calendar"
              className="text-xs font-bold text-[#5A4BFF] uppercase tracking-widest hover:underline flex items-center gap-1 min-h-[44px] sm:min-h-0 self-start sm:self-auto"
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
                ? "bg-rose-50 border-rose-100/80 shadow-[0_4px_20px_-4px_rgba(244,63,94,0.15)] scale-[1.02]"
                : "bg-slate-50/50 border-slate-100 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-4 mb-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                  holidayActive
                    ? "bg-rose-500 text-white shadow-md shadow-rose-200"
                    : "bg-white text-slate-400 border border-slate-200/60 shadow-sm"
                }`}
              >
                <Landmark size={22} strokeWidth={holidayActive ? 2.5 : 2} aria-hidden />
              </div>
              <div className="min-w-0">
                <p
                  className={`text-[10px] font-extrabold uppercase tracking-widest mb-0.5 ${
                    holidayActive ? "text-rose-500" : "text-slate-400"
                  }`}
                >
                  Státní svátek
                </p>
                <p
                  className={`font-bold text-lg leading-tight ${
                    holidayActive ? "text-rose-950" : "text-[#0B1021]"
                  }`}
                >
                  {holidayActive ? czPublicHolidayToday : "Žádný"}
                </p>
                <p
                  className={`text-xs font-medium mt-0.5 ${
                    holidayActive ? "text-rose-700" : "text-slate-500"
                  }`}
                >
                  {holidayActive ? "Státní svátek" : "(běžný pracovní den)"}
                </p>
              </div>
            </div>
          </div>

          {/* Svátek podle jmen */}
          <div className="rounded-[24px] p-6 border border-slate-100 bg-white hover:border-indigo-100 hover:shadow-[0_8px_24px_-8px_rgba(90,75,255,0.15)] transition-all duration-300 flex flex-col justify-center group cursor-default">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#5A4BFF] flex items-center justify-center shrink-0 border border-indigo-100/50 group-hover:scale-110 group-hover:bg-[#5A4BFF] group-hover:text-white transition-all duration-300">
                <Gift size={22} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">
                  Svátek slaví
                </p>
                {nameLine ? (
                  <p className="font-bold text-xl md:text-2xl text-[#0B1021] tracking-tight break-words">
                    {nameLine}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-500 mt-0.5">
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
                ? "bg-gradient-to-br from-amber-50 to-orange-50 border-orange-200/50 shadow-[0_8px_24px_-8px_rgba(249,115,22,0.2)]"
                : "bg-slate-50/50 border-slate-100 border-dashed"
            }`}
          >
            {hasBirthdays ? (
              <Cake
                size={120}
                className="absolute -right-6 -bottom-6 text-orange-500/5 rotate-12 pointer-events-none"
                aria-hidden
              />
            ) : null}

            <div className="relative z-10 flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                  hasBirthdays
                    ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                    : "bg-slate-100/50 text-slate-400"
                }`}
              >
                <Cake size={22} strokeWidth={hasBirthdays ? 2.5 : 2} aria-hidden />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p
                    className={`text-[10px] font-extrabold uppercase tracking-widest ${
                      hasBirthdays ? "text-orange-600" : "text-slate-400"
                    }`}
                  >
                    Narozeniny klientů
                  </p>
                  {hasBirthdays ? (
                    <span className="px-2 py-0.5 bg-orange-200/50 text-orange-700 text-[10px] font-black rounded-lg shrink-0">
                      {birthdayClientsBadgeLabel(birthdaysToday.length)}
                    </span>
                  ) : null}
                </div>

                {!hasBirthdays ? (
                  <p className="text-sm font-medium text-slate-500 mt-1">
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
                          className="flex items-center gap-2.5 min-w-0 rounded-lg -m-1 p-1 hover:bg-orange-100/40 transition-colors"
                        >
                          <div
                            className={`w-8 h-8 rounded-full ${AVATAR_COLORS[index % AVATAR_COLORS.length]} text-white flex items-center justify-center text-xs font-bold shadow-sm shrink-0`}
                          >
                            {initials(bday.firstName, bday.lastName)}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="font-bold text-sm text-[#0B1021] leading-none">
                              {bday.firstName} {bday.lastName}
                            </p>
                            <p className="text-[11px] font-semibold text-orange-600 mt-0.5">
                              {bday.age} let
                            </p>
                          </div>
                        </Link>
                        <Link
                          href={`/portal/messages?contact=${bday.id}`}
                          aria-label={`Napsat zprávu: ${bday.firstName} ${bday.lastName}`}
                          className="min-h-[44px] min-w-[44px] shrink-0 rounded-full bg-white border border-orange-200 text-orange-500 flex items-center justify-center hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-all shadow-sm"
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
    </>
  );
}
