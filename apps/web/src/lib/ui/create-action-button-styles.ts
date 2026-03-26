import clsx from "clsx";

/** Vnější plášť primárního create tlačítka (UX UI/button.txt, barvy --aidv-create-*). */
export const createActionButtonSurfaceClassName = clsx(
  "relative inline-flex items-center justify-center gap-2",
  "px-6 py-3.5 min-h-[44px] box-border",
  "bg-aidv-create text-white",
  "rounded-[14px]",
  "text-xs font-black uppercase tracking-[0.15em]",
  "shadow-lg shadow-slate-900/20",
  "transition-all duration-300 ease-out",
  "hover:bg-aidv-create-hover hover:shadow-indigo-500/25 hover:-translate-y-0.5",
  "active:scale-[0.96] active:translate-y-0 active:shadow-sm",
  "disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-slate-900/20",
  "overflow-hidden group no-underline",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400",
);
