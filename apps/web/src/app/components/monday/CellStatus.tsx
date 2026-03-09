"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { getStatusLabels, getStatusById as getLabelById } from "@/app/lib/status-labels";
import { EditLabelsEditor } from "./EditLabelsEditor";

/** @deprecated Use getStatusLabels() from @/app/lib/status-labels for default list */
export const STATUS_OPTIONS = [
  { id: "hotovo", label: "Hotovo", color: "#00c875" },
  { id: "rozděláno", label: "Rozděláno", color: "#fdab3d" },
  { id: "k-podpisu", label: "K podpisu", color: "#ffcb00" },
  { id: "zatím-ne", label: "Zatím ne", color: "#579bfc" },
  { id: "domluvit", label: "DOMLUVIT", color: "#037f4c" },
  { id: "x", label: "x", color: "#333333" },
  { id: "done", label: "✓", color: "#00c875" },
] as const;

export type StatusId = string;

interface CellStatusProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Monday style: full cell height (h-11), no padding; empty state shows Plus icon */
  fullCell?: boolean;
  /** Optional note for this status cell (Monday-style status note) */
  note?: string;
  /** Called when user saves the note */
  onNoteChange?: (note: string) => void;
}

const EMPTY_BG = "#e5e5e5";

export function CellStatus({ value, onChange, className = "", fullCell = false, note, onNoteChange }: CellStatusProps) {
  const [open, setOpen] = useState(false);
  const [showEditLabels, setShowEditLabels] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [options, setOptions] = useState(() => getStatusLabels());
  const [dropdownRect, setDropdownRect] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasNote = Boolean(note && note.trim());
  const openNoteEditor = () => {
    setNoteDraft(note ?? "");
    setNoteOpen(true);
  };

  useEffect(() => {
    const handler = () => setOptions(getStatusLabels());
    window.addEventListener("weplan_labels_updated", handler);
    return () => window.removeEventListener("weplan_labels_updated", handler);
  }, []);

  const updateDropdownPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownRect({
        top: rect.bottom + 4,
        left: rect.left + rect.width / 2,
      });
    }
  }, []);

  useEffect(() => {
    if ((open || noteOpen) && buttonRef.current && typeof document !== "undefined") {
      updateDropdownPosition();
    }
  }, [open, noteOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!open && !noteOpen) return;
    const scrollContainer = ref.current?.closest(".b-scroller") ?? null;
    const onScroll = () => updateDropdownPosition();
    scrollContainer?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      scrollContainer?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open, noteOpen, updateDropdownPosition]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const portal = document.getElementById("cell-status-dropdown-portal");
      const notePortal = document.getElementById("cell-status-note-portal");
      if (notePortal && notePortal.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) {
        if (portal && portal.contains(target)) return;
        setOpen(false);
        setNoteOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setNoteOpen(false);
      }
    }
    if (open || noteOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, noteOpen]);

  const isEmpty = !value || value.trim() === "";
  const current = getLabelById(options, isEmpty ? "hotovo" : value);
  const displayLabel = isEmpty ? "" : current.label;
  const bgColor = isEmpty ? EMPTY_BG : current.color;
  const textClass = isEmpty ? "text-slate-500" : "text-white font-bold";

  const dropdownContent = open && typeof document !== "undefined" && (
    <div
      id="cell-status-dropdown-portal"
      role="listbox"
      className="board-context-menu fixed z-[400]"
      style={{
        top: dropdownRect.top,
        left: dropdownRect.left,
        transform: "translateX(-50%)",
      }}
    >
      <div className="board-context-menu-inner">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200/60 mb-1">
          Stav – klikni pro změnu
        </div>
        {[...options, { id: "", label: "Vymazat (Prázdné)", color: EMPTY_BG }].map((opt) => (
          <button
            key={opt.id || "_empty"}
            type="button"
            role="option"
            onClick={() => {
              onChange(opt.id);
              setOpen(false);
            }}
            className="board-context-item flex items-center gap-3"
          >
            <span
              className="w-4 h-4 shrink-0 rounded-sm border border-slate-200"
              style={{ backgroundColor: opt.color }}
            />
            <span>{opt.label}</span>
          </button>
        ))}
        {onNoteChange && (
          <>
            <div className="h-px bg-slate-200/60 my-1" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openNoteEditor();
              }}
              className="board-context-item"
            >
              {hasNote ? "✏️ Poznámka (upravit)" : "📝 Přidat poznámku"}
            </button>
          </>
        )}
        <div className="h-px bg-slate-200/60 my-1" />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setShowEditLabels(true);
          }}
          className="board-context-item text-slate-500"
        >
          Upravit štítky (vlastní stavy)
        </button>
      </div>
    </div>
  );

  const notePopover = noteOpen && onNoteChange && typeof document !== "undefined" && (
    <div
      id="cell-status-note-portal"
      className="board-context-menu fixed z-[401] p-3 min-w-[240px] max-w-[320px]"
      style={{
        top: dropdownRect.top,
        left: dropdownRect.left,
        transform: "translateX(-50%)",
      }}
    >
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Poznámka ke stavu</label>
      <textarea
        autoFocus
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        placeholder="Volitelná poznámka..."
        className="w-full min-h-[80px] px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-monday-blue resize-y"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button type="button" onClick={() => setNoteOpen(false)} className="px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded">Zrušit</button>
        <button type="button" onClick={() => { onNoteChange(noteDraft); setNoteOpen(false); }} className="px-2 py-1 text-sm bg-monday-blue text-white rounded hover:opacity-90">Uložit</button>
      </div>
    </div>
  );

  return (
    <div ref={ref} className={`relative w-full h-full ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
          (e.currentTarget as HTMLButtonElement).blur();
        }}
        className={`w-full h-full flex items-center justify-center text-sm font-semibold tracking-wide cursor-pointer transition-all duration-200 border-0 ${fullCell ? "min-h-[44px] h-full status-pill rounded-[var(--radius-sm)]" : "wp-pill min-h-[24px] text-[12px] font-bold"} ${textClass} ${isEmpty && fullCell ? "hover:bg-[#d4d4d4] hover:text-slate-600" : ""} ${!isEmpty && fullCell ? "hover:opacity-95" : ""}`}
        style={{ backgroundColor: bgColor }}
        title={displayLabel ? `Status: ${displayLabel}. Klikni pro změnu.` : "Klikni a vyber stav (Hotovo, Rozděláno, …)"}
      >
        <span className="flex items-center justify-center gap-1">
          {fullCell && isEmpty ? (
            <Plus size={18} className="text-slate-400" />
          ) : (
            displayLabel
          )}
          {hasNote && <span className="text-[10px] opacity-80" title="Má poznámku">📝</span>}
        </span>
      </button>

      {dropdownContent && createPortal(dropdownContent, document.body)}
      {notePopover && createPortal(notePopover, document.body)}
      <EditLabelsEditor open={showEditLabels} onClose={() => setShowEditLabels(false)} />
    </div>
  );
}
