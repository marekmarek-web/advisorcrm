"use client";

import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

export interface DashboardCardProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  footerLink?: string;
  footerLabel?: string;
  rightElement?: React.ReactNode;
  backgroundClass?: string;
  className?: string;
  /** Optional icon color class for the header icon */
  iconColorClass?: string;
  /** Optional top-edge "envelope" bar (e.g. border-t-4 border-t-indigo-500) */
  topBorderClass?: string;
}

export function DashboardCard({
  title,
  icon: Icon,
  children,
  footerLink,
  footerLabel = "Více",
  rightElement,
  backgroundClass,
  className = "",
  iconColorClass,
  topBorderClass,
}: DashboardCardProps) {
  return (
    <div
      className={`flex min-h-[240px] flex-col overflow-hidden rounded-[32px] border border-slate-100 dark:border-white/10 ${backgroundClass ?? "bg-white dark:bg-wp-surface"} ${topBorderClass ?? ""} ${className}`}
    >
      <div className="px-6 sm:px-8 py-5 sm:py-6 flex items-center justify-between shrink-0">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100 md:text-lg">
          <Icon size={20} className={iconColorClass ?? "text-slate-400"} />
          {title}
        </h2>
        {rightElement != null ? rightElement : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-stretch overflow-y-auto px-6 sm:px-8 pb-6 sm:pb-8">
        {children}
        {footerLink && (
          <div className="mt-auto flex w-full shrink-0 justify-center pt-4">
            <CreateActionButton href={footerLink} icon={ChevronRight} className="shadow-md">
              {footerLabel}
            </CreateActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
