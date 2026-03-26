"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { dashboardPrimaryCtaClassName } from "@/lib/ui/button-presets";

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
      className={`flex flex-col rounded-[32px] border border-slate-100 min-h-[240px] overflow-hidden ${backgroundClass ?? "bg-white"} ${topBorderClass ?? ""} ${className}`}
    >
      <div className="px-6 sm:px-8 py-5 sm:py-6 flex items-center justify-between shrink-0">
        <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
          <Icon size={18} className={iconColorClass ?? "text-slate-400"} />
          {title}
        </h2>
        {rightElement != null ? rightElement : null}
      </div>
      <div className="px-6 sm:px-8 pb-6 sm:pb-8 flex-1 overflow-y-auto min-h-0 flex flex-col">
        {children}
        {footerLink && (
          <Link href={footerLink} className={`mt-auto pt-4 w-fit shrink-0 ${dashboardPrimaryCtaClassName}`}>
            {footerLabel} <ChevronRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
