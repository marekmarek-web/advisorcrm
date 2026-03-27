import clsx from "clsx";

/** Vnější plášť primárního create tlačítka (UX UI/button.txt, barvy --aidv-create-*). */
export const createActionButtonSurfaceClassName = clsx(
  "relative inline-flex items-center justify-center gap-2",
  "px-5 py-3 min-h-[48px] box-border",
  "rounded-2xl",
  "text-xs font-black uppercase tracking-[0.15em]",
  "text-white",
  /* Světlý motiv: klasická create barva; tmavý: jako dlaždice „Nástroje poradce“ v sidebaru */
  "bg-aidv-create",
  "dark:border dark:border-fuchsia-500/25 dark:bg-gradient-to-b dark:from-fuchsia-500/18 dark:to-indigo-500/12 dark:shadow-inner dark:shadow-black/20",
  "shadow-lg shadow-slate-900/20 dark:shadow-md dark:shadow-black/40",
  "transition-all duration-300 ease-out",
  "hover:bg-aidv-create-hover hover:shadow-indigo-500/25 hover:-translate-y-0.5",
  "dark:hover:from-fuchsia-500/24 dark:hover:to-indigo-500/16 dark:hover:border-fuchsia-400/35 dark:hover:shadow-lg dark:hover:shadow-black/50",
  "active:scale-[0.96] active:translate-y-0 active:shadow-sm",
  "disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-slate-900/20",
  "overflow-hidden group no-underline",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 dark:focus-visible:ring-fuchsia-400/50",
);
