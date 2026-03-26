"use client";

/**
 * List page header: h1 + count badge + subtitle left; actions right.
 * Matches Contacts pattern: text-2xl md:text-3xl font-bold, badge, text-sm text-slate-500, primary CTA bg-aidv-create.
 */
export function ListPageHeader({
  title,
  count = null,
  totalCount = null,
  subtitle,
  actions,
}: {
  title: string;
  count?: number | null;
  totalCount?: number | null;
  subtitle?: string | null;
  actions?: React.ReactNode;
}) {
  const showBadge = count !== null && count !== undefined;
  const badgeLabel =
    totalCount != null && totalCount !== count
      ? `${count} / ${totalCount}`
      : count != null
        ? `${count} celkem`
        : "";

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2 md:gap-3 flex-wrap">
          {title}
          {showBadge && (
            <span className="px-2 py-0.5 md:px-2.5 bg-slate-100 text-slate-600 text-xs md:text-sm font-semibold rounded-lg border border-slate-200">
              {badgeLabel}
            </span>
          )}
        </h1>
        {subtitle && <p className="text-xs md:text-sm text-slate-500 mt-0.5 md:mt-1">{subtitle}</p>}
      </div>
      {actions != null && (
        <div className="flex flex-wrap items-center gap-2 md:gap-3 shrink-0 [&_button]:min-h-[44px] md:[&_button]:min-h-0 [&_a]:min-h-[44px] md:[&_a]:min-h-0">
          {actions}
        </div>
      )}
    </div>
  );
}
