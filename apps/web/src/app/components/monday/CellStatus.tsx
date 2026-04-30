"use client";

import { useState, useRef, useEffect, useCallback, useId, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { getStatusLabels, getStatusById as getLabelById, STATUS_LABELS_UPDATED_EVENT } from "@/app/lib/status-labels";
import { EditLabelsEditor } from "./EditLabelsEditor";

/** @deprecated Use getStatusLabels() from @/app/lib/status-labels for default list */
export const STATUS_OPTIONS = [
  { id: "hotovo", label: "Hotovo", color: "#00c875" },
  { id: "rozděláno", label: "Rozděláno", color: "#fdab3d" },
  { id: "k-podpisu", label: "K podpisu", color: "#ffcb00" },
  { id: "zatím-ne", label: "Zatím ne", color: "#579bfc" },
  { id: "domluvit", label: "DOMLUVIT", color: "#037f4c" },
  { id: "x", label: "x", color: "#333333" },
  { id: "done", label: "Hotovo", color: "#00c875" },
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
  /** Po výběru z dropdownu (vč. vymazání); pro oslavu z pozice status tlačítka. */
  onStatusPickCommitted?: (nextId: string, getAnchorRect: () => DOMRect | undefined) => void;
}

/** Respects board.css light/dark (--board-empty-status-bg). */
const EMPTY_BG = "var(--board-empty-status-bg, #e5e5e5)";

export function CellStatus({
  value,
  onChange,
  className = "",
  fullCell = false,
  note,
  onNoteChange,
  onStatusPickCommitted,
}: CellStatusProps) {
  const instanceId = useId().replace(/:/g, "");
  const dropdownPortalId = `cell-status-dropdown-${instanceId}`;
  const notePortalId = `cell-status-note-${instanceId}`;

  const [open, setOpen] = useState(false);
  const [showEditLabels, setShowEditLabels] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [options, setOptions] = useState(() => getStatusLabels());
  const [dropdownRect, setDropdownRect] = useState({ top: 0, left: 0, openUp: false });
  const [notePopoverPos, setNotePopoverPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownPortalRef = useRef<HTMLDivElement | null>(null);
  const notePopoverRef = useRef<HTMLDivElement | null>(null);
  const dropdownHeightRef = useRef(280);
  const hasNote = Boolean(note && note.trim());
  const openNoteEditor = () => {
    setNoteDraft(note ?? "");
    setNoteOpen(true);
  };

  useEffect(() => {
    const handler = () => setOptions(getStatusLabels());
    window.addEventListener(STATUS_LABELS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(STATUS_LABELS_UPDATED_EVENT, handler);
  }, []);

  const updateDropdownPosition = useCallback(() => {
    if (buttonRef.current && typeof window !== "undefined") {
      const rect = buttonRef.current.getBoundingClientRect();
      const margin = 8;
      const openUp = rect.bottom + dropdownHeightRef.current + margin > window.innerHeight - 48;
      setDropdownRect({
        top: openUp ? rect.top - dropdownHeightRef.current - 4 : rect.bottom + 4,
        left: rect.left + rect.width / 2,
        openUp,
      });
    }
  }, []);

  /** Poznámka: kotva ke status buňce, ne k pozici dropdownu; ořez na viewport. */
  const updateNotePopoverPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popEl = notePopoverRef.current;
    const popW = Math.min(320, vw - pad * 2);
    const popH = popEl?.getBoundingClientRect().height ?? 200;

    let left = rect.left;
    let top = rect.bottom + 6;

    if (top + popH > vh - pad) {
      top = Math.max(pad, rect.top - popH - 6);
    }
    if (top + popH > vh - pad) {
      top = Math.max(pad, vh - pad - popH);
    }

    if (left + popW > vw - pad) {
      left = vw - pad - popW;
    }
    if (left < pad) left = pad;

    setNotePopoverPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    updateDropdownPosition();
  }, [open, updateDropdownPosition]);

  useLayoutEffect(() => {
    if (!noteOpen || !buttonRef.current) return;
    const run = () => updateNotePopoverPosition();
    run();
    const id = window.requestAnimationFrame(() => {
      run();
      window.requestAnimationFrame(run);
    });
    return () => window.cancelAnimationFrame(id);
  }, [noteOpen, updateNotePopoverPosition]);

  useEffect(() => {
    if (!open) return;
    const scrollContainer = ref.current?.closest(".b-scroller") ?? null;
    const onScroll = () => updateDropdownPosition();
    scrollContainer?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      scrollContainer?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!noteOpen) return;
    const scrollContainer = ref.current?.closest(".b-scroller") ?? null;
    const onScroll = () => updateNotePopoverPosition();
    scrollContainer?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scrollContainer?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, [noteOpen, updateNotePopoverPosition]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (notePopoverRef.current?.contains(target)) return;
      if (dropdownPortalRef.current?.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) {
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
  const current = getLabelById(options, isEmpty ? "" : value);
  const displayLabel = isEmpty ? "" : current.label;
  const bgColor = isEmpty ? EMPTY_BG : current.color;
  const textClass = isEmpty ? "text-[color:var(--wp-text-secondary)]" : "text-white font-bold";

  const dropdownContent = open && typeof document !== "undefined" && (
    <div
      id={dropdownPortalId}
      ref={(el) => {
        dropdownPortalRef.current = el;
        if (el) dropdownHeightRef.current = el.getBoundingClientRect().height;
      }}
      role="listbox"
      className="board-context-menu fixed z-[400]"
      style={{
        top: dropdownRect.top,
        left: dropdownRect.left,
        transform: "translateX(-50%)",
      }}
    >
      <div className="board-context-menu-inner">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] border-b border-[color:var(--wp-surface-card-border)]/60 mb-1">
          Stav – klikni pro změnu
        </div>
        {options.length === 0 && (
          <p className="px-3 py-2 text-[13px] text-[color:var(--wp-text-secondary)]">
            Zatím nemáte žádné štítky. Přidejte je přes „Upravit štítky“ níže.
          </p>
        )}
        {[...options, { id: "", label: "Vymazat (Prázdné)", color: EMPTY_BG }].map((opt) => (
          <button
            key={opt.id || "_empty"}
            type="button"
            role="option"
            onClick={() => {
              onChange(opt.id);
              onStatusPickCommitted?.(opt.id, () => buttonRef.current?.getBoundingClientRect());
              setOpen(false);
            }}
            className="board-context-item flex items-center gap-3"
          >
            <span
              className="w-4 h-4 shrink-0 rounded-sm border border-[color:var(--wp-surface-card-border)]"
              style={{ backgroundColor: opt.color }}
            />
            <span>{opt.label}</span>
          </button>
        ))}
        {onNoteChange && (
          <>
            <div className="h-px bg-[color:var(--wp-surface-card-border)]/60 my-1" />
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
        <div className="h-px bg-[color:var(--wp-surface-card-border)]/60 my-1" />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setShowEditLabels(true);
          }}
          className="board-context-item text-[color:var(--wp-text-secondary)]"
        >
          Upravit štítky (vlastní stavy)
        </button>
      </div>
    </div>
  );

  const notePopover = noteOpen && onNoteChange && typeof document !== "undefined" && (
    <div
      id={notePortalId}
      ref={(el) => {
        notePopoverRef.current = el;
      }}
      className="board-context-menu fixed z-[401] p-3 min-w-[240px] max-w-[min(320px,calc(100vw-16px))]"
      style={{
        top: notePopoverPos.top,
        left: notePopoverPos.left,
      }}
    >
      <label className="block text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-1">Poznámka ke stavu</label>
      <textarea
        autoFocus
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        placeholder="Volitelná poznámka..."
        className="w-full min-h-[80px] px-2 py-1.5 text-sm border border-[color:var(--wp-surface-card-border)] rounded focus:outline-none focus:ring-1 focus:ring-monday-blue resize-y"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button type="button" onClick={() => setNoteOpen(false)} className="px-2 py-1 text-sm text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded">Zrušit</button>
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
        className={`w-full h-full flex items-center justify-center text-sm font-semibold tracking-wide cursor-pointer transition-all duration-200 border-0 ${fullCell ? "min-h-[44px] h-full status-pill rounded-[var(--radius-sm)]" : "wp-pill min-h-[24px] text-[12px] font-bold"} ${textClass} ${isEmpty && fullCell ? "hover:bg-[#d4d4d4] hover:text-[color:var(--wp-text-secondary)]" : ""} ${!isEmpty && fullCell ? "hover:opacity-95" : ""}`}
        style={{ backgroundColor: bgColor }}
        title={
          displayLabel
            ? `Status: ${displayLabel}. Klikni pro změnu.`
            : "Klikni a vyber stav nebo si nejdřív nastavte štítky."
        }
      >
        <span className="flex items-center justify-center gap-1">
          {fullCell && isEmpty ? (
            <Plus size={18} className="text-[color:var(--wp-text)] opacity-70 dark:opacity-90" />
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
