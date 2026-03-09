"use client";

import Link from "next/link";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-monday-row-hover text-monday-text-muted text-xl mb-4">
        {icon ?? "+"}
      </div>

      <p className="text-monday-text font-semibold text-sm">{title}</p>

      {description && (
        <p className="text-monday-text-muted text-sm mt-1">{description}</p>
      )}

      {actionLabel &&
        (actionHref ? (
          <Link
            href={actionHref}
            className="mt-4 rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90 transition-opacity"
          >
            {actionLabel}
          </Link>
        ) : onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-4 rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90 transition-opacity"
          >
            {actionLabel}
          </button>
        ) : null)}
    </div>
  );
}
