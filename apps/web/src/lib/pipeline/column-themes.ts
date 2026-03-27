/**
 * Shared pipeline stage styling — keep mobile [`PipelineScreen`] in sync with web [`PipelineBoard`].
 */
export const PIPELINE_COLUMN_THEMES = [
  {
    color: "bg-emerald-50/80 dark:bg-emerald-950/70",
    textColor: "text-emerald-900 dark:text-emerald-100",
    borderColor: "border-emerald-100 dark:border-emerald-900/80",
    solidBg: "bg-emerald-600 dark:bg-emerald-800",
    accent: "border-b-emerald-500 dark:border-b-emerald-700",
    mobileBorderL: "border-l-emerald-600 dark:border-l-emerald-700",
    mobileHeaderBar: "bg-emerald-600 dark:bg-emerald-800",
  },
  {
    color: "bg-sky-50/80 dark:bg-sky-950/65",
    textColor: "text-sky-900 dark:text-sky-100",
    borderColor: "border-sky-100 dark:border-sky-900/75",
    solidBg: "bg-sky-600 dark:bg-sky-800",
    accent: "border-b-sky-500 dark:border-b-sky-700",
    mobileBorderL: "border-l-sky-600 dark:border-l-sky-700",
    mobileHeaderBar: "bg-sky-600 dark:bg-sky-800",
  },
  {
    color: "bg-indigo-50/80 dark:bg-indigo-950/70",
    textColor: "text-indigo-900 dark:text-indigo-100",
    borderColor: "border-indigo-100 dark:border-indigo-950/80",
    solidBg: "bg-indigo-600 dark:bg-indigo-800",
    accent: "border-b-indigo-500 dark:border-b-indigo-700",
    mobileBorderL: "border-l-indigo-600 dark:border-l-indigo-700",
    mobileHeaderBar: "bg-indigo-600 dark:bg-indigo-800",
  },
  {
    color: "bg-amber-50/80 dark:bg-amber-950/60",
    textColor: "text-amber-950 dark:text-amber-100",
    borderColor: "border-amber-100 dark:border-amber-900/70",
    solidBg: "bg-amber-600 dark:bg-amber-800",
    accent: "border-b-amber-500 dark:border-b-amber-700",
    mobileBorderL: "border-l-amber-600 dark:border-l-amber-700",
    mobileHeaderBar: "bg-amber-600 dark:bg-amber-800",
  },
  {
    color: "bg-rose-50/80 dark:bg-rose-950/65",
    textColor: "text-rose-900 dark:text-rose-100",
    borderColor: "border-rose-100 dark:border-rose-950/75",
    solidBg: "bg-rose-600 dark:bg-rose-800",
    accent: "border-b-rose-500 dark:border-b-rose-700",
    mobileBorderL: "border-l-rose-600 dark:border-l-rose-700",
    mobileHeaderBar: "bg-rose-600 dark:bg-rose-800",
  },
  {
    color: "bg-violet-50/80 dark:bg-violet-950/65",
    textColor: "text-violet-900 dark:text-violet-100",
    borderColor: "border-violet-100 dark:border-violet-950/75",
    solidBg: "bg-violet-600 dark:bg-violet-800",
    accent: "border-b-violet-500 dark:border-b-violet-700",
    mobileBorderL: "border-l-violet-600 dark:border-l-violet-700",
    mobileHeaderBar: "bg-violet-600 dark:bg-violet-800",
  },
] as const;

export type PipelineColumnTheme = (typeof PIPELINE_COLUMN_THEMES)[number];

export function getPipelineColumnTheme(stageIndex: number): PipelineColumnTheme {
  const n = PIPELINE_COLUMN_THEMES.length;
  const i = ((stageIndex % n) + n) % n;
  return PIPELINE_COLUMN_THEMES[i];
}
