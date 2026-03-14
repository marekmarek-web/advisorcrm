"use client";

export type WizardReviewRow = { label: string; value: string };

export function WizardReview({
  title = "Zkontrolujte údaje",
  subtitle,
  rows,
  icon: Icon,
}: {
  title?: string;
  subtitle?: string;
  rows: WizardReviewRow[];
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="flex flex-col">
      <div className="text-center mb-8">
        {Icon && (
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-4">
            <Icon size={32} className="text-slate-500" />
          </div>
        )}
        <h3 className="text-xl font-black text-slate-900">{title}</h3>
        {subtitle && (
          <p className="text-sm font-medium text-slate-500 mt-1">{subtitle}</p>
        )}
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex justify-between items-center ${
              i < rows.length - 1 ? "pb-3 border-b border-slate-200/60" : ""
            }`}
          >
            <span className="text-xs font-bold text-slate-500">{row.label}</span>
            <span className="text-sm font-bold text-slate-900 text-right break-words max-w-[60%]">
              {row.value || "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
