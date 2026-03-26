/**
 * Sdílené vizuální presety tlačítek (Aidvisora design system).
 * Barvy z --aidv-* v aidvisora-theme.css.
 */

/** Primární „+ Nový …“ / create akce (Nový klient, úkol, zápis, aktivita, …). */
export const createActionButtonClassName =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide text-white no-underline shadow-md shadow-slate-900/15 transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 bg-aidv-create hover:bg-aidv-create-hover";

/** Kompaktní create (toolbar, kde je menší výška na md+). */
export const createActionButtonClassNameCompact =
  "inline-flex items-center justify-center gap-1.5 md:gap-2 min-h-[44px] md:min-h-0 px-3 md:px-5 py-2 md:py-2.5 rounded-[var(--wp-radius-sm)] text-xs font-bold uppercase tracking-wide text-white shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 bg-aidv-create hover:bg-aidv-create-hover";

/** Dashboard karty + header „Nový“ – stejná rodina jako AI „Otevřít asistenta“. */
export const dashboardPrimaryCtaClassName =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-white no-underline shadow-md shadow-indigo-900/20 transition-all hover:bg-aidv-dashboard-cta-hover active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aidv-dashboard-cta-ring)] focus-visible:ring-offset-2 bg-aidv-dashboard-cta";

/** Stejné jako dashboardPrimaryCta, bez uppercase (např. QuickNewMenu text-sm). */
export const dashboardPrimaryCtaClassNameNav =
  "group flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aidv-dashboard-cta-ring)] focus-visible:ring-offset-2 bg-aidv-dashboard-cta hover:bg-aidv-dashboard-cta-hover hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]";
