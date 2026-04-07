"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Link as LinkIcon, Copy, Check, ChevronRight, RefreshCw, Loader2 } from "lucide-react";
import type { PublicBookingSettingsDTO } from "@/app/actions/public-booking-settings";
import {
  getPublicBookingSettings,
  savePublicBookingSettings,
  regeneratePublicBookingToken,
} from "@/app/actions/public-booking-settings";
import type { BookingWeeklyAvailability } from "@/lib/db/schema-for-client";
import { defaultBookingAvailability } from "@/lib/public-booking/defaults";
import { useToast } from "@/app/components/Toast";

const ISO_LABELS: { iso: number; label: string }[] = [
  { iso: 1, label: "Po" },
  { iso: 2, label: "Út" },
  { iso: 3, label: "St" },
  { iso: 4, label: "Čt" },
  { iso: 5, label: "Pá" },
  { iso: 6, label: "So" },
  { iso: 7, label: "Ne" },
];

function firstWindow(av: BookingWeeklyAvailability | null): { start: string; end: string } {
  if (!av) return { start: "09:00", end: "17:00" };
  for (const k of ["1", "2", "3", "4", "5", "6", "7"]) {
    const w = av[k]?.[0];
    if (w?.start && w?.end) return { start: w.start, end: w.end };
  }
  return { start: "09:00", end: "17:00" };
}

function daysFromAvailability(av: BookingWeeklyAvailability | null): Record<number, boolean> {
  const d: Record<number, boolean> = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false };
  if (!av) {
    for (let i = 1; i <= 5; i++) d[i] = true;
    return d;
  }
  for (let i = 1; i <= 7; i++) {
    d[i] = !!(av[String(i)]?.length);
  }
  if (!Object.values(d).some(Boolean)) {
    for (let i = 1; i <= 5; i++) d[i] = true;
  }
  return d;
}

function buildAvailability(
  days: Record<number, boolean>,
  start: string,
  end: string,
): BookingWeeklyAvailability {
  const w = [{ start, end }];
  const out: BookingWeeklyAvailability = {};
  for (let i = 1; i <= 7; i++) {
    if (days[i]) out[String(i)] = [...w];
  }
  return Object.keys(out).length ? out : defaultBookingAvailability();
}

const labelClass = "block text-[11px] font-black uppercase tracking-widest text-indigo-200 mb-2 ml-1";
/** Světlé pole na fialovém panelu — kontrastní hodnoty v number/time inputech v prohlížeči. */
const inputClass =
  "w-full px-3 py-2.5 rounded-xl border border-white/30 bg-white/95 text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-white/50 min-h-[44px] placeholder:text-slate-400 dark:bg-white/95 dark:text-slate-900";

type Props = {
  initial: PublicBookingSettingsDTO;
  canonicalBaseUrl: string;
};

export function PublicBookingSetupBlock({ initial, canonicalBaseUrl }: Props) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.publicBookingEnabled);
  const [token, setToken] = useState(initial.publicBookingToken);
  const [slotMinutes, setSlotMinutes] = useState(initial.bookingSlotMinutes);
  const [bufferMinutes, setBufferMinutes] = useState(initial.bookingBufferMinutes);
  const win = firstWindow(initial.bookingAvailability ?? defaultBookingAvailability());
  const [workStart, setWorkStart] = useState(win.start);
  const [workEnd, setWorkEnd] = useState(win.end);
  const [days, setDays] = useState(() => daysFromAvailability(initial.bookingAvailability));

  const [saving, setSaving] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullLink = useMemo(() => {
    if (!canonicalBaseUrl || !token || !enabled) return "";
    const base = canonicalBaseUrl.replace(/\/$/, "");
    return `${base}/rezervace/${token}`;
  }, [canonicalBaseUrl, token, enabled]);

  const handleCopyLink = useCallback(() => {
    if (!fullLink) return;
    void navigator.clipboard.writeText(fullLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullLink]);

  const persist = useCallback(async () => {
    const availability = buildAvailability(days, workStart, workEnd);
    setSaving(true);
    try {
      const res = await savePublicBookingSettings({
        enabled,
        slotMinutes,
        bufferMinutes,
        availability,
      });
      if (!res.ok) {
        toast.showToast(res.error);
        return;
      }
      if (res.token) setToken(res.token);
      toast.showToast("Nastavení rezervací uloženo.");
    } catch (e) {
      toast.showToast(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }, [enabled, slotMinutes, bufferMinutes, days, workStart, workEnd, toast]);

  const handleRegenerate = useCallback(async () => {
    setRegenLoading(true);
    try {
      const res = await regeneratePublicBookingToken();
      if (!res.ok) {
        toast.showToast(res.error);
        return;
      }
      setToken(res.token);
      const fresh = await getPublicBookingSettings();
      setEnabled(fresh.publicBookingEnabled);
      toast.showToast("Odkaz byl obnoven — starý přestane fungovat.");
    } catch (e) {
      toast.showToast(e instanceof Error ? e.message : "Akce selhala.");
    } finally {
      setRegenLoading(false);
    }
  }, [toast]);

  const toggleDay = (iso: number) => {
    setDays((d) => ({ ...d, [iso]: !d[iso] }));
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[24px] p-6 text-white shadow-lg relative overflow-hidden">
        <LinkIcon className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10 pointer-events-none" aria-hidden />
        <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-3 flex items-center gap-2">
          Veřejný rezervační odkaz
        </h3>
        <p className="text-sm font-bold text-indigo-50 mb-2 leading-relaxed">
          Klienti bez přihlášení vyberou termín; schůzka se zapíše do vašeho kalendáře v CRM. Slouží jen k domluvě administrativního termínu.
        </p>
        <p className="text-xs text-indigo-100/95 mb-4 leading-relaxed">
          Odkaz pošlete klientovi e-mailem nebo jinou zprávou — otevře jednoduchou stránku (podobně jako Calendly), kde si zvolí volný čas a vyplní kontakt.
        </p>
        <p className="text-xs text-indigo-100/90 mb-3 leading-relaxed border border-white/15 rounded-xl p-3 bg-black/10">
          <strong className="font-bold text-white">Obsazenost:</strong> z událostí v kalendáři Aidvisory přiřazených vám. Máte-li v nastavení zapojený <strong className="font-bold text-white">Google Kalendář</strong>, slučujeme i jeho volno/obsazeno z Google API — klient vidí jen výsledné volné časy, nikoli názvy ani účastníky vašich jiných schůzek.
        </p>
        <div className="text-xs text-indigo-100/95 mb-4 leading-relaxed border border-white/15 rounded-xl p-3 bg-black/10">
          <p className="font-black uppercase tracking-widest text-indigo-200 mb-2">Jak odkaz zprovoznit</p>
          <ol className="list-decimal list-inside space-y-1.5 font-semibold">
            <li>Zaškrtněte „Zapnout veřejnou rezervaci“.</li>
            <li>Nastavte délku slotu, dny a hodiny → klikněte <strong className="text-white">Uložit nastavení rezervací</strong>.</li>
            <li>Zkopírujte odkaz výše a pošlete klientovi (e-mail, SMS).</li>
            <li>Ověřte si stránku v anonymním okně prohlížeče — měly by se zobrazit volné termíny.</li>
          </ol>
        </div>

        <label className="flex items-center gap-3 cursor-pointer min-h-[44px] mb-4">
          <input
            type="checkbox"
            className="w-5 h-5 rounded border-white/40 text-indigo-600 focus:ring-indigo-300"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm font-bold">Zapnout veřejnou rezervaci</span>
        </label>

        {enabled && (
          <>
            <div className="bg-black/20 border border-white/25 p-3 rounded-xl flex items-center justify-between gap-2 backdrop-blur-md mb-3 min-h-[44px]">
              <span className="min-w-0 text-xs font-semibold text-white break-all [overflow-wrap:anywhere]">
                {fullLink || "Nejprve uložte nastavení — vygeneruje se odkaz."}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!fullLink}
                className="w-10 h-10 rounded-lg bg-[color:var(--wp-surface-card)]/20 flex items-center justify-center hover:bg-[color:var(--wp-surface-card)]/30 transition-colors flex-shrink-0 min-h-[44px] min-w-[44px] disabled:opacity-40"
                title="Kopírovat odkaz"
              >
                {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
              </button>
            </div>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenLoading}
              className="text-xs font-black uppercase tracking-widest text-white/90 hover:text-white flex items-center gap-2 min-h-[44px] mb-4"
            >
              {regenLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Vygenerovat nový odkaz (starý přestane platit)
            </button>
          </>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass}>Délka slotu (min)</label>
            <input
              type="number"
              min={15}
              max={120}
              step={5}
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(parseInt(e.target.value, 10) || 30)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Odstup od schůzek (min)</label>
            <input
              type="number"
              min={0}
              max={120}
              step={5}
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(parseInt(e.target.value, 10) || 0)}
              className={inputClass}
            />
          </div>
        </div>

        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-2">Dny a hodiny nabídky (Europe/Prague)</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {ISO_LABELS.map(({ iso, label }) => (
            <button
              key={iso}
              type="button"
              onClick={() => toggleDay(iso)}
              className={`min-h-[44px] min-w-[44px] px-3 rounded-xl text-xs font-black uppercase border transition-colors ${
                days[iso]
                  ? "bg-white text-indigo-700 border-white"
                  : "bg-transparent text-white/80 border-white/30 hover:border-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass}>Od</label>
            <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Do</label>
            <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} className={inputClass} />
          </div>
        </div>

        <button
          type="button"
          onClick={persist}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-xs font-black uppercase tracking-widest min-h-[44px] flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {saving ? "Ukládám…" : "Uložit nastavení rezervací"}
        </button>

        <Link
          href="/portal/calendar"
          className="mt-4 text-xs font-black uppercase tracking-widest text-white hover:text-indigo-200 transition-colors flex items-center gap-1 min-h-[44px] inline-flex"
        >
          Otevřít kalendář v CRM <ChevronRight size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
