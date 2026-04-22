"use client";

import { Search, Filter, BarChart3 } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import type { PeopleSegmentFilter } from "@/lib/team-overview-page-model";

export function TeamOverviewPeopleFiltersBar({
  peopleSearch,
  onPeopleSearchChange,
  peopleSegment,
  onPeopleSegmentChange,
  performanceFilter,
  onPerformanceFilterChange,
  visibleCount,
  totalCount,
}: {
  peopleSearch: string;
  onPeopleSearchChange: (value: string) => void;
  peopleSegment: PeopleSegmentFilter;
  onPeopleSegmentChange: (segment: PeopleSegmentFilter) => void;
  performanceFilter: "all" | "top" | "bottom";
  onPerformanceFilterChange: (f: "all" | "top" | "bottom") => void;
  visibleCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 md:gap-4" id="lide-v-tymu">
      <div className="relative min-w-[min(100%,220px)] flex-1 max-w-sm">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--wp-text-tertiary)]"
          aria-hidden
        />
        <input
          type="search"
          value={peopleSearch}
          onChange={(e) => onPeopleSearchChange(e.target.value)}
          placeholder="Hledat jméno nebo e-mail…"
          className="h-10 w-full rounded-[14px] border border-[color:var(--wp-surface-card-border)] bg-white py-2 pl-9 pr-4 text-[13px] font-semibold text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#16192b]/10"
          aria-label="Hledat v seznamu členů"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CustomDropdown
          value={peopleSegment}
          onChange={(id) => onPeopleSegmentChange(id as PeopleSegmentFilter)}
          options={[
            { id: "all", label: "Všichni" },
            { id: "attention", label: "Potřebuje pozornost" },
            { id: "adaptation", label: "V adaptaci" },
            { id: "managers", label: "Manažeři a ředitelé" },
            { id: "healthy", label: "Stabilní" },
          ]}
          placeholder="Segment"
          icon={Filter}
        />
        <CustomDropdown
          value={performanceFilter}
          onChange={(id) => onPerformanceFilterChange(id as "all" | "top" | "bottom")}
          options={[
            { id: "all", label: "Všichni" },
            { id: "top", label: "Nejsilnější výkon" },
            { id: "bottom", label: "Podpora ve výkonu" },
          ]}
          placeholder="Výkon"
          icon={BarChart3}
        />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--wp-text-tertiary)] tabular-nums">
          {visibleCount} / {totalCount}
        </span>
      </div>
    </div>
  );
}
