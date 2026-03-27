import clsx from "clsx";

/**
 * Společný povrch primárních CTA: světlý motiv `bg-aidv-create` + bílý text;
 * tmavý motiv světlý panel z tokenů `--aidv-create-on-dark-*` (čitelnost na tmavém UI).
 * Bez velikosti/typografie – pro skládání vlastních tlačítek.
 */
/** Společný gradient + hover/disabled/focus – bez paddingu (ikony, kompaktní CTA). */
export const portalPrimaryGradientBaseClassName = clsx(
  "relative inline-flex items-center justify-center gap-2",
  "text-white",
  "bg-aidv-create shadow-lg shadow-slate-900/20",
  "dark:!bg-[color:var(--aidv-create-on-dark-bg)]",
  "dark:!text-[color:var(--aidv-create-on-dark-text)]",
  "dark:border dark:border-[color:var(--aidv-create-on-dark-border)]",
  "dark:shadow-lg dark:shadow-black/35",
  "transition-all duration-300 ease-out",
  "hover:bg-aidv-create-hover hover:shadow-indigo-500/25 hover:-translate-y-0.5",
  "dark:hover:!bg-[color:var(--aidv-create-on-dark-bg-hover)]",
  "dark:hover:border-[color:var(--aidv-create-on-dark-border-hover)]",
  "dark:hover:shadow-xl dark:hover:shadow-black/45",
  "active:scale-[0.96] active:translate-y-0 active:shadow-sm",
  "disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-slate-900/20",
  "dark:disabled:hover:shadow-black/25",
  "overflow-hidden group",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400",
  "dark:focus-visible:ring-indigo-400 dark:focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[color:var(--wp-bg)]",
);

/**
 * Běžné primární tlačítko portálu: „Uložit“, „Odeslat“, „Další“ (normální velikost písma, ne uppercase).
 */
export const portalPrimaryButtonClassName = clsx(
  portalPrimaryGradientBaseClassName,
  "min-h-[44px] box-border rounded-xl px-5 py-2.5 text-sm font-bold",
  "no-underline",
);

/** Čtvercové primární tlačítko (např. jen ikona +). */
export const portalPrimaryIconButtonClassName = clsx(
  portalPrimaryGradientBaseClassName,
  "inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl p-0 text-sm font-bold no-underline",
);

/**
 * Kanonické „Vytvořit“ (CreateActionButton): větší, uppercase, tracking.
 */
export const createActionButtonSurfaceClassName = clsx(
  portalPrimaryGradientBaseClassName,
  "px-5 py-3 min-h-[48px] box-border",
  "rounded-2xl",
  "text-xs font-black uppercase tracking-[0.15em]",
  "no-underline",
);
