"use client";

/** Single shimmer line (for text placeholders). */
export function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={`wp-skeleton-line h-3 overflow-hidden rounded-full bg-[color:var(--wp-surface-card-border)] ${className ?? ""}`}
      aria-hidden
    />
  );
}

/** Card placeholder: avatar + lines. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={`grid grid-cols-[auto_1fr] gap-3 p-4 ${className ?? ""}`}
      aria-hidden
    >
      <div className="wp-skeleton-avatar h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[color:var(--wp-surface-card-border)]" />
      <div className="space-y-2">
        <SkeletonLine className="w-3/4" />
        <SkeletonLine className="w-1/2" />
        <SkeletonLine className="w-5/6" />
      </div>
    </div>
  );
}

/** Table row placeholder (N columns). */
export function SkeletonTableRow({
  columns,
  className,
}: {
  columns: number;
  className?: string;
}) {
  return (
    <tr className={className} aria-hidden>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-2">
          <SkeletonLine className="w-full max-w-[8rem]" />
        </td>
      ))}
    </tr>
  );
}

/** Generic block for custom layouts. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse overflow-hidden rounded bg-[color:var(--wp-skeleton-bg)] ${className ?? ""}`}
      aria-hidden
    />
  );
}
