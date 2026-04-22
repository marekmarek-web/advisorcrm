"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { Pin, GripVertical, Plus, FileText, ChevronRight } from "lucide-react";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import { migrateLocalStorageKey } from "@/lib/storage/migrate-weplan-local-storage";

const STORAGE_POSITIONS_KEY = "aidvisora_dashboard_mini_notes_positions";
const STORAGE_PINNED_KEY = "aidvisora_dashboard_mini_notes_pinned";

type Position = { x: number; y: number; z: number };

function contentTitle(c: Record<string, unknown> | null): string {
  if (!c) return "Zápisek";
  if (typeof c.title === "string" && c.title.trim()) return c.title;
  const obsah = c.obsah;
  if (typeof obsah === "string" && obsah.trim()) return obsah.split("\n")[0].slice(0, 80) || "Zápisek";
  return "Zápisek";
}

function contentBodyPreview(c: Record<string, unknown> | null, maxLen: number): string {
  if (!c) return "";
  const o = c.obsah;
  const s = typeof o === "string" ? o : "";
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

const DOMAIN_STYLES: Record<string, string> = {
  hypo: "text-blue-600 bg-blue-100 border-blue-200",
  investice: "text-emerald-600 bg-emerald-100 border-emerald-200",
  pojisteni: "text-rose-600 bg-rose-100 border-rose-200",
  komplex: "text-purple-600 bg-purple-100 border-purple-200",
};

function getDomainStyle(domain: string): string {
  return DOMAIN_STYLES[domain] ?? "text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] border-[color:var(--wp-surface-card-border)]";
}

function loadPositions(): Record<string, Position> {
  if (typeof window === "undefined") return {};
  migrateLocalStorageKey("weplan_dashboard_mini_notes_positions", STORAGE_POSITIONS_KEY);
  try {
    const raw = localStorage.getItem(STORAGE_POSITIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadPinned(): Set<string> {
  if (typeof window === "undefined") return new Set();
  migrateLocalStorageKey("weplan_dashboard_mini_notes_pinned", STORAGE_PINNED_KEY);
  try {
    const raw = localStorage.getItem(STORAGE_PINNED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function savePositions(positions: Record<string, Position>) {
  try {
    localStorage.setItem(STORAGE_POSITIONS_KEY, JSON.stringify(positions));
  } catch {}
}

function savePinned(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_PINNED_KEY, JSON.stringify([...ids]));
  } catch {}
}

function useIsCompact(breakpoint = 1200) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setCompact(mq.matches);
    const handler = (e: MediaQueryListEvent) => setCompact(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return compact;
}

export function DashboardMiniNotes({ initialNotes }: { initialNotes: MeetingNoteForBoard[] }) {
  const [positions, setPositions] = useState<Record<string, Position>>(loadPositions);
  const [pinned, setPinned] = useState<Set<string>>(loadPinned);
  const [maxZIndex, setMaxZIndex] = useState(10);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const isCompact = useIsCompact();

  const notes = initialNotes.slice(0, 8);
  if (notes.length === 0) {
    return (
      <div className="mt-8 rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm p-6">
        <h3 className="text-sm font-black text-[color:var(--wp-text)] flex items-center gap-2 mb-1">
          <FileText size={18} className="text-indigo-600" /> Zápisky
        </h3>
        <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] mb-4">Rychlé poznámky a nápady</p>
        <p className="text-sm text-[color:var(--wp-text-secondary)] mb-4">Zatím žádné zápisky.</p>
        <Link href="/portal/notes" className="inline-flex items-center gap-2 min-h-[44px] py-2.5 px-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold text-sm hover:bg-indigo-100 hover:border-indigo-300 transition-colors w-fit">
          <Plus size={16} /> Přidat
        </Link>
      </div>
    );
  }

  const getPosition = (id: string, index: number): Position => {
    if (positions[id]) return positions[id];
    const row = Math.floor(index / 3);
    const col = index % 3;
    return { x: 16 + col * 140, y: 16 + row * 100, z: index + 1 };
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setDraggingId(id);
      const pos = positions[id] ?? getPosition(id, notes.findIndex((n) => n.id === id));
      const newZ = maxZIndex + 1;
      setMaxZIndex(newZ);
      setPositions((prev) => {
        const next = { ...prev, [id]: { ...pos, z: newZ } };
        savePositions(next);
        return next;
      });
    },
    [positions, maxZIndex, notes]
  );

  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: PointerEvent) => {
      if (!boardRef.current) return;
      const boardRect = boardRef.current.getBoundingClientRect();
      let newX = e.clientX - boardRect.left - dragOffset.x;
      let newY = e.clientY - boardRect.top - dragOffset.y;
      newX = Math.max(0, Math.min(newX, boardRect.width - 160));
      newY = Math.max(0, Math.min(newY, boardRect.height - 80));
      setPositions((prev) => {
        const next = { ...prev, [draggingId]: { ...prev[draggingId], x: newX, y: newY } };
        savePositions(next);
        return next;
      });
    };
    const onUp = () => setDraggingId(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingId, dragOffset]);

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      savePinned(next);
      return next;
    });
  };

  const sortedNotes = [...notes].sort((a, b) => {
    const pa = getPosition(a.id, notes.indexOf(a));
    const pb = getPosition(b.id, notes.indexOf(b));
    return pa.z - pb.z;
  });

  return (
    <div className="mt-8 rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/30 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-black text-[color:var(--wp-text)] flex items-center gap-2">
            <FileText size={18} className="text-indigo-600" /> Zápisky
          </h3>
          <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] mt-0.5">Rychlé poznámky a nápady. Chytněte kartu a přetáhněte.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/portal/notes" className="min-h-[44px] py-2.5 px-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest hover:bg-indigo-100 hover:border-indigo-300 transition-colors inline-flex items-center gap-2">
            Všechny zápisky <ChevronRight size={14} />
          </Link>
          <Link href="/portal/notes" className="min-h-[44px] py-2.5 px-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold text-xs inline-flex items-center gap-1.5 hover:bg-indigo-100 hover:border-indigo-300 transition-colors">
            <Plus size={14} /> Přidat
          </Link>
        </div>
      </div>
      {isCompact ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4 bg-[color:var(--wp-surface-muted)]/50">
          {sortedNotes.map((note) => {
            const isPinned = pinned.has(note.id);
            const title = contentTitle(note.content);
            const preview = contentBodyPreview(note.content, 60);
            const domainStyle = getDomainStyle(note.domain ?? "");
            return (
              <div
                key={note.id}
                className={`rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 shadow-md ${isPinned ? "ring-1 ring-amber-300/50" : ""}`}
              >
                <div className="flex items-center justify-between px-2 py-1 border-b border-[color:var(--wp-surface-card-border)]">
                  <span className="p-1 text-[color:var(--wp-text-tertiary)]"><GripVertical size={14} /></span>
                  <button
                    type="button"
                    onClick={(e) => togglePin(note.id, e)}
                    className={`p-1 rounded-lg ${isPinned ? "bg-amber-100 text-amber-600" : "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)]"}`}
                    aria-label={isPinned ? "Odepnout" : "Připnout"}
                  >
                    <Pin size={10} className={isPinned ? "fill-current" : ""} />
                  </button>
                </div>
                <Link href={`/portal/notes?note=${note.id}`} className="block p-2 text-inherit no-underline">
                  <span className={`inline-block px-1.5 py-0.5 rounded-lg text-[9px] font-bold uppercase border mb-1 ${domainStyle}`}>
                    {note.domain ?? "jiné"}
                  </span>
                  <h4 className="font-semibold text-[color:var(--wp-text)] text-xs leading-tight mb-0.5 line-clamp-2">{title}</h4>
                  {preview && <p className="text-[10px] text-[color:var(--wp-text-secondary)] line-clamp-2">{preview}</p>}
                  {note.contactName && <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-1 truncate">{note.contactName}</p>}
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          ref={boardRef}
          className="relative min-h-[280px] overflow-hidden cursor-crosshair bg-[color:var(--wp-surface-muted)]/50"
          style={{
            backgroundImage: "radial-gradient(circle, #cbd5e1 1.5px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        >
          {sortedNotes.map((note) => {
            const pos = getPosition(note.id, notes.indexOf(note));
            const isDragging = draggingId === note.id;
            const isPinned = pinned.has(note.id);
            const title = contentTitle(note.content);
            const preview = contentBodyPreview(note.content, 60);
            const domainStyle = getDomainStyle(note.domain ?? "");

            return (
              <div
                key={note.id}
                onPointerDown={(e) => handlePointerDown(e, note.id)}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  zIndex: isDragging ? 999 : pos.z,
                  touchAction: "none",
                }}
                className={`
                  w-[160px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 shadow-md backdrop-blur-sm transition-shadow cursor-grab active:cursor-grabbing
                  ${isDragging ? "shadow-lg ring-2 ring-indigo-400/30 scale-105" : "hover:shadow-lg"}
                  ${isPinned ? "ring-1 ring-amber-300/50" : ""}
                `}
              >
                <div className="flex items-center justify-between px-2 py-1 border-b border-[color:var(--wp-surface-card-border)]">
                  <span className="p-1.5 rounded-lg text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] cursor-grab active:cursor-grabbing touch-none shrink-0" aria-label="Chytit a přesunout">
                    <GripVertical size={16} />
                  </span>
                  <button
                    type="button"
                    onClick={(e) => togglePin(note.id, e)}
                    className={`p-1 rounded-lg ${isPinned ? "bg-amber-100 text-amber-600" : "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)]"}`}
                    aria-label={isPinned ? "Odepnout" : "Připnout"}
                  >
                    <Pin size={10} className={isPinned ? "fill-current" : ""} />
                  </button>
                </div>
                <Link href={`/portal/notes?note=${note.id}`} className="block p-2 text-inherit no-underline" onClick={(e) => isDragging && e.preventDefault()}>
                  <span className={`inline-block px-1.5 py-0.5 rounded-lg text-[9px] font-bold uppercase border mb-1 ${domainStyle}`}>
                    {note.domain ?? "jiné"}
                  </span>
                  <h4 className="font-semibold text-[color:var(--wp-text)] text-xs leading-tight mb-0.5 line-clamp-2">{title}</h4>
                  {preview && <p className="text-[10px] text-[color:var(--wp-text-secondary)] line-clamp-2">{preview}</p>}
                  {note.contactName && <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-1 truncate">{note.contactName}</p>}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
