"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlignLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Edit2,
  FileText,
  GripHorizontal,
  Home,
  Landmark,
  Pin,
  PiggyBank,
  Shield,
  TrendingUp,
  User,
} from "lucide-react";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import {
  NOTES_BOARD_LOGICAL_MIN_HEIGHT_PX,
  NOTES_BOARD_LOGICAL_MIN_WIDTH_PX,
  NOTES_BOARD_SNAP_PX,
  findFirstFreeSlot,
  pixelsToBoardUnits,
  snapToGrid,
  tidyLayout,
  type BoardRect,
} from "@/lib/board/notes-board-units";
import {
  NOTES_BOARD_CARD_Z_RENDER_CAP,
  contentBody,
  contentRecommendation,
  contentTitle,
  type BoardPosition,
  type NotesBoardController,
} from "./useNotesBoardController";

const LEGACY_BOARD_POSITIONS_KEY = "portal-notes-board-positions";
const NOTE_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Approximace rozměru karty v px vůči logickému plátnu.
 * Jen pro výpočet slotů (spawn / tidy). Skutečná velikost karty se scaluje přes
 * `cqw` — tato čísla odpovídají hornímu/spodnímu tieru CSS clamp() při logické
 * šířce plátna ~1440 px.
 */
const APPROX_CARD_W_PX = 300;
const APPROX_CARD_H_PX = 220;
const CANVAS_PADDING_PX = NOTES_BOARD_SNAP_PX * 2;

const DOMAINS = [
  { value: "hypo", label: "Hypotéka" },
  { value: "investice", label: "Investice" },
  { value: "zivotni-pojisteni", label: "Životní pojištění" },
  { value: "majetkove-pojisteni", label: "Majetkové pojištění" },
  { value: "dps", label: "Penzijní spoření" },
  { value: "uvery", label: "Úvěry" },
  { value: "komplex", label: "Komplexní plán" },
  { value: "jine", label: "Jiné" },
];

function getProductDesign(type: string) {
  switch (type) {
    case "hypo":
      return {
        icon: <Home size={14} />,
        color: "text-blue-600 bg-blue-100 border-blue-200",
        glow: "shadow-blue-500/30",
      };
    case "investice":
      return {
        icon: <TrendingUp size={14} />,
        color: "text-emerald-600 bg-emerald-100 border-emerald-200",
        glow: "shadow-emerald-500/30",
      };
    case "pojisteni":
    case "zivotni-pojisteni":
    case "majetkove-pojisteni":
      return {
        icon: <Shield size={14} />,
        color: "text-rose-600 bg-rose-100 border-rose-200",
        glow: "shadow-rose-500/30",
      };
    case "jine":
      return {
        icon: <AlignLeft size={14} />,
        color: "text-violet-700 bg-violet-100 border-violet-200",
        glow: "shadow-violet-500/30",
      };
    case "dps":
      return {
        icon: <PiggyBank size={14} />,
        color: "text-amber-700 bg-amber-100 border-amber-200",
        glow: "shadow-amber-500/30",
      };
    case "uvery":
      return {
        icon: <Landmark size={14} />,
        color: "text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)] border-[color:var(--wp-surface-card-border)]",
        glow: "shadow-slate-500/25",
      };
    default:
      return {
        icon: <AlignLeft size={14} />,
        color: "text-purple-600 bg-purple-100 border-purple-200",
        glow: "shadow-purple-500/30",
      };
  }
}

function formatDateCZ(date: Date | string): string {
  if (!date) return "Neurčeno";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `${day}. ${month}. ${year}`;
  } catch {
    return String(date);
  }
}

/**
 * Vrátí obsazené obdélníky (v px) pro kolizní kontroly. Vynechává `excludeId`
 * (pro spawn / tidy). Pozice karet jsou uložené jako frakce 0–1 logického
 * plátna — tady je přepočítáme na px podle aktuálního rozměru plátna.
 */
function collectOccupiedRects(
  positions: Record<string, BoardPosition>,
  canvasW: number,
  canvasH: number,
  cardW: number,
  cardH: number,
  excludeId?: string,
): BoardRect[] {
  const out: BoardRect[] = [];
  for (const [id, pos] of Object.entries(positions)) {
    if (excludeId && id === excludeId) continue;
    out.push({
      x: pos.x * canvasW,
      y: pos.y * canvasH,
      w: cardW,
      h: cardH,
    });
  }
  return out;
}

export type NotesFreeBoardHandle = {
  tidy: () => void;
  spawnNext: (id: string) => void;
};

export function NotesFreeBoard({
  controller,
  onHandleReady,
}: {
  controller: NotesBoardController;
  onHandleReady?: (handle: NotesFreeBoardHandle) => void;
}) {
  const {
    notes,
    filteredNotes,
    searchQuery,
    positions,
    latestPositionsRef,
    persistPositions,
    flushPositionsNow,
    getPosition,
    setPosition,
    bumpZ,
    togglePin,
    openNew,
    openEdit,
    openAttachToDeal,
  } = controller;

  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const legacyMigrated = useRef(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragIndexRef = useRef(0);

  const getCanvasSize = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return { w: 0, h: 0 };
    const rect = el.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }, []);

  /** Spawn nové karty: první volný slot v aktuálním logickém plátně. */
  const spawnNext = useCallback(
    (id: string) => {
      const { w, h } = getCanvasSize();
      if (w <= 0 || h <= 0) {
        persistPositions({
          ...latestPositionsRef.current,
          [id]: { x: 0.04, y: 0.06, z: 1, pinned: false },
        });
        return;
      }
      const occupied = collectOccupiedRects(
        latestPositionsRef.current,
        w,
        h,
        APPROX_CARD_W_PX,
        APPROX_CARD_H_PX,
      );
      const slot = findFirstFreeSlot(
        occupied,
        w,
        h,
        APPROX_CARD_W_PX,
        APPROX_CARD_H_PX,
        CANVAS_PADDING_PX,
        NOTES_BOARD_SNAP_PX,
      );
      const existingZ = Object.values(latestPositionsRef.current).map((p) => p.z);
      const maxZ = existingZ.length > 0 ? Math.max(...existingZ) : 1;
      const newZ = Math.min(maxZ + 1, NOTES_BOARD_CARD_Z_RENDER_CAP);
      persistPositions({
        ...latestPositionsRef.current,
        [id]: {
          x: pixelsToBoardUnits(slot.x, w),
          y: pixelsToBoardUnits(slot.y, h),
          z: newZ,
          pinned: false,
        },
      });
    },
    [getCanvasSize, latestPositionsRef, persistPositions],
  );

  /** Uspořádat: row-major reflow, pinned první, pak podle aktuálního pořadí notes. */
  const tidy = useCallback(() => {
    const { w, h } = getCanvasSize();
    if (w <= 0 || h <= 0) return;
    const items = filteredNotes.map((note, index) => {
      const pos = latestPositionsRef.current[note.id] ?? getPosition(note.id, index);
      return { id: note.id, pinned: Boolean(pos.pinned) };
    });
    const layout = tidyLayout(items, w, APPROX_CARD_W_PX, APPROX_CARD_H_PX);
    const next: Record<string, BoardPosition> = { ...latestPositionsRef.current };
    let z = 1;
    for (const item of items) {
      const slot = layout[item.id];
      if (!slot) continue;
      const prev = next[item.id] ?? getPosition(item.id, 0);
      next[item.id] = {
        ...prev,
        x: pixelsToBoardUnits(slot.x, w),
        y: pixelsToBoardUnits(slot.y, h),
        z: z++,
      };
    }
    persistPositions(next);
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    }
  }, [filteredNotes, getCanvasSize, getPosition, latestPositionsRef, persistPositions]);

  useEffect(() => {
    onHandleReady?.({ tidy, spawnNext });
  }, [onHandleReady, tidy, spawnNext]);

  const handlePointerDown = (e: React.PointerEvent, id: string, index: number) => {
    if ((e.target as HTMLElement).closest?.('button, a, [role="button"]')) return;
    dragIndexRef.current = index;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDraggingId(id);
    bumpZ(id, index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return;
    const px = Math.max(0, e.clientX - rect.left - dragOffset.x);
    const py = Math.max(0, e.clientY - rect.top - dragOffset.y);
    setPosition(draggingId, dragIndexRef.current, {
      x: pixelsToBoardUnits(px, w),
      y: pixelsToBoardUnits(py, h),
    });
  };

  /** Drop: snap na 16 px grid. Překryvy jsou povoleny – uživatel chce kartičky „házet přes sebe". */
  const handlePointerUp = (e: React.PointerEvent) => {
    const wasDragging = draggingId != null;
    const movedId = draggingId;
    setDraggingId(null);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!wasDragging || !movedId) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w > 0 && h > 0) {
        const current = latestPositionsRef.current[movedId];
        if (current) {
          const px = current.x * w;
          const py = current.y * h;
          const snappedX = Math.min(Math.max(CANVAS_PADDING_PX, snapToGrid(px)), Math.max(CANVAS_PADDING_PX, w - APPROX_CARD_W_PX - CANVAS_PADDING_PX));
          const snappedY = Math.min(Math.max(CANVAS_PADDING_PX, snapToGrid(py)), Math.max(CANVAS_PADDING_PX, h - APPROX_CARD_H_PX - CANVAS_PADDING_PX));
          setPosition(movedId, dragIndexRef.current, {
            x: pixelsToBoardUnits(snappedX, w),
            y: pixelsToBoardUnits(snappedY, h),
          });
        }
      }
    }
    flushPositionsNow();
  };

  /** Jednorázová migrace pozic z původního localStorage klíče (ze starších session). */
  useEffect(() => {
    if (Object.keys(positions).length > 0) {
      try {
        localStorage.removeItem(LEGACY_BOARD_POSITIONS_KEY);
      } catch {
        /* ignore */
      }
      legacyMigrated.current = true;
      return;
    }
    if (legacyMigrated.current) return;
    const timer = window.setTimeout(() => {
      if (legacyMigrated.current) return;
      const el = canvasRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 64 || r.height < 64) return;
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(LEGACY_BOARD_POSITIONS_KEY);
      } catch {
        legacyMigrated.current = true;
        return;
      }
      if (!raw) {
        legacyMigrated.current = true;
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        legacyMigrated.current = true;
        try {
          localStorage.removeItem(LEGACY_BOARD_POSITIONS_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        legacyMigrated.current = true;
        return;
      }
      const w = r.width;
      const h = r.height;
      const next: Record<string, BoardPosition> = {};
      for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
        if (!NOTE_ID_UUID_RE.test(key) || val == null || typeof val !== "object") continue;
        const o = val as Record<string, unknown>;
        let x = Number(o.x);
        let y = Number(o.y);
        const zRaw = Number(o.z);
        const z = Number.isFinite(zRaw) ? Math.min(99999, Math.max(1, Math.floor(zRaw))) : 1;
        const pinned = Boolean(o.pinned);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x > 1 || y > 1) {
          x = w > 0 ? Math.min(1, Math.max(0, x / w)) : 0;
          y = h > 0 ? Math.min(1, Math.max(0, y / h)) : 0;
        } else {
          x = Math.min(1, Math.max(0, x));
          y = Math.min(1, Math.max(0, y));
        }
        next[key] = { x, y, z, pinned };
      }
      legacyMigrated.current = true;
      try {
        localStorage.removeItem(LEGACY_BOARD_POSITIONS_KEY);
      } catch {
        /* ignore */
      }
      if (Object.keys(next).length === 0) return;
      persistPositions(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [positions, persistPositions]);

  return (
    <div
      ref={scrollerRef}
      className="relative flex-1 min-h-[min(560px,72vh)] overflow-auto cursor-crosshair"
    >
      <style>{`
        .notes-canvas {
          position: relative;
          min-width: ${NOTES_BOARD_LOGICAL_MIN_WIDTH_PX}px;
          min-height: ${NOTES_BOARD_LOGICAL_MIN_HEIGHT_PX}px;
          width: 100%;
          height: 100%;
          container-type: inline-size;
        }
        .notes-dot-grid {
          background-image: radial-gradient(var(--wp-canvas-dot-color) 1.5px, transparent 0);
          background-size: clamp(18px, 1.75cqw, 28px) clamp(18px, 1.75cqw, 28px);
        }
        @container (max-width: 1440px) {
          .notes-dot-grid {
            background-size: clamp(14px, 1.65cqw, 22px) clamp(14px, 1.65cqw, 22px);
          }
        }
        @container (min-width: 1600px) {
          .notes-dot-grid {
            background-size: clamp(20px, 1.5cqw, 30px) clamp(20px, 1.5cqw, 30px);
          }
        }
        .notes-glass-card {
          background: color-mix(in srgb, var(--wp-surface-card) 94%, transparent);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .notes-board-card {
          box-sizing: border-box;
          width: clamp(200px, 24cqw, 320px);
          min-height: clamp(11rem, 22cqw, 14rem);
        }
        @container (max-width: 1440px) {
          .notes-board-card {
            width: clamp(184px, 22cqw, 240px);
            min-height: clamp(9.5rem, 20cqw, 12rem);
          }
        }
        @container (min-width: 1600px) {
          .notes-board-card {
            width: clamp(260px, 22cqw, 380px);
            min-height: clamp(12.5rem, 22cqw, 15rem);
          }
        }
        .notes-board-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--wp-surface-card-border);
          background: color-mix(in srgb, var(--wp-surface-muted) 90%, transparent);
          padding: 0.5625rem 0.875rem;
        }
        @container (max-width: 1440px) {
          .notes-board-card-header { padding: 0.4rem 0.625rem; }
        }
        @container (min-width: 1600px) {
          .notes-board-card-header { padding: 0.75rem 1.125rem; }
        }
        .notes-board-card-body { padding: clamp(0.6875rem, 2cqw, 1rem); }
        @container (max-width: 1440px) { .notes-board-card-body { padding: clamp(0.5rem, 2cqw, 0.75rem); } }
        @container (min-width: 1600px) { .notes-board-card-body { padding: clamp(0.9375rem, 2cqw, 1.25rem); } }
        .notes-board-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: clamp(0.4375rem, 1.45cqw, 0.75rem);
          gap: 0.3125rem;
        }
        .notes-board-card-title {
          font-weight: 700;
          line-height: 1.22;
          margin-bottom: 0.4375rem;
          padding-right: 0.4375rem;
          color: var(--wp-text);
          font-size: clamp(0.875rem, 2.2cqw, 1.0625rem);
        }
        @container (max-width: 1440px) {
          .notes-board-card-title { font-size: clamp(0.8125rem, 2.3cqw, 0.9375rem); margin-bottom: 0.3125rem; }
        }
        .notes-board-client-row {
          display: flex;
          align-items: center;
          gap: 0.4375rem;
          margin-bottom: clamp(0.4375rem, 1.45cqw, 0.75rem);
        }
        .notes-board-body-stack {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
          border-top: 1px solid var(--wp-surface-card-border);
          padding-top: 0.625rem;
        }
        @container (max-width: 1440px) {
          .notes-board-body-stack { gap: 0.4375rem; padding-top: 0.5rem; }
        }
        .notes-board-body-text {
          color: var(--wp-text-secondary);
          line-height: 1.5;
          font-weight: 500;
          font-size: clamp(11px, 2.1cqw, 12.5px);
        }
        .notes-board-dalsi-box {
          background: rgb(255 251 235 / 0.5);
          border: 1px solid rgb(254 243 199);
          border-radius: 0.375rem;
          padding: clamp(0.4375rem, 1.65cqw, 0.6875rem);
        }
        .notes-board-dalsi-head {
          display: flex;
          align-items: center;
          gap: 0.3125rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          color: rgb(180 83 9);
          margin-bottom: 0.1875rem;
          font-size: clamp(9px, 1.85cqw, 11px);
        }
        .notes-board-dalsi-text {
          color: rgb(120 53 15);
          line-height: 1.5;
          font-weight: 500;
          font-size: clamp(11px, 2.1cqw, 12.5px);
        }
        .notes-board-chip { font-size: clamp(9px, 1.85cqw, 9.5px); }
        .notes-board-date {
          font-weight: 700;
          color: var(--wp-text-tertiary);
          font-size: clamp(10px, 2.05cqw, 11.5px);
        }
        .notes-board-contact-name {
          font-weight: 700;
          color: var(--wp-text-secondary);
          font-size: clamp(11px, 2.1cqw, 13px);
        }
        .notes-board-pipeline-link { font-size: clamp(9px, 1.85cqw, 10.5px); }
      `}</style>

      <div ref={canvasRef} className="notes-canvas">
        <div className="pointer-events-none absolute inset-0 z-0 notes-dot-grid" aria-hidden />
        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto flex max-w-md flex-col items-center rounded-[32px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 p-10 text-center shadow-2xl backdrop-blur-xl">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-[color:var(--wp-surface-muted)]">
                <FileText size={40} className="text-aidv-create" />
              </div>
              <h2 className="text-2xl font-bold text-[color:var(--wp-text)] mb-3">Plátno je prázdné</h2>
              <p className="text-[color:var(--wp-text-secondary)] mb-8 leading-relaxed">
                Všechny zápisky ze schůzek můžete mít zde jako karty a libovolně je přesouvat.
              </p>
              <CreateActionButton type="button" onClick={openNew} className="px-8 py-4 shadow-xl">
                Vytvořit první zápisek
              </CreateActionButton>
            </div>
          </div>
        )}

        {filteredNotes.length === 0 && notes.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-[color:var(--wp-text-secondary)] font-medium">
              Žádné zápisky neodpovídají hledání „{searchQuery}".
            </p>
          </div>
        )}

        {filteredNotes.map((note, index) => {
          const design = getProductDesign(note.domain);
          const pos = getPosition(note.id, index);
          const isDragging = draggingId === note.id;

          return (
            <div
              key={note.id}
              onPointerDown={(e) => handlePointerDown(e, note.id, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                position: "absolute",
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                zIndex: Math.min(isDragging ? 9999 : pos.z, NOTES_BOARD_CARD_Z_RENDER_CAP),
                touchAction: "none",
              }}
              className={`
                notes-glass-card notes-board-card rounded-2xl border transition-shadow duration-300
                ${isDragging ? "shadow-2xl scale-[1.02] cursor-grabbing opacity-95" : "shadow-lg cursor-grab hover:shadow-xl"}
                ${pos.pinned ? `border-[color:var(--wp-border-strong)] shadow-[0_0_20px_-5px_rgba(0,0,0,0.1)] ${design.glow}` : "border-[color:var(--wp-surface-card-border)]"}
              `}
            >
              <div className="notes-board-card-header rounded-t-2xl">
                <GripHorizontal size={16} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
                <div className="flex items-center gap-1">
                  {!note.opportunityId ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openAttachToDeal(note);
                      }}
                      className="p-1.5 rounded-full text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] hover:text-indigo-600 hover:shadow-sm transition-all"
                      title="Převést do obchodu"
                    >
                      <Briefcase size={14} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(note);
                    }}
                    className="p-1.5 rounded-full text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] hover:text-indigo-600 hover:shadow-sm transition-all"
                    title="Upravit zápisek"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(note.id, index);
                    }}
                    className={`p-1.5 rounded-full transition-all ${pos.pinned ? "bg-amber-100 text-amber-600 shadow-sm" : "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] hover:text-[color:var(--wp-text-secondary)] hover:shadow-sm"}`}
                    title="Připnout"
                  >
                    <Pin size={14} className={pos.pinned ? "fill-current" : ""} />
                  </button>
                </div>
              </div>
              <div className="notes-board-card-body">
                <div className="notes-board-meta-row">
                  <div
                    className={`notes-board-chip flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold tracking-wide uppercase border ${design.color}`}
                  >
                    {design.icon}
                    {DOMAINS.find((d) => d.value === note.domain)?.label ?? note.domain}
                  </div>
                  <div className="notes-board-date flex items-center gap-1.5">
                    <Calendar size={12} />
                    {formatDateCZ(note.meetingAt)}
                  </div>
                </div>
                <h3 className="notes-board-card-title">{contentTitle(note.content)}</h3>
                {note.opportunityId ? (
                  <div className="mb-[clamp(0.25rem,1.25cqw,0.5rem)]">
                    <Link
                      href={`/portal/pipeline/${note.opportunityId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="notes-board-pipeline-link inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-500/10 px-2.5 py-1 font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-500/15"
                    >
                      <Briefcase size={12} />
                      Navázáno na obchod
                    </Link>
                  </div>
                ) : null}
                <div className="notes-board-client-row">
                  <div className="w-6 h-6 rounded-full bg-[color:var(--wp-surface-muted)] flex items-center justify-center border border-[color:var(--wp-surface-card-border)]">
                    <User size={12} className="text-[color:var(--wp-text-secondary)]" />
                  </div>
                  <span className="notes-board-contact-name">{note.contactName}</span>
                </div>
                <div className="notes-board-body-stack">
                  <p className="notes-board-body-text">
                    {contentBody(note.content) || (
                      <span className="text-[color:var(--wp-text-tertiary)] italic">Bez obsahu…</span>
                    )}
                  </p>
                  {contentRecommendation(note.content) && (
                    <div className="notes-board-dalsi-box">
                      <div className="notes-board-dalsi-head">
                        <CheckCircle2 size={12} /> Další kroky
                      </div>
                      <p className="notes-board-dalsi-text">{contentRecommendation(note.content)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
