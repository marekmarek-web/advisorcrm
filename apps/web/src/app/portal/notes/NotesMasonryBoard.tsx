"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlignLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Edit2,
  FileText,
  Home,
  Landmark,
  Pin,
  PiggyBank,
  Shield,
  Trash2,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import {
  contentBody,
  contentRecommendation,
  contentTitle,
  type BoardPosition,
  type NotesBoardController,
} from "./useNotesBoardController";

const FILTER_KEY = "portal-notes-mobile-filter";
const LONG_PRESS_MS = 220;
const DRAG_THRESHOLD_PX = 6;

const DOMAINS = [
  { value: "hypo", label: "Hypotéka" },
  { value: "investice", label: "Investice" },
  { value: "zivotni-pojisteni", label: "Životní" },
  { value: "majetkove-pojisteni", label: "Majetkové" },
  { value: "dps", label: "Penze" },
  { value: "uvery", label: "Úvěry" },
  { value: "komplex", label: "Komplex" },
  { value: "jine", label: "Jiné" },
];

const DOMAIN_FULL_LABEL: Record<string, string> = {
  hypo: "Hypotéka",
  investice: "Investice",
  "zivotni-pojisteni": "Životní pojištění",
  "majetkove-pojisteni": "Majetkové pojištění",
  dps: "Penzijní spoření",
  uvery: "Úvěry",
  komplex: "Komplexní plán",
  jine: "Jiné",
  pojisteni: "Pojištění",
};

type DomainDesign = {
  icon: React.ReactElement<{ size?: number | string }>;
  color: string;
  glow: string;
};

function getProductDesign(type: string): DomainDesign {
  switch (type) {
    case "hypo":
      return { icon: <Home size={14} />, color: "text-blue-600 bg-blue-100 border-blue-200", glow: "shadow-blue-500/30" };
    case "investice":
      return { icon: <TrendingUp size={14} />, color: "text-emerald-600 bg-emerald-100 border-emerald-200", glow: "shadow-emerald-500/30" };
    case "pojisteni":
    case "zivotni-pojisteni":
    case "majetkove-pojisteni":
      return { icon: <Shield size={14} />, color: "text-rose-600 bg-rose-100 border-rose-200", glow: "shadow-rose-500/30" };
    case "jine":
      return { icon: <AlignLeft size={14} />, color: "text-violet-700 bg-violet-100 border-violet-200", glow: "shadow-violet-500/30" };
    case "dps":
      return { icon: <PiggyBank size={14} />, color: "text-amber-700 bg-amber-100 border-amber-200", glow: "shadow-amber-500/30" };
    case "uvery":
      return { icon: <Landmark size={14} />, color: "text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)] border-[color:var(--wp-surface-card-border)]", glow: "shadow-slate-500/25" };
    default:
      return { icon: <AlignLeft size={14} />, color: "text-purple-600 bg-purple-100 border-purple-200", glow: "shadow-purple-500/30" };
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

type FilterId = "all" | "pinned" | string;

/**
 * Stabilní pořadí pro masonry: pinned první (podle `order` asc, fallback `z` desc),
 * pak ostatní (stejná logika). Nové pole `order` je volitelné — pokud chybí,
 * přejdeme na `z` a výsledné UI pořadí je stejné jako na starém boardu.
 */
function sortNotesForMasonry(
  notes: MeetingNoteForBoard[],
  positions: Record<string, BoardPosition>,
): MeetingNoteForBoard[] {
  const pinned: MeetingNoteForBoard[] = [];
  const others: MeetingNoteForBoard[] = [];
  for (const n of notes) {
    const p = positions[n.id];
    if (p?.pinned) pinned.push(n);
    else others.push(n);
  }
  const sorter = (a: MeetingNoteForBoard, b: MeetingNoteForBoard) => {
    const pa = positions[a.id];
    const pb = positions[b.id];
    const oa = typeof pa?.order === "number" ? pa.order : null;
    const ob = typeof pb?.order === "number" ? pb.order : null;
    if (oa != null && ob != null) return oa - ob;
    if (oa != null) return -1;
    if (ob != null) return 1;
    const za = pa?.z ?? 0;
    const zb = pb?.z ?? 0;
    return zb - za;
  };
  pinned.sort(sorter);
  others.sort(sorter);
  return [...pinned, ...others];
}

function persistOrderFor(
  notes: MeetingNoteForBoard[],
  positions: Record<string, BoardPosition>,
): Record<string, BoardPosition> {
  const next = { ...positions };
  notes.forEach((n, idx) => {
    const prev = next[n.id] ?? { x: 0, y: 0, z: 1, pinned: false };
    next[n.id] = { ...prev, order: idx };
  });
  return next;
}

export function NotesMasonryBoard({ controller }: { controller: NotesBoardController }) {
  const {
    filteredNotes,
    positions,
    persistPositions,
    latestPositionsRef,
    togglePin,
    openEdit,
    openNew,
    openAttachToDeal,
  } = controller;

  const [filter, setFilter] = useState<FilterId>("all");
  const [detailNoteId, setDetailNoteId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(FILTER_KEY);
      if (v && (v === "all" || v === "pinned" || DOMAINS.some((d) => d.value === v))) {
        setFilter(v);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setFilterPersist = useCallback((id: FilterId) => {
    setFilter(id);
    try {
      localStorage.setItem(FILTER_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const ordered = useMemo(
    () => sortNotesForMasonry(filteredNotes, positions),
    [filteredNotes, positions],
  );

  const visible = useMemo(() => {
    if (filter === "all") return ordered;
    if (filter === "pinned") return ordered.filter((n) => positions[n.id]?.pinned);
    return ordered.filter((n) => {
      if (filter === "zivotni-pojisteni" || filter === "majetkove-pojisteni") {
        return n.domain === filter;
      }
      return n.domain === filter;
    });
  }, [filter, ordered, positions]);

  const detailNote = useMemo(() => (detailNoteId ? filteredNotes.find((n) => n.id === detailNoteId) ?? null : null), [detailNoteId, filteredNotes]);

  // ---------- Drag-reorder (long-press) ----------
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPreviewIds, setDragPreviewIds] = useState<string[] | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    pressTimer: ReturnType<typeof setTimeout> | null;
    activated: boolean;
    pointerId: number | null;
    baseOrder: string[];
    currentOrder: string[];
  } | null>(null);

  const clearPressTimer = () => {
    const st = dragStateRef.current;
    if (st?.pressTimer) {
      clearTimeout(st.pressTimer);
      st.pressTimer = null;
    }
  };

  const cancelDrag = () => {
    clearPressTimer();
    dragStateRef.current = null;
    setDraggingId(null);
    setDragPreviewIds(null);
  };

  const handleCardPointerDown = (e: React.PointerEvent, id: string) => {
    if ((e.target as HTMLElement).closest?.('button, a, [role="button"]')) return;
    if (e.button != null && e.button !== 0) return;
    const state = {
      startX: e.clientX,
      startY: e.clientY,
      pressTimer: null as ReturnType<typeof setTimeout> | null,
      activated: false,
      pointerId: e.pointerId,
      baseOrder: ordered.map((n) => n.id),
      currentOrder: ordered.map((n) => n.id),
    };
    dragStateRef.current = state;
    state.pressTimer = setTimeout(() => {
      if (!dragStateRef.current) return;
      dragStateRef.current.activated = true;
      setDraggingId(id);
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    }, LONG_PRESS_MS);
  };

  const computeTargetOrder = useCallback(
    (draggedId: string, clientY: number): string[] => {
      const list = dragStateRef.current?.currentOrder ?? ordered.map((n) => n.id);
      const otherCards: { id: string; top: number; bottom: number; center: number }[] = [];
      for (const nid of list) {
        if (nid === draggedId) continue;
        const el = cardRefs.current.get(nid);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        otherCards.push({ id: nid, top: r.top, bottom: r.bottom, center: r.top + r.height / 2 });
      }
      if (otherCards.length === 0) return list;
      otherCards.sort((a, b) => a.top - b.top);
      let insertIndex = otherCards.length;
      for (let i = 0; i < otherCards.length; i++) {
        if (clientY < otherCards[i].center) {
          insertIndex = i;
          break;
        }
      }
      const result: string[] = [];
      let placed = false;
      for (let i = 0; i < otherCards.length; i++) {
        if (i === insertIndex) {
          result.push(draggedId);
          placed = true;
        }
        result.push(otherCards[i].id);
      }
      if (!placed) result.push(draggedId);
      return result;
    },
    [ordered],
  );

  const handleCardPointerMove = (e: React.PointerEvent, id: string) => {
    const st = dragStateRef.current;
    if (!st) return;
    const dx = Math.abs(e.clientX - st.startX);
    const dy = Math.abs(e.clientY - st.startY);
    if (!st.activated) {
      // Pohyb před aktivací → rollback (nejde o long-press drag, může to být scroll nebo tap).
      if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
        clearPressTimer();
        dragStateRef.current = null;
      }
      return;
    }
    e.preventDefault();
    const nextOrder = computeTargetOrder(id, e.clientY);
    if (
      !dragPreviewIds ||
      nextOrder.length !== dragPreviewIds.length ||
      nextOrder.some((x, i) => dragPreviewIds[i] !== x)
    ) {
      st.currentOrder = nextOrder;
      setDragPreviewIds(nextOrder);
    }
  };

  const handleCardPointerUp = (e: React.PointerEvent, id: string) => {
    const st = dragStateRef.current;
    if (!st) return;
    clearPressTimer();
    const activated = st.activated;
    const movedEnough = Math.abs(e.clientX - st.startX) > DRAG_THRESHOLD_PX || Math.abs(e.clientY - st.startY) > DRAG_THRESHOLD_PX;
    dragStateRef.current = null;

    if (activated) {
      const finalOrder = (dragPreviewIds ?? ordered.map((n) => n.id)).slice();
      setDraggingId(null);
      setDragPreviewIds(null);
      const reordered: MeetingNoteForBoard[] = finalOrder
        .map((nid) => ordered.find((n) => n.id === nid))
        .filter((n): n is MeetingNoteForBoard => !!n);
      const next = persistOrderFor(reordered, latestPositionsRef.current);
      persistPositions(next);
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (!movedEnough) {
      setDetailNoteId(id);
    }
  };

  // ---------- Render helpers ----------
  const displayNotes = useMemo(() => {
    if (!draggingId || !dragPreviewIds) return visible;
    const byId = new Map(visible.map((n) => [n.id, n] as const));
    const order: MeetingNoteForBoard[] = [];
    for (const nid of dragPreviewIds) {
      const n = byId.get(nid);
      if (n) order.push(n);
    }
    return order;
  }, [visible, draggingId, dragPreviewIds]);

  return (
    <div className="relative flex-1 min-h-0 overflow-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
      <style>{`
        .notes-masonry-overlay { animation: notesMasonryFadeIn 0.3s ease-out forwards; }
        .notes-masonry-sheet { animation: notesMasonrySlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes notesMasonryFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes notesMasonrySlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {/* Filter chips */}
      <div className="sticky top-0 z-10 bg-[color:var(--wp-main-scroll-bg)]/95 backdrop-blur-sm border-b border-[color:var(--wp-surface-card-border)] -mx-[1px]">
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilterPersist("all")}
            label="Vše"
            count={filteredNotes.length}
          />
          <FilterChip
            active={filter === "pinned"}
            onClick={() => setFilterPersist("pinned")}
            label="Připnuté"
            icon={<Pin size={12} className="fill-current" />}
            count={filteredNotes.filter((n) => positions[n.id]?.pinned).length}
          />
          {DOMAINS.map((d) => (
            <FilterChip
              key={d.value}
              active={filter === d.value}
              onClick={() => setFilterPersist(d.value)}
              label={d.label}
            />
          ))}
        </div>
      </div>

      <div className="p-4">
        {filteredNotes.length === 0 ? (
          <EmptyState onCreate={openNew} />
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[color:var(--wp-text-secondary)] font-medium mb-4">
              Žádné zápisky v této kategorii.
            </p>
            <button
              type="button"
              onClick={() => setFilterPersist("all")}
              className="text-sm font-bold text-indigo-600 hover:text-indigo-700"
            >
              Zobrazit vše
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
            {displayNotes.map((note) => {
              const isDragging = draggingId === note.id;
              const pos = positions[note.id];
              return (
                <MasonryCard
                  key={note.id}
                  note={note}
                  pinned={Boolean(pos?.pinned)}
                  isDragging={isDragging}
                  registerRef={(el) => registerCardRef(note.id, el)}
                  onPointerDown={(e) => handleCardPointerDown(e, note.id)}
                  onPointerMove={(e) => handleCardPointerMove(e, note.id)}
                  onPointerUp={(e) => handleCardPointerUp(e, note.id)}
                  onPointerCancel={cancelDrag}
                  onOpenDetail={() => setDetailNoteId(note.id)}
                  onAttach={() => void openAttachToDeal(note)}
                  onTogglePin={() => togglePin(note.id, 0)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom sheet detail — styl CP Platby mobile */}
      <NotesMobileSheet
        note={detailNote}
        pinned={detailNote ? Boolean(positions[detailNote.id]?.pinned) : false}
        onClose={() => setDetailNoteId(null)}
        onEdit={(n) => {
          setDetailNoteId(null);
          openEdit(n);
        }}
        onAttach={(n) => {
          setDetailNoteId(null);
          void openAttachToDeal(n);
        }}
        onTogglePin={(n) => togglePin(n.id, 0)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  icon,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${
        active
          ? "bg-[color:var(--wp-text)] text-[color:var(--wp-surface-card)] border-[color:var(--wp-text)] shadow-sm"
          : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)] hover:border-[color:var(--wp-border-strong)]"
      }`}
    >
      {icon}
      <span>{label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className={`ml-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-full ${active ? "bg-[color:var(--wp-surface-card)]/25" : "bg-[color:var(--wp-surface-muted)]"}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-[color:var(--wp-surface-muted)]">
        <FileText size={28} className="text-aidv-create" />
      </div>
      <h2 className="text-lg font-bold text-[color:var(--wp-text)] mb-2">Žádné zápisky</h2>
      <p className="text-[color:var(--wp-text-secondary)] text-sm mb-6 max-w-xs">
        Vytvořte interní zápisek ze schůzky — dlouhým stiskem karty je pak seřadíte podle vlastního pořadí.
      </p>
      <CreateActionButton type="button" onClick={onCreate}>
        Nový zápisek
      </CreateActionButton>
    </div>
  );
}

function MasonryCard({
  note,
  pinned,
  isDragging,
  registerRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onOpenDetail,
  onAttach,
  onTogglePin,
}: {
  note: MeetingNoteForBoard;
  pinned: boolean;
  isDragging: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onOpenDetail: () => void;
  onAttach: () => void;
  onTogglePin: () => void;
}) {
  const design = getProductDesign(note.domain);
  const domainLabel = DOMAIN_FULL_LABEL[note.domain] ?? note.domain;
  return (
    <div
      ref={registerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest?.('button, a, [role="button"]')) return;
        // Klik se řeší v onPointerUp — jen zabráníme propagaci sem.
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetail();
        }
      }}
      style={{
        touchAction: isDragging ? "none" : "manipulation",
        zIndex: isDragging ? 20 : undefined,
      }}
      className={`relative rounded-2xl border shadow-sm transition-all select-none ${
        isDragging
          ? `scale-[1.03] shadow-2xl ${design.glow} border-[color:var(--wp-border-strong)]`
          : pinned
            ? `border-[color:var(--wp-border-strong)] ${design.glow}`
            : "border-[color:var(--wp-surface-card-border)]"
      } bg-[color:var(--wp-surface-card)] overflow-hidden active:scale-[0.995]`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${design.color}`}>
          {React.cloneElement(design.icon, { size: 18 })}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className={`text-[9px] font-black uppercase tracking-widest truncate`}>
              {domainLabel}
            </span>
            <span className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] flex items-center gap-1 shrink-0">
              <Calendar size={10} />
              {formatDateCZ(note.meetingAt)}
            </span>
          </div>
          <h3 className="font-bold text-[color:var(--wp-text)] text-sm leading-tight mb-1 line-clamp-2">
            {contentTitle(note.content)}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-[color:var(--wp-text-secondary)]">
            <User size={11} className="shrink-0" />
            <span className="truncate font-medium">{note.contactName}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
            pinned
              ? "bg-amber-100 text-amber-600"
              : "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)]"
          }`}
          title={pinned ? "Odepnout" : "Připnout"}
          aria-label={pinned ? "Odepnout" : "Připnout"}
        >
          <Pin size={14} className={pinned ? "fill-current" : ""} />
        </button>
      </div>

      {(contentBody(note.content) || contentRecommendation(note.content) || note.opportunityId) && (
        <div className="px-4 pb-4 space-y-2">
          {contentBody(note.content) && (
            <p className="text-[12.5px] text-[color:var(--wp-text-secondary)] leading-relaxed line-clamp-2">
              {contentBody(note.content)}
            </p>
          )}
          {contentRecommendation(note.content) && (
            <div className="rounded-lg bg-amber-50/70 border border-amber-100 px-2.5 py-1.5">
              <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-700 mb-0.5">
                <CheckCircle2 size={10} /> Další kroky
              </div>
              <p className="text-[11.5px] text-amber-900 font-medium leading-snug line-clamp-2">
                {contentRecommendation(note.content)}
              </p>
            </div>
          )}
          {note.opportunityId ? (
            <Link
              href={`/portal/pipeline/${note.opportunityId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700"
            >
              <Briefcase size={10} />
              Navázáno na obchod
            </Link>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 border-t border-[color:var(--wp-surface-card-border)]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail();
          }}
          className="min-h-[44px] py-2.5 text-xs font-bold text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] flex items-center justify-center gap-1.5 transition-colors"
        >
          <FileText size={13} /> Detail
        </button>
        <button
          type="button"
          disabled={!!note.opportunityId}
          onClick={(e) => {
            e.stopPropagation();
            onAttach();
          }}
          className="min-h-[44px] py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 flex items-center justify-center gap-1.5 transition-colors border-l border-[color:var(--wp-surface-card-border)] disabled:text-[color:var(--wp-text-tertiary)] disabled:hover:bg-transparent disabled:cursor-not-allowed"
        >
          <Briefcase size={13} /> {note.opportunityId ? "Obchod" : "Do obchodu"}
        </button>
      </div>
    </div>
  );
}

// --------------------- Bottom Sheet ---------------------

function NotesMobileSheet({
  note,
  pinned,
  onClose,
  onEdit,
  onAttach,
  onTogglePin,
}: {
  note: MeetingNoteForBoard | null;
  pinned: boolean;
  onClose: () => void;
  onEdit: (n: MeetingNoteForBoard) => void;
  onAttach: (n: MeetingNoteForBoard) => void;
  onTogglePin: (n: MeetingNoteForBoard) => void;
}) {
  const [portalReady, setPortalReady] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; lastY: number; startTime: number } | null>(null);
  const [translateY, setTranslateY] = useState(0);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (note) {
      setTranslateY(0);
    }
  }, [note]);

  useEffect(() => {
    if (!note) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [note]);

  if (!portalReady || !note) return null;

  const handleHandlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, lastY: e.clientY, startTime: Date.now() };
  };
  const handleHandlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dy = e.clientY - dragState.current.startY;
    if (dy > 0) {
      setTranslateY(dy);
      dragState.current.lastY = e.clientY;
    }
  };
  const handleHandlePointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!dragState.current) return;
    const dy = dragState.current.lastY - dragState.current.startY;
    const dt = Math.max(1, Date.now() - dragState.current.startTime);
    const velocity = dy / dt;
    dragState.current = null;
    if (dy > 120 || velocity > 0.6) {
      setTranslateY(window.innerHeight);
      setTimeout(onClose, 180);
    } else {
      setTranslateY(0);
    }
  };

  const design = getProductDesign(note.domain);
  const domainLabel = DOMAIN_FULL_LABEL[note.domain] ?? note.domain;
  const body = contentBody(note.content);
  const rec = contentRecommendation(note.content);
  const meetingAt = note.meetingAt instanceof Date ? note.meetingAt : new Date(note.meetingAt);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm notes-masonry-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className="bg-[color:var(--wp-surface-card)] rounded-t-[32px] w-full max-w-[480px] max-h-[92dvh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] shadow-2xl notes-masonry-sheet"
        style={{
          transform: translateY ? `translateY(${translateY}px)` : undefined,
          transition: translateY === 0 ? "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)" : undefined,
        }}
      >
        <div
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={handleHandlePointerUp}
          onPointerCancel={handleHandlePointerUp}
          className="w-full flex justify-center pt-3 pb-1 touch-none cursor-grab"
        >
          <div className="w-12 h-1.5 bg-[color:var(--wp-surface-card-border)] rounded-full" />
        </div>

        <div className="px-5 pb-3 flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${design.color}`}>
            {React.cloneElement(design.icon, { size: 20 })}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                {domainLabel}
              </span>
              {pinned && (
                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600">
                  <Pin size={10} className="fill-current" /> Připnuto
                </span>
              )}
            </div>
            <h3 className="font-black text-lg text-[color:var(--wp-text)] leading-tight pr-2">
              {contentTitle(note.content)}
            </h3>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-[color:var(--wp-text-secondary)] font-medium">
              <span className="inline-flex items-center gap-1">
                <Calendar size={11} /> {formatDateCZ(meetingAt)}
              </span>
              <span className="inline-flex items-center gap-1 truncate">
                <User size={11} /> <span className="truncate">{note.contactName}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-10 h-10 rounded-full bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] flex items-center justify-center transition-colors"
            aria-label="Zavřít"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 p-4">
            <div className="text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1.5">
              Obsah schůzky
            </div>
            {body ? (
              <p className="text-sm text-[color:var(--wp-text-secondary)] leading-relaxed whitespace-pre-wrap">
                {body}
              </p>
            ) : (
              <p className="text-sm text-[color:var(--wp-text-tertiary)] italic">Bez obsahu.</p>
            )}
          </div>

          {rec && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-700 mb-1.5">
                <CheckCircle2 size={11} /> Další kroky (interní)
              </div>
              <p className="text-sm text-amber-900 leading-relaxed font-medium whitespace-pre-wrap">
                {rec}
              </p>
            </div>
          )}

          {note.opportunityId ? (
            <Link
              href={`/portal/pipeline/${note.opportunityId}`}
              className="block rounded-2xl border border-indigo-200 bg-indigo-500/10 px-4 py-3 text-indigo-700"
            >
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-0.5">
                <Briefcase size={12} /> Navázáno na obchod
              </div>
              <div className="text-sm font-bold">Otevřít detail obchodu</div>
            </Link>
          ) : null}

          <p className="text-[10.5px] text-[color:var(--wp-text-tertiary)] leading-snug px-0.5">
            Výstup je pouze informativní interní podklad pro poradce. Nejde o doporučení klientovi.
          </p>
        </div>

        <div className="shrink-0 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onTogglePin(note)}
            className={`min-h-[48px] rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
              pinned
                ? "bg-amber-100 border-amber-200 text-amber-700"
                : "bg-[color:var(--wp-surface-card)] border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
            }`}
          >
            <Pin size={14} className={pinned ? "fill-current" : ""} />
            {pinned ? "Odepnout" : "Připnout"}
          </button>
          <button
            type="button"
            disabled={!!note.opportunityId}
            onClick={() => onAttach(note)}
            className="min-h-[48px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-indigo-600 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Briefcase size={14} />
            {note.opportunityId ? "V obchodu" : "Do obchodu"}
          </button>
          <button
            type="button"
            onClick={() => onEdit(note)}
            className="min-h-[48px] rounded-xl bg-[color:var(--wp-text)] text-[color:var(--wp-surface-card)] font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] transition-transform"
          >
            <Edit2 size={14} />
            Upravit
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
