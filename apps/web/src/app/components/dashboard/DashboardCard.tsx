"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface DashboardCardProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  footerLink?: string;
  footerLabel?: string;
  /** Optional right-side content in header (e.g. drag handle) */
  rightElement?: React.ReactNode;
  /** Optional background class (e.g. light tint by section) */
  backgroundClass?: string;
  className?: string;
}

/**
 * Shared dashboard widget card: rounded-[24px], border, shadow,
 * header with icon + title, body with min-height, optional footer "Více →".
 */
export function DashboardCard({
  title,
  icon: Icon,
  children,
  footerLink,
  footerLabel = "Více",
  rightElement,
  backgroundClass,
  className = "",
}: DashboardCardProps) {
  return (
    <div
      className={`flex flex-col rounded-3xl border border-slate-100 shadow-md min-h-[240px] md:min-h-[320px] overflow-hidden ${backgroundClass ?? "bg-white"} ${className}`}
    >
      <div className="px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Icon size={18} className="text-slate-400 shrink-0" />
          <h2 className="font-bold text-slate-900 text-sm truncate">{title}</h2>
        </div>
        {rightElement != null ? rightElement : null}
      </div>
      <div className="p-4 sm:p-6 flex-1 overflow-y-auto min-h-0 flex flex-col">
        {children}
        {footerLink && (
          <Link
            href={footerLink}
            className="mt-4 text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 shrink-0"
          >
            {footerLabel} <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
