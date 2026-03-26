/**
 * Sdílené vizuální presety tlačítek (Aidvisora design system).
 * Barvy z --aidv-* v aidvisora-theme.css.
 * Kanonický vzhled primárního „vytvořit“ viz CreateActionButton + createActionButtonSurfaceClassName.
 */

import { createActionButtonSurfaceClassName } from "@/lib/ui/create-action-button-styles";

/** Primární „+ Nový …“ – stejné třídy jako u CreateActionButton (pro Link/komplexní wrapper bez duplikace hex). */
export const createActionButtonClassName = createActionButtonSurfaceClassName;

/** Kompaktní create: stejná typografie a barvy, menší horizontální padding na úzkých layoutech. */
export const createActionButtonClassNameCompact = [
  createActionButtonSurfaceClassName,
  "px-4 sm:px-6 py-3 sm:py-3.5",
].join(" ");

/** Dashboard karty + header „Otevřít asistenta“ – odlišná od create (indigo). */
export const dashboardPrimaryCtaClassName =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-white no-underline shadow-md shadow-indigo-900/20 transition-all hover:bg-aidv-dashboard-cta-hover active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aidv-dashboard-cta-ring)] focus-visible:ring-offset-2 bg-aidv-dashboard-cta";

/** Stejné jako dashboardPrimaryCta, bez uppercase (např. delší popisek). */
export const dashboardPrimaryCtaClassNameNav =
  "group flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aidv-dashboard-cta-ring)] focus-visible:ring-offset-2 bg-aidv-dashboard-cta hover:bg-aidv-dashboard-cta-hover hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]";
