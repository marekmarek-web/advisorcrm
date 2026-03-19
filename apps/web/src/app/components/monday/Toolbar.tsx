"use client";

import { useState, useRef, useEffect } from "react";
import type { Column } from "./types";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { Filter } from "lucide-react";

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  columns: Column[];
  hiddenColumnIds: Set<string>;
  onToggleColumn: (columnId: string) => void;
  filterOpen: boolean;
  onFilterOpenChange: (open: boolean) => void;
  sortOpen: boolean;
  onSortOpenChange: (open: boolean) => void;
  hideOpen: boolean;
  onHideOpenChange: (open: boolean) => void;
  groupByOpen: boolean;
  onGroupByOpenChange: (open: boolean) => void;
  personOpen: boolean;
  onPersonOpenChange: (open: boolean) => void;
  assignedTo: string | null;
  onAssignedToChange: (id: string | null) => void;
  filterStatus: string | null;
  onFilterStatusChange: (id: string | null) => void;
  sortColumnId: string | null;
  sortDir: "asc" | "desc";
  onSortChange: (columnId: string | null, dir: "asc" | "desc") => void;
  groupBy: "none" | "status";
  onGroupByChange: (v: "none" | "status") => void;
}

const FAKE_PEOPLE = [{ id: "all", name: "Všichni" }, { id: "1", name: "Saša" }, { id: "2", name: "Jana" }];
const STATUS_FILTER_OPTIONS = ["hotovo", "rozděláno", "k-podpisu", "zatím-ne", "domluvit"];

export function Toolbar(props: ToolbarProps) {
  const {
    searchQuery,
    onSearchChange,
    columns,
    hiddenColumnIds,
    onToggleColumn,
    filterOpen,
    onFilterOpenChange,
    sortOpen,
    onSortOpenChange,
    hideOpen,
    onHideOpenChange,
    groupByOpen,
    onGroupByOpenChange,
    personOpen,
    onPersonOpenChange,
    assignedTo,
    onAssignedToChange,
    filterStatus,
    onFilterStatusChange,
    sortColumnId,
    sortDir,
    onSortChange,
    groupBy,
    onGroupByChange,
  } = props;

  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const hideRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const personRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex items-center gap-1 h-10 px-4 border-b border-monday-border bg-monday-surface shrink-0">
      {/* Hledat */}
      <input
        type="text"
        placeholder="Hledat"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-32 h-7 px-2 text-[13px] border border-monday-border rounded-[6px] focus:outline-none focus:border-monday-blue"
      />
      {/* Osoba */}
      <div className="relative" ref={personRef}>
        <button
          type="button"
          onClick={() => { onPersonOpenChange(!personOpen); onFilterOpenChange(false); onSortOpenChange(false); onHideOpenChange(false); onGroupByOpenChange(false); }}
          className="px-2.5 py-1.5 text-monday-text-muted text-[13px] hover:bg-monday-row-hover rounded-[6px]"
        >
          Osoba
        </button>
        {personOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => onPersonOpenChange(false)} />
            <div className="absolute left-0 top-full mt-1 py-1 min-w-[140px] bg-monday-surface border border-monday-border rounded-[var(--monday-radius)] shadow-[var(--monday-shadow)] z-40">
              {FAKE_PEOPLE.map((p) => (
                <button key={p.id} type="button" onClick={() => { onAssignedToChange(p.id === "all" ? null : p.id); onPersonOpenChange(false); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-row-hover">
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="relative" ref={filterRef}>
        <button type="button" onClick={() => { onFilterOpenChange(!filterOpen); onSortOpenChange(false); onHideOpenChange(false); onGroupByOpenChange(false); onPersonOpenChange(false); }} className="px-2.5 py-1.5 text-monday-text-muted text-[13px] hover:bg-monday-row-hover rounded-[6px]">Filtrovat</button>
        {filterOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => onFilterOpenChange(false)} />
            <div className="absolute left-0 top-full mt-1 p-3 min-w-[200px] bg-monday-surface border border-monday-border rounded-[var(--monday-radius)] shadow-[var(--monday-shadow)] z-40">
              <p className="text-[11px] font-semibold text-monday-text-muted uppercase mb-2">STAV</p>
              <CustomDropdown
                value={filterStatus ?? ""}
                onChange={(id) => onFilterStatusChange(id || null)}
                options={[{ id: "", label: "Všechny" }, ...STATUS_FILTER_OPTIONS.map((s) => ({ id: s, label: s }))]}
                placeholder="Všechny"
                icon={Filter}
              />
            </div>
          </>
        )}
      </div>
      <div className="relative" ref={sortRef}>
        <button type="button" onClick={() => { onSortOpenChange(!sortOpen); onFilterOpenChange(false); onHideOpenChange(false); onGroupByOpenChange(false); }} className="px-2.5 py-1.5 text-monday-text-muted text-[13px] hover:bg-monday-row-hover rounded-[6px]">Seřadit</button>
        {sortOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => onSortOpenChange(false)} />
            <div className="absolute left-0 top-full mt-1 py-1 min-w-[160px] bg-monday-surface border border-monday-border rounded-[var(--monday-radius)] shadow-[var(--monday-shadow)] z-40">
              <button type="button" onClick={() => { onSortChange("item", "asc"); onSortOpenChange(false); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-row-hover">Jméno A–Z</button>
              <button type="button" onClick={() => { onSortChange("item", "desc"); onSortOpenChange(false); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-row-hover">Jméno Z–A</button>
              <button type="button" onClick={() => { onSortChange("zp", "asc"); onSortOpenChange(false); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-monday-row-hover">ŽP status</button>
            </div>
          </>
        )}
      </div>
      <div className="relative" ref={hideRef}>
        <button type="button" onClick={() => { onHideOpenChange(!hideOpen); onFilterOpenChange(false); onSortOpenChange(false); onGroupByOpenChange(false); }} className="px-2.5 py-1.5 text-monday-text-muted text-[13px] hover:bg-monday-row-hover rounded-[6px]">Skrýt</button>
        {hideOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => onHideOpenChange(false)} />
            <div className="absolute left-0 top-full mt-1 py-1 min-w-[180px] max-h-64 overflow-auto bg-monday-surface border border-monday-border rounded-[var(--monday-radius)] shadow-[var(--monday-shadow)] z-40">
              {columns.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-monday-row-hover cursor-pointer">
                  <input type="checkbox" checked={!hiddenColumnIds.has(c.id)} onChange={() => onToggleColumn(c.id)} />
                  {c.title}
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="relative" ref={groupRef}>
        <button type="button" onClick={() => { onGroupByOpenChange(!groupByOpen); onFilterOpenChange(false); onSortOpenChange(false); onHideOpenChange(false); }} className="px-2.5 py-1.5 text-monday-text-muted text-[13px] hover:bg-monday-row-hover rounded-[6px]">Seskupit</button>
        {groupByOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => onGroupByOpenChange(false)} />
            <div className="absolute left-0 top-full mt-1 py-1 min-w-[140px] bg-monday-surface border border-monday-border rounded-[var(--monday-radius)] shadow-[var(--monday-shadow)] z-40">
              <button type="button" onClick={() => { onGroupByChange("none"); onGroupByOpenChange(false); }} className={`w-full text-left px-3 py-2 text-[13px] hover:bg-monday-row-hover ${groupBy === "none" ? "font-medium text-monday-blue" : ""}`}>Žádné</button>
              <button type="button" onClick={() => { onGroupByChange("status"); onGroupByOpenChange(false); }} className={`w-full text-left px-3 py-2 text-[13px] hover:bg-monday-row-hover ${groupBy === "status" ? "font-medium text-monday-blue" : ""}`}>Stav</button>
            </div>
          </>
        )}
      </div>
      <div className="flex-1" />
    </div>
  );
}
