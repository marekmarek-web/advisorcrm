/**
 * Shared pipeline stage styling — keep mobile [`PipelineScreen`] in sync with web [`PipelineBoard`].
 */
export const PIPELINE_COLUMN_THEMES = [
  {
    color: "bg-emerald-50/80",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-100",
    solidBg: "bg-emerald-500",
    accent: "border-b-emerald-400",
    mobileBorderL: "border-l-emerald-500",
    mobileHeaderBar: "bg-emerald-500",
  },
  {
    color: "bg-blue-50/80",
    textColor: "text-blue-700",
    borderColor: "border-blue-100",
    solidBg: "bg-blue-500",
    accent: "border-b-blue-400",
    mobileBorderL: "border-l-blue-500",
    mobileHeaderBar: "bg-blue-500",
  },
  {
    color: "bg-indigo-50/80",
    textColor: "text-indigo-700",
    borderColor: "border-indigo-100",
    solidBg: "bg-indigo-500",
    accent: "border-b-indigo-400",
    mobileBorderL: "border-l-indigo-500",
    mobileHeaderBar: "bg-indigo-500",
  },
  {
    color: "bg-amber-50/80",
    textColor: "text-amber-700",
    borderColor: "border-amber-100",
    solidBg: "bg-amber-500",
    accent: "border-b-amber-400",
    mobileBorderL: "border-l-amber-500",
    mobileHeaderBar: "bg-amber-500",
  },
  {
    color: "bg-rose-50/80",
    textColor: "text-rose-700",
    borderColor: "border-rose-100",
    solidBg: "bg-rose-500",
    accent: "border-b-rose-400",
    mobileBorderL: "border-l-rose-500",
    mobileHeaderBar: "bg-rose-500",
  },
  {
    color: "bg-purple-50/80",
    textColor: "text-purple-700",
    borderColor: "border-purple-100",
    solidBg: "bg-purple-500",
    accent: "border-b-purple-400",
    mobileBorderL: "border-l-purple-500",
    mobileHeaderBar: "bg-purple-500",
  },
] as const;

export type PipelineColumnTheme = (typeof PIPELINE_COLUMN_THEMES)[number];

export function getPipelineColumnTheme(stageIndex: number): PipelineColumnTheme {
  const n = PIPELINE_COLUMN_THEMES.length;
  const i = ((stageIndex % n) + n) % n;
  return PIPELINE_COLUMN_THEMES[i];
}
