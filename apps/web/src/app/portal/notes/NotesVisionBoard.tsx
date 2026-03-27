"use client";

import React, { Suspense, useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Pin,
  Plus,
  GripHorizontal,
  Calendar,
  User,
  AlignLeft,
  Home,
  TrendingUp,
  Shield,
  Edit2,
  Trash2,
  FileText,
  CheckCircle2,
  Check,
  X,
} from "lucide-react";
import {
  getMeetingNotesForBoard,
  createMeetingNote,
  updateMeetingNote,
  deleteMeetingNote,
  summarizeMeetingNotes,
} from "@/app/actions/meeting-notes";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import type { ContactRow } from "@/app/actions/contacts";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";

const BOARD_POSITIONS_KEY = "portal-notes-board-positions";
const MOBILE_TAB_KEY = "portal-notes-mobile-tab";

const DOMAINS = [
  { value: "hypo", label: "Hypotéka" },
  { value: "investice", label: "Investice" },
  { value: "pojisteni", label: "Pojištění" },
  { value: "komplex", label: "Komplexní plán" },
];

type BoardPosition = { x: number; y: number; z: number; pinned: boolean };

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
      return {
        icon: <Shield size={14} />,
        color: "text-rose-600 bg-rose-100 border-rose-200",
        glow: "shadow-rose-500/30",
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

function contentTitle(c: Record<string, unknown> | null): string {
  if (!c) return "Zápisek";
  if (typeof c.title === "string" && c.title.trim()) return c.title;
  const obsah = c.obsah;
  if (typeof obsah === "string" && obsah.trim()) return obsah.split("\n")[0].slice(0, 80) || "Zápisek";
  return "Zápisek";
}

function contentBody(c: Record<string, unknown> | null): string {
  if (!c) return "";
  const o = c.obsah;
  return typeof o === "string" ? o : "";
}

function contentRecommendation(c: Record<string, unknown> | null): string {
  if (!c) return "";
  const d = c.dalsi_kroky ?? c.doporuceni;
  return typeof d === "string" ? d : "";
}

function noteMatchesSearch(note: MeetingNoteForBoard, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  const title = contentTitle(note.content);
  const body = contentBody(note.content);
  const rec = contentRecommendation(note.content);
  return (
    title.toLowerCase().includes(lower) ||
    !!(note.contactName && note.contactName.toLowerCase().includes(lower)) ||
    body.toLowerCase().includes(lower) ||
    rec.toLowerCase().includes(lower) ||
    !!(note.domain && note.domain.toLowerCase().includes(lower))
  );
}

function NotesVisionBoardInner({
  initialNotes,
  contacts,
  initialSearchQuery,
  initialNoteId,
}: {
  initialNotes: MeetingNoteForBoard[];
  contacts: ContactRow[];
  initialSearchQuery: string;
  initialNoteId: string | null;
}) {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? initialSearchQuery;
  const noteIdFromQuery = searchParams.get("noteId") ?? initialNoteId ?? "";
  const [notes, setNotes] = useState(initialNotes);
  const [positions, setPositions] = useState<Record<string, BoardPosition>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(BOARD_POSITIONS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [maxZIndex, setMaxZIndex] = useState(10);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<"feed" | "board">("board");
  const boardRef = useRef<HTMLDivElement>(null);
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(MOBILE_TAB_KEY);
      if (v === "feed" || v === "board") setMobileTab(v);
    } catch {
      /* ignore */
    }
  }, []);

  const setMobileTabPersist = useCallback((t: "feed" | "board") => {
    setMobileTab(t);
    try {
      localStorage.setItem(MOBILE_TAB_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const defaultForm = {
    title: "",
    client: "",
    date: "",
    time: "",
    type: "hypo" as string,
    content: "",
    recommendation: "",
  };
  const [formData, setFormData] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const persistPositions = useCallback((next: Record<string, BoardPosition>) => {
    setPositions(next);
    try {
      localStorage.setItem(BOARD_POSITIONS_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const getPosition = useCallback(
    (id: string, index: number): BoardPosition => {
      if (positions[id]) return positions[id];
      return {
        x: 50 + (index % 3) * 380,
        y: 60 + Math.floor(index / 3) * 320,
        z: index + 1,
        pinned: false,
      };
    },
    [positions]
  );

  const setPosition = useCallback(
    (id: string, patch: Partial<BoardPosition>) => {
      const prev = getPosition(id, 0);
      const next = { ...positions, [id]: { ...prev, ...patch } };
      persistPositions(next);
    },
    [positions, getPosition, persistPositions]
  );

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    if ((e.target as HTMLElement).closest?.("button, a, [role=\"button\"]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDraggingId(id);
    const pos = getPosition(id, 0);
    const newZ = maxZIndex + 1;
    setMaxZIndex(newZ);
    setPosition(id, { z: newZ });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !boardRef.current) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    const newX = Math.max(0, e.clientX - boardRect.left - dragOffset.x);
    const newY = Math.max(0, e.clientY - boardRect.top - dragOffset.y);
    setPosition(draggingId, { x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDraggingId(null);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = getPosition(id, 0);
    setPosition(id, { pinned: !pos.pinned });
  };

  async function reload() {
    const fresh = await getMeetingNotesForBoard();
    setNotes(fresh);
  }

  useEffect(() => {
    if (noteIdFromQuery && notes.length > 0 && !deepLinkHandled.current) {
      const target = notes.find((n) => n.id === noteIdFromQuery);
      if (target) {
        const c = target.content;
        const meetingAt = target.meetingAt instanceof Date ? target.meetingAt : new Date(target.meetingAt);
        setFormData({
          title: contentTitle(c),
          client: target.contactId ?? "",
          date: meetingAt.toISOString().slice(0, 10),
          time: meetingAt.toISOString().slice(11, 16),
          type: target.domain || "hypo",
          content: contentBody(c),
          recommendation: contentRecommendation(c),
        });
        setEditingId(target.id);
        setIsModalOpen(true);
        deepLinkHandled.current = true;
      }
    }
  }, [noteIdFromQuery, notes]);

  const handleOpenNew = () => {
    const today = new Date().toISOString().slice(0, 10);
    setFormData({ ...defaultForm, date: today });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (note: MeetingNoteForBoard, e: React.MouseEvent) => {
    e.stopPropagation();
    const c = note.content;
    const meetingAt = note.meetingAt instanceof Date ? note.meetingAt : new Date(note.meetingAt);
    setFormData({
      title: contentTitle(c),
      client: note.contactId ?? "",
      date: meetingAt.toISOString().slice(0, 10),
      time: meetingAt.toISOString().slice(11, 16),
      type: note.domain || "hypo",
      content: contentBody(c),
      recommendation: contentRecommendation(c),
    });
    setEditingId(note.id);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await deleteMeetingNote(editingId);
      const next = { ...positions };
      delete next[editingId];
      persistPositions(next);
      await reload();
      setIsModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) return;
    setSaving(true);
    try {
      const content: Record<string, unknown> = {
        title: formData.title.trim(),
        cas: formData.time.trim(),
        ucastnici: "",
        obsah: formData.content.trim(),
        doporuceni: formData.recommendation.trim(),
        dalsi_kroky: formData.recommendation.trim(),
      };
      const meetingAt = formData.date && formData.time
        ? `${formData.date}T${formData.time}:00`
        : formData.date
          ? `${formData.date}T12:00:00`
          : new Date().toISOString();

      if (editingId) {
        await updateMeetingNote(editingId, {
          content,
          domain: formData.type,
          meetingAt,
        });
      } else {
        const newId = await createMeetingNote({
          contactId: formData.client?.trim() || null,
          meetingAt,
          domain: formData.type,
          content,
        });
        if (newId && boardRef.current) {
          const boardRect = boardRef.current.getBoundingClientRect();
          const spawnX = boardRect.width / 2 - 170 + (Math.random() * 40 - 20);
          const spawnY = boardRect.height / 2 - 150 + (Math.random() * 40 - 20);
          const newZ = maxZIndex + 1;
          setMaxZIndex(newZ);
          persistPositions({
            ...positions,
            [newId]: { x: Math.max(20, spawnX), y: Math.max(20, spawnY), z: newZ, pinned: false },
          });
        }
      }
      await reload();
      setIsModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const filteredNotes = searchQuery.trim()
    ? notes.filter((n) => noteMatchesSearch(n, searchQuery))
    : notes;

  const isFormValid = formData.title.trim() !== "";

  const contactOptions = [
    { value: "", label: "Obecný zápisek" },
    ...contacts.map((c) => ({
      value: c.id,
      label: [c.firstName, c.lastName].filter(Boolean).join(" ") || "—",
    })),
  ];

  return (
    <div className="portal-notes-board-light flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--wp-main-scroll-bg)] font-sans">
      <style>{`
        .notes-dot-grid {
          background-image: radial-gradient(var(--wp-canvas-dot-color) 1.5px, transparent 0);
          background-size: 28px 28px;
        }
        .notes-glass-card {
          background: color-mix(in srgb, var(--wp-surface-card) 94%, transparent);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .notes-no-scrollbar::-webkit-scrollbar { display: none; }
        .notes-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--wp-surface-muted)] text-indigo-600">
            <FileText size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-none tracking-tight text-[color:var(--wp-text)] md:text-lg">Zápisky</h1>
            <p className="mt-0.5 hidden text-[11px] font-bold uppercase leading-none tracking-wider text-[color:var(--wp-text-muted)] md:block">Nástěnka zápisků</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <button
            type="button"
            disabled={aiLoading || notes.length === 0}
            onClick={async () => {
              setAiLoading(true);
              try {
                const result = await summarizeMeetingNotes();
                setAiSummary(result);
              } catch {
                setAiSummary("Sumarizace se nezdařila.");
              } finally {
                setAiLoading(false);
              }
            }}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-500/10 to-indigo-500/5 px-2 py-2 text-xs font-bold text-[color:var(--wp-text)] shadow-sm transition-all hover:border-fuchsia-500/35 hover:from-fuchsia-500/14 disabled:opacity-50 md:px-3 md:text-sm"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--wp-surface-card-border)] bg-white">
              <AiAssistantBrandIcon size={18} className="max-h-full max-w-full" />
            </span>
            <span className="font-black tracking-wide">{aiLoading ? "Zpracovávám…" : "Sumarizace"}</span>
          </button>
          <CreateActionButton type="button" onClick={handleOpenNew} className="min-w-[44px]">
            <span className="hidden sm:inline">Nový zápis</span>
          </CreateActionButton>
        </div>
      </div>

      {isMobile && (
        <div className="mx-4 mt-3 flex shrink-0 rounded-lg border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)] p-1">
          <button
            type="button"
            onClick={() => setMobileTabPersist("feed")}
            className={`min-h-[44px] flex-1 rounded-md py-2.5 text-sm font-bold transition-all ${mobileTab === "feed" ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm" : "text-[color:var(--wp-text-secondary)]"}`}
          >
            Zápisky
          </button>
          <button
            type="button"
            onClick={() => setMobileTabPersist("board")}
            className={`min-h-[44px] flex-1 rounded-md py-2.5 text-sm font-bold transition-all ${mobileTab === "board" ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm" : "text-[color:var(--wp-text-secondary)]"}`}
          >
            Board
          </button>
        </div>
      )}

      {isMobile && mobileTab === "feed" && (
        <main className="flex-1 overflow-auto min-h-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {filteredNotes.length === 0 ? (
            <div className="p-6 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-[color:var(--wp-surface-muted)]">
                <FileText size={28} className="text-aidv-create" />
              </div>
              <h2 className="text-lg font-bold text-[color:var(--wp-text)] mb-2">Žádné zápisky</h2>
              <p className="text-[color:var(--wp-text-secondary)] text-sm mb-6">Vytvořte zápisek nebo přepněte na Board.</p>
              <CreateActionButton type="button" onClick={handleOpenNew}>
                Nový zápisek
              </CreateActionButton>
            </div>
          ) : (
            <ul className="p-4 space-y-3">
              {filteredNotes.map((note) => {
                const design = getProductDesign(note.domain);
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={(e) => handleOpenEdit(note, e)}
                      className="notes-glass-card min-h-[44px] w-full rounded-2xl border border-[color:var(--wp-surface-card-border)] p-4 text-left shadow-lg transition-shadow active:scale-[0.99]"
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase border ${design.color}`}>
                          {design.icon}
                          {DOMAINS.find((d) => d.value === note.domain)?.label ?? note.domain}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--wp-text-tertiary)]">
                          <Calendar size={12} />
                          {formatDateCZ(note.meetingAt)}
                        </div>
                      </div>
                      <h3 className="font-bold text-[color:var(--wp-text)] text-base leading-tight mb-2">
                        {contentTitle(note.content)}
                      </h3>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-[color:var(--wp-surface-muted)] flex items-center justify-center border border-[color:var(--wp-surface-card-border)]">
                          <User size={12} className="text-[color:var(--wp-text-secondary)]" />
                        </div>
                        <span className="text-sm font-medium text-[color:var(--wp-text-secondary)]">{note.contactName}</span>
                      </div>
                      <p className="text-[13px] text-[color:var(--wp-text-secondary)] leading-relaxed line-clamp-2">
                        {contentBody(note.content) || <span className="text-[color:var(--wp-text-tertiary)] italic">Bez obsahu…</span>}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      )}

      <main
        ref={boardRef}
        className={`relative flex-1 min-h-[min(420px,58dvh)] cursor-crosshair overflow-auto notes-dot-grid md:min-h-[min(560px,72vh)] ${
          isMobile && mobileTab === "board" ? "mx-4 max-h-[min(70dvh,520px)] rounded-xl border border-[color:var(--wp-surface-card-border)]" : ""
        } ${isMobile && mobileTab === "feed" ? "hidden" : ""}`}
      >
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
              <CreateActionButton type="button" onClick={handleOpenNew} className="px-8 py-4 shadow-xl">
                Vytvořit první zápisek
              </CreateActionButton>
            </div>
          </div>
        )}

        {filteredNotes.length === 0 && notes.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-[color:var(--wp-text-secondary)] font-medium">Žádné zápisky neodpovídají hledání.</p>
          </div>
        )}

        {filteredNotes.map((note, index) => {
          const design = getProductDesign(note.domain);
          const pos = getPosition(note.id, index);
          const isDragging = draggingId === note.id;

          return (
            <div
              key={note.id}
              onPointerDown={(e) => handlePointerDown(e, note.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                zIndex: isDragging ? 9999 : pos.z,
                touchAction: "none",
              }}
              className={`
                notes-glass-card w-[350px] rounded-2xl border transition-shadow duration-300
                ${isDragging ? "shadow-2xl scale-[1.02] cursor-grabbing opacity-95" : "shadow-lg cursor-grab hover:shadow-xl"}
                ${pos.pinned ? `border-[color:var(--wp-border-strong)] shadow-[0_0_20px_-5px_rgba(0,0,0,0.1)] ${design.glow}` : "border-[color:var(--wp-surface-card-border)]"}
              `}
            >
              <div className="flex items-center justify-between rounded-t-2xl border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/90 px-4 py-2.5">
                <GripHorizontal size={18} className="text-[color:var(--wp-text-tertiary)]" />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => handleOpenEdit(note, e)}
                    className="p-1.5 rounded-full text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] hover:text-indigo-600 hover:shadow-sm transition-all"
                    title="Upravit zápisek"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => togglePin(note.id, e)}
                    className={`p-1.5 rounded-full transition-all ${pos.pinned ? "bg-amber-100 text-amber-600 shadow-sm" : "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] hover:text-[color:var(--wp-text-secondary)] hover:shadow-sm"}`}
                    title="Připnout"
                  >
                    <Pin size={14} className={pos.pinned ? "fill-current" : ""} />
                  </button>
                </div>
              </div>
              <div className="p-5">
                <div className="flex justify-between items-center mb-4">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase border ${design.color}`}>
                    {design.icon}
                    {DOMAINS.find((d) => d.value === note.domain)?.label ?? note.domain}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[color:var(--wp-text-tertiary)]">
                    <Calendar size={12} />
                    {formatDateCZ(note.meetingAt)}
                  </div>
                </div>
                <h3 className="font-bold text-[color:var(--wp-text)] text-lg leading-tight mb-2 pr-2">
                  {contentTitle(note.content)}
                </h3>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-[color:var(--wp-surface-muted)] flex items-center justify-center border border-[color:var(--wp-surface-card-border)]">
                    <User size={12} className="text-[color:var(--wp-text-secondary)]" />
                  </div>
                  <span className="text-sm font-bold text-[color:var(--wp-text-secondary)]">{note.contactName}</span>
                </div>
                <div className="border-t border-[color:var(--wp-surface-card-border)] pt-3 space-y-3">
                  <p className="text-[13px] text-[color:var(--wp-text-secondary)] leading-relaxed font-medium">
                    {contentBody(note.content) || <span className="text-[color:var(--wp-text-tertiary)] italic">Bez obsahu…</span>}
                  </p>
                  {contentRecommendation(note.content) && (
                    <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">
                        <CheckCircle2 size={12} /> Další kroky
                      </div>
                      <p className="text-[13px] text-amber-900 leading-relaxed font-medium">
                        {contentRecommendation(note.content)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </main>

      {aiSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden border border-[color:var(--wp-surface-card-border)]">
            <div className="flex items-center justify-between border-b border-[color:var(--wp-surface-card-border)] px-6 py-4">
              <h2 className="flex min-w-0 items-center gap-3 text-lg font-bold text-[color:var(--wp-text)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white shadow-sm">
                  <AiAssistantBrandIcon size={24} className="max-h-full max-w-full" />
                </span>
                <span className="truncate font-black tracking-tight">Sumarizace</span>
              </h2>
              <button
                type="button"
                onClick={() => setAiSummary(null)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-raised)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap text-sm text-[color:var(--wp-text-secondary)] font-medium leading-relaxed">{aiSummary}</pre>
            </div>
            <div className="px-6 py-4 border-t border-[color:var(--wp-surface-card-border)] flex justify-end">
              <button
                type="button"
                onClick={() => setAiSummary(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-sm border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-all min-h-[44px]"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}>
          <div className="bg-[color:var(--wp-surface-card)] w-full max-w-[480px] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-8 py-6 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80">
              <div>
                <h2 className="font-bold text-xl text-[color:var(--wp-text)]">
                  {editingId ? "Upravit zápisek" : "Nový zápisek"}
                </h2>
                <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mt-1">Zápisky</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-11 h-11 rounded-full bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] flex items-center justify-center text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)] transition-colors shadow-sm"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto notes-no-scrollbar px-8 py-6 space-y-8">
              <div className="space-y-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] border-b border-[color:var(--wp-surface-card-border)] pb-2">Základní info</h3>
                <div>
                  <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Název zápisku *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Např. Úvodní schůzka k hypotéce"
                    className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Kontakt / Klient (nepovinné)</label>
                  <CustomDropdown
                    value={formData.client}
                    onChange={(id) => setFormData({ ...formData, client: id })}
                    options={contactOptions.map((c) => ({ id: c.value, label: c.label }))}
                    placeholder="Vybrat klienta"
                    icon={User}
                    lightIsland
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Datum schůzky</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Čas</label>
                    <input
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Doména (Typ)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DOMAINS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: d.value })}
                        className={`px-3 py-2.5 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-2
                          ${formData.type === d.value ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm" : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:border-indigo-300"}`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] border-b border-[color:var(--wp-surface-card-border)] pb-2">Obsah schůzky</h3>
                <div>
                  <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Klíčové body (Obsah)</label>
                  <textarea
                    rows={5}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Co se na schůzce probíralo..."
                    className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 resize-none leading-relaxed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Další kroky / Doporučení</label>
                  <textarea
                    rows={3}
                    value={formData.recommendation}
                    onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
                    placeholder="Úkoly pro klienta nebo pro vás..."
                    className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400 resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] flex items-center justify-between gap-3">
              {editingId ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex items-center justify-center w-12 h-12 bg-[color:var(--wp-surface-card)] border border-red-200 text-red-500 rounded-xl hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm disabled:opacity-50"
                  title="Smazat zápisek"
                >
                  <Trash2 size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl font-bold hover:bg-[color:var(--wp-surface-muted)] transition-colors shadow-sm"
                >
                  Zrušit
                </button>
              )}
              <CreateActionButton
                type="button"
                onClick={handleSave}
                disabled={!isFormValid}
                isLoading={saving}
                icon={Check}
                className="min-w-0 flex-1 shadow-lg"
              >
                {saving ? "Ukládám…" : editingId ? "Uložit změny" : "Přidat na plátno"}
              </CreateActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotesBoardSuspenseFallback() {
  return (
    <div className="portal-notes-board-light flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--wp-main-scroll-bg)] font-sans">
      <div className="flex h-14 shrink-0 animate-pulse items-center justify-between gap-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4" />
      <div className="notes-dot-grid m-4 min-h-[200px] flex-1 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-inset)]/40 animate-pulse" />
      <style>{`
        .notes-dot-grid {
          background-image: radial-gradient(var(--wp-canvas-dot-color) 1.5px, transparent 0);
          background-size: 28px 28px;
        }
      `}</style>
    </div>
  );
}

export function NotesVisionBoard(props: {
  initialNotes: MeetingNoteForBoard[];
  contacts: ContactRow[];
  initialSearchQuery: string;
  initialNoteId: string | null;
}) {
  return (
    <Suspense fallback={<NotesBoardSuspenseFallback />}>
      <NotesVisionBoardInner {...props} />
    </Suspense>
  );
}
