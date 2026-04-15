"use client";

import React, { Suspense, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Pin,
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
  ChevronDown,
  PiggyBank,
  Landmark,
  Briefcase,
} from "lucide-react";
import {
  getMeetingNotesForBoard,
  createMeetingNote,
  updateMeetingNote,
  deleteMeetingNote,
  summarizeMeetingNotes,
  createOpportunityFromMeetingNote,
} from "@/app/actions/meeting-notes";
import { saveNotesBoardPositions } from "@/app/actions/notes-board-positions";
import { getPipeline } from "@/app/actions/pipeline";
import type { StageWithOpportunities } from "@/app/actions/pipeline";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import type { NotesBoardStoredPosition } from "@/app/actions/notes-board-positions";
import type { ContactNamePickerRow } from "@/app/actions/contacts";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";

/** Legacy cache (jen migrace → server); nové pozice jdou výhradně do DB. */
const BOARD_POSITIONS_KEY = "portal-notes-board-positions";
const MOBILE_TAB_KEY = "portal-notes-mobile-tab";
const NOTE_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DOMAINS = [
  { value: "hypo", label: "Hypotéka" },
  { value: "investice", label: "Investice" },
  { value: "pojisteni", label: "Pojištění" },
  { value: "dps", label: "Penzijní spoření" },
  { value: "uvery", label: "Úvěry" },
  { value: "komplex", label: "Komplexní plán" },
];

/** x,y jsou 0–1 relativně k rozměrům plátna (stejné jako v DB). */
type BoardPosition = NotesBoardStoredPosition;

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
    case "dps":
      return {
        icon: <PiggyBank size={14} />,
        color: "text-amber-700 bg-amber-100 border-amber-200",
        glow: "shadow-amber-500/30",
      };
    case "uvery":
      return {
        icon: <Landmark size={14} />,
        color: "text-slate-700 bg-slate-100 border-slate-200",
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

function defaultBoardPositionForIndex(index: number): BoardPosition {
  return {
    x: Math.min(0.88, 0.04 + (index % 3) * 0.28),
    y: Math.min(0.82, 0.06 + Math.floor(index / 3) * 0.22),
    z: index + 1,
    pinned: false,
  };
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
  initialBoardPositions,
}: {
  initialNotes: MeetingNoteForBoard[];
  contacts: ContactNamePickerRow[];
  initialSearchQuery: string;
  initialNoteId: string | null;
  initialBoardPositions: Record<string, NotesBoardStoredPosition>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchQuery = searchParams.get("q") ?? initialSearchQuery;
  const noteIdFromQuery = searchParams.get("noteId") ?? initialNoteId ?? "";
  const [notes, setNotes] = useState(initialNotes);
  const [positions, setPositions] = useState<Record<string, BoardPosition>>(initialBoardPositions);
  const latestPositionsRef = useRef<Record<string, BoardPosition>>(initialBoardPositions);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const legacyLocalStorageMigrated = useRef(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [maxZIndex, setMaxZIndex] = useState(() =>
    Math.max(10, ...Object.values(initialBoardPositions).map((p) => p.z))
  );
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<"feed" | "board">("board");
  const boardRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef(0);
  const deepLinkHandled = useRef(false);
  const contactFromQueryHandled = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(
    () => () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    },
    []
  );

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
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  const [attachNote, setAttachNote] = useState<MeetingNoteForBoard | null>(null);
  const [pipelineStages, setPipelineStages] = useState<StageWithOpportunities[]>([]);
  const [attachStageId, setAttachStageId] = useState<string>("");
  const [attachDealTitle, setAttachDealTitle] = useState("");
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachSaving, setAttachSaving] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const flushSaveBoardPositions = useCallback(async (next: Record<string, BoardPosition>) => {
    try {
      await saveNotesBoardPositions(next);
    } catch (err) {
      console.error("[NotesVisionBoard] saveNotesBoardPositions", err);
    }
  }, []);

  const persistPositions = useCallback(
    (next: Record<string, BoardPosition>) => {
      latestPositionsRef.current = next;
      setPositions(next);
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = setTimeout(() => {
        saveDebounceRef.current = null;
        void flushSaveBoardPositions(next);
      }, 400);
    },
    [flushSaveBoardPositions]
  );

  const getPosition = useCallback(
    (id: string, index: number): BoardPosition => {
      if (positions[id]) return positions[id];
      return defaultBoardPositionForIndex(index);
    },
    [positions]
  );

  const setPosition = useCallback(
    (id: string, index: number, patch: Partial<BoardPosition>) => {
      setPositions((prev) => {
        const prevPos = prev[id] ?? defaultBoardPositionForIndex(index);
        const next = { ...prev, [id]: { ...prevPos, ...patch } };
        latestPositionsRef.current = next;
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = setTimeout(() => {
          saveDebounceRef.current = null;
          void flushSaveBoardPositions(latestPositionsRef.current);
        }, 400);
        return next;
      });
    },
    [flushSaveBoardPositions]
  );

  const handlePointerDown = (e: React.PointerEvent, id: string, index: number) => {
    if ((e.target as HTMLElement).closest?.("button, a, [role=\"button\"]")) return;
    dragIndexRef.current = index;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDraggingId(id);
    const newZ = maxZIndex + 1;
    setMaxZIndex(newZ);
    setPosition(id, index, { z: newZ });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !boardRef.current) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    const w = boardRect.width;
    const h = boardRect.height;
    if (w <= 0 || h <= 0) return;
    const px = Math.max(0, e.clientX - boardRect.left - dragOffset.x);
    const py = Math.max(0, e.clientY - boardRect.top - dragOffset.y);
    setPosition(draggingId, dragIndexRef.current, { x: Math.min(1, px / w), y: Math.min(1, py / h) });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const wasDragging = draggingId != null;
    setDraggingId(null);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (wasDragging) {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      void flushSaveBoardPositions(latestPositionsRef.current);
    }
  };

  const togglePin = (id: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = getPosition(id, index);
    setPosition(id, index, { pinned: !pos.pinned });
  };

  async function reload() {
    const fresh = await getMeetingNotesForBoard();
    setNotes(fresh);
  }

  const openAttachToDeal = useCallback(async (note: MeetingNoteForBoard) => {
    setAttachNote(note);
    setAttachDealTitle(contentTitle(note.content));
    setAttachLoading(true);
    try {
      const stages = await getPipeline();
      setPipelineStages(stages);
      setAttachStageId(stages[0]?.id ?? "");
    } catch {
      setPipelineStages([]);
      setAttachStageId("");
    } finally {
      setAttachLoading(false);
    }
  }, []);

  const closeAttachModal = useCallback(() => {
    setAttachNote(null);
    setPipelineStages([]);
    setAttachStageId("");
    setAttachDealTitle("");
  }, []);

  const handleCreateDealFromNote = async () => {
    if (!attachNote || !attachStageId) return;
    setAttachSaving(true);
    try {
      await createOpportunityFromMeetingNote(attachNote.id, attachStageId, attachDealTitle);
      await reload();
      closeAttachModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Chyba při vytváření obchodu.");
    } finally {
      setAttachSaving(false);
    }
  };

  useEffect(() => {
    if (Object.keys(initialBoardPositions).length > 0) {
      try {
        localStorage.removeItem(BOARD_POSITIONS_KEY);
      } catch {
        /* ignore */
      }
      legacyLocalStorageMigrated.current = true;
      return;
    }
    if (legacyLocalStorageMigrated.current) return;
    const timer = window.setTimeout(() => {
      if (legacyLocalStorageMigrated.current) return;
      const el = boardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 64 || r.height < 64) return;
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(BOARD_POSITIONS_KEY);
      } catch {
        legacyLocalStorageMigrated.current = true;
        return;
      }
      if (!raw) {
        legacyLocalStorageMigrated.current = true;
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        legacyLocalStorageMigrated.current = true;
        try {
          localStorage.removeItem(BOARD_POSITIONS_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        legacyLocalStorageMigrated.current = true;
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
      legacyLocalStorageMigrated.current = true;
      try {
        localStorage.removeItem(BOARD_POSITIONS_KEY);
      } catch {
        /* ignore */
      }
      if (Object.keys(next).length === 0) return;
      latestPositionsRef.current = next;
      setPositions(next);
      void flushSaveBoardPositions(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialBoardPositions, mobileTab, isMobile, flushSaveBoardPositions]);

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

  useEffect(() => {
    if (contactFromQueryHandled.current) return;
    const nid = searchParams.get("noteId") ?? initialNoteId ?? "";
    if (nid) return;
    const cid = searchParams.get("contactId")?.trim();
    if (!cid) return;
    contactFromQueryHandled.current = true;
    const today = new Date().toISOString().slice(0, 10);
    setFormData({
      title: "",
      client: cid,
      date: today,
      time: "",
      type: "hypo",
      content: "",
      recommendation: "",
    });
    setEditingId(null);
    setIsModalOpen(true);
    router.replace("/portal/notes", { scroll: false });
  }, [searchParams, initialNoteId, router]);

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
      const next = { ...latestPositionsRef.current };
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
          contactId: formData.client?.trim() || null,
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
          const bw = boardRect.width;
          const bh = boardRect.height;
          const cardHalfW = Math.min(175, bw * 0.11);
          const spawnPxX = bw / 2 - cardHalfW + (Math.random() * 40 - 20);
          const spawnPxY = bh / 2 - 150 + (Math.random() * 40 - 20);
          const newZ = maxZIndex + 1;
          setMaxZIndex(newZ);
          const xRel = bw > 0 ? Math.min(1, Math.max(0, spawnPxX / bw)) : 0.5;
          const yRel = bh > 0 ? Math.min(1, Math.max(0, spawnPxY / bh)) : 0.5;
          persistPositions({
            ...latestPositionsRef.current,
            [newId]: { x: xRel, y: yRel, z: newZ, pinned: false },
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

  useEffect(() => {
    if (!attachNote || pipelineStages.length === 0) return;
    if (!pipelineStages.some((s) => s.id === attachStageId)) {
      setAttachStageId(pipelineStages[0].id);
    }
  }, [attachNote, pipelineStages, attachStageId]);

  const isFormValid = formData.title.trim() !== "";

  useEffect(() => {
    if (isModalOpen) {
      setContactPickerOpen(false);
      setContactSearch("");
    }
  }, [isModalOpen]);

  const filteredContactsForPicker = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contacts.filter((c) => {
      const blob = `${c.firstName} ${c.lastName} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
      return !q || blob.includes(q);
    });
  }, [contacts, contactSearch]);

  const selectedContactLabel = useMemo(() => {
    if (!formData.client) return "Obecný zápisek";
    const c = contacts.find((x) => x.id === formData.client);
    if (!c) return "Vyberte klienta";
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
    return name || c.email || "Klient";
  }, [formData.client, contacts]);

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
              <AiAssistantBrandIcon size={18} variant="colorOnWhite" className="max-h-full max-w-full" />
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
                  <li key={note.id} className="flex gap-2 items-stretch">
                    <button
                      type="button"
                      onClick={(e) => handleOpenEdit(note, e)}
                      className="notes-glass-card min-h-[44px] flex-1 rounded-2xl border border-[color:var(--wp-surface-card-border)] p-4 text-left shadow-lg transition-shadow active:scale-[0.99]"
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
                    {!note.opportunityId ? (
                    <button
                      type="button"
                      onClick={() => void openAttachToDeal(note)}
                      className="shrink-0 w-12 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] flex items-center justify-center text-indigo-600 shadow-sm active:scale-[0.98]"
                      title="Převést do obchodu"
                      aria-label="Převést do obchodu"
                    >
                      <Briefcase size={20} />
                    </button>
                    ) : null}
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
              onPointerDown={(e) => handlePointerDown(e, note.id, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                position: "absolute",
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                zIndex: isDragging ? 9999 : pos.z,
                touchAction: "none",
              }}
              className={`
                notes-glass-card w-[min(100%,clamp(220px,min(28vw,85vw),350px))] max-w-[min(100%,350px)] xl:max-w-[320px] 2xl:max-w-[350px] rounded-2xl border transition-shadow duration-300
                ${isDragging ? "shadow-2xl scale-[1.02] cursor-grabbing opacity-95" : "shadow-lg cursor-grab hover:shadow-xl"}
                ${pos.pinned ? `border-[color:var(--wp-border-strong)] shadow-[0_0_20px_-5px_rgba(0,0,0,0.1)] ${design.glow}` : "border-[color:var(--wp-surface-card-border)]"}
              `}
            >
              <div className="flex items-center justify-between rounded-t-2xl border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/90 px-4 py-2.5">
                <GripHorizontal size={18} className="text-[color:var(--wp-text-tertiary)]" />
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
                    onClick={(e) => handleOpenEdit(note, e)}
                    className="p-1.5 rounded-full text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] hover:text-indigo-600 hover:shadow-sm transition-all"
                    title="Upravit zápisek"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => togglePin(note.id, index, e)}
                    className={`p-1.5 rounded-full transition-all ${pos.pinned ? "bg-amber-100 text-amber-600 shadow-sm" : "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] hover:text-[color:var(--wp-text-secondary)] hover:shadow-sm"}`}
                    title="Připnout"
                  >
                    <Pin size={14} className={pos.pinned ? "fill-current" : ""} />
                  </button>
                </div>
              </div>
              <div className="p-4 xl:p-5">
                <div className="flex justify-between items-center mb-3 xl:mb-4">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] xl:text-[10px] font-bold tracking-wide uppercase border ${design.color}`}>
                    {design.icon}
                    {DOMAINS.find((d) => d.value === note.domain)?.label ?? note.domain}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] xl:text-xs font-bold text-[color:var(--wp-text-tertiary)]">
                    <Calendar size={12} />
                    {formatDateCZ(note.meetingAt)}
                  </div>
                </div>
                <h3 className="font-bold text-[color:var(--wp-text)] text-base xl:text-lg leading-tight mb-2 pr-2">
                  {contentTitle(note.content)}
                </h3>
                {note.opportunityId ? (
                  <div className="mb-3 xl:mb-4">
                    <Link
                      href={`/portal/pipeline/${note.opportunityId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-500/10 px-2.5 py-1 text-[10px] xl:text-[11px] font-bold uppercase tracking-wide text-indigo-700 hover:bg-indigo-500/15"
                    >
                      <Briefcase size={12} />
                      Navázáno na obchod
                    </Link>
                  </div>
                ) : null}
                <div className="flex items-center gap-2 mb-3 xl:mb-4">
                  <div className="w-6 h-6 rounded-full bg-[color:var(--wp-surface-muted)] flex items-center justify-center border border-[color:var(--wp-surface-card-border)]">
                    <User size={12} className="text-[color:var(--wp-text-secondary)]" />
                  </div>
                  <span className="text-xs xl:text-sm font-bold text-[color:var(--wp-text-secondary)]">{note.contactName}</span>
                </div>
                <div className="border-t border-[color:var(--wp-surface-card-border)] pt-3 space-y-3">
                  <p className="text-[12px] xl:text-[13px] text-[color:var(--wp-text-secondary)] leading-relaxed font-medium">
                    {contentBody(note.content) || <span className="text-[color:var(--wp-text-tertiary)] italic">Bez obsahu…</span>}
                  </p>
                  {contentRecommendation(note.content) && (
                    <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 xl:p-3">
                      <div className="flex items-center gap-1.5 text-[10px] xl:text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">
                        <CheckCircle2 size={12} /> Další kroky
                      </div>
                      <p className="text-[12px] xl:text-[13px] text-amber-900 leading-relaxed font-medium">
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

      {attachNote && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] p-4 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden border border-[color:var(--wp-surface-card-border)]">
            <div className="flex items-center justify-between border-b border-[color:var(--wp-surface-card-border)] px-6 py-4 shrink-0">
              <h2 className="text-lg font-bold text-[color:var(--wp-text)] pr-2">Nový obchod ze zápisku</h2>
              <button
                type="button"
                onClick={closeAttachModal}
                disabled={attachSaving}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-raised)] disabled:opacity-50"
                aria-label="Zavřít"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-3 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 shrink-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Zápisek</p>
              <p className="text-sm font-semibold text-[color:var(--wp-text)] truncate">{contentTitle(attachNote.content)}</p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
              {attachLoading ? (
                <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">Načítání fází…</p>
              ) : pipelineStages.length === 0 ? (
                <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
                  Žádné fáze obchodů nebo nemáte oprávnění k příležitostem.
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Fáze pipeline</label>
                    <CustomDropdown
                      value={attachStageId}
                      onChange={(id) => setAttachStageId(id)}
                      options={pipelineStages.map((s) => ({ id: s.id, label: s.name }))}
                      placeholder="Vyberte fázi"
                      icon={Briefcase}
                      lightIsland
                    />
                  </div>
                  <div>
                    <label htmlFor="attach-deal-title" className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">
                      Název obchodu
                    </label>
                    <input
                      id="attach-deal-title"
                      type="text"
                      value={attachDealTitle}
                      onChange={(e) => setAttachDealTitle(e.target.value)}
                      placeholder="Název případu v pipeline"
                      disabled={attachSaving}
                      className="w-full px-4 py-3 rounded-xl text-sm font-semibold border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] text-[color:var(--wp-text)] outline-none focus:ring-2 focus:ring-[color:var(--wp-header-input-focus-ring)] focus:border-[color:var(--wp-header-input-focus-border)] disabled:opacity-50"
                    />
                    <p className="mt-2 text-xs text-[color:var(--wp-text-tertiary)] leading-relaxed">
                      Založí se nový otevřený obchod ve zvolené fázi a zápisek k němu připojíme. Typ případu odpovídá oblasti zápisku; klient se přenese z pole zápisku, pokud je vyplněný.
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[color:var(--wp-surface-card-border)] flex flex-wrap justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={closeAttachModal}
                disabled={attachSaving}
                className="px-5 py-2.5 rounded-xl font-bold text-sm border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-all min-h-[44px] disabled:opacity-50"
              >
                Zrušit
              </button>
              <CreateActionButton
                type="button"
                disabled={attachSaving || attachLoading || !attachStageId || pipelineStages.length === 0}
                onClick={() => void handleCreateDealFromNote()}
              >
                {attachSaving ? "Vytvářím…" : "Vytvořit obchod"}
              </CreateActionButton>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm animate-in fade-in duration-300"
          onMouseDown={(e) => {
            // Zavřít jen při stisku přímo na backdrop (ne při click po výběru textu z textarea — ten končí mouseupem na backdrop).
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="bg-[color:var(--wp-surface-card)] w-full max-w-[480px] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
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
                <div className="relative z-10">
                  <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Kontakt / Klient (nepovinné)</label>
                  <button
                    type="button"
                    onClick={() => setContactPickerOpen((o) => !o)}
                    className="w-full px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-between min-h-[44px] border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] hover:border-[color:var(--wp-header-input-focus-border)] focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-[color:var(--wp-header-input-focus-ring)] focus:border-[color:var(--wp-header-input-focus-border)] text-left"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <User size={18} className="shrink-0 text-[color:var(--wp-icon-default)]" />
                      <span className="truncate text-[color:var(--wp-text)]">{selectedContactLabel}</span>
                    </span>
                    <ChevronDown size={18} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
                  </button>
                  {contactPickerOpen && (
                    <>
                      <div className="fixed inset-0 z-[80]" onClick={() => setContactPickerOpen(false)} aria-hidden />
                      <div className="absolute left-0 right-0 top-full mt-1 z-[90] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-lg p-2 max-h-[min(70vh,320px)] flex flex-col">
                        <input
                          type="search"
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          placeholder="Hledat jméno, e-mail, telefon…"
                          className="w-full px-3 py-2.5 mb-2 rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-sm outline-none focus:ring-2 focus:ring-indigo-100"
                          autoFocus
                        />
                        <ul className="overflow-y-auto custom-dropdown-scroll flex-1 min-h-0 space-y-0.5">
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, client: "" });
                                setContactPickerOpen(false);
                              }}
                              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-[color:var(--wp-surface-muted)]"
                            >
                              Obecný zápisek
                            </button>
                          </li>
                          {filteredContactsForPicker.map((c) => {
                            const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
                            const sub = [c.email, c.phone].filter(Boolean).join(" · ");
                            return (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, client: c.id });
                                    setContactPickerOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-[color:var(--wp-surface-muted)]"
                                >
                                  <span className="font-medium text-[color:var(--wp-text)] block truncate">{name || c.email || c.id}</span>
                                  {sub ? <span className="text-xs text-[color:var(--wp-text-tertiary)] truncate block">{sub}</span> : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </>
                  )}
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
                  <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Oblast zápisu</label>
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
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex items-center justify-center w-12 h-12 bg-[color:var(--wp-surface-card)] border border-red-200 text-red-500 rounded-xl hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm disabled:opacity-50"
                    title="Smazat zápisek"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const n = notes.find((x) => x.id === editingId);
                      if (n) void openAttachToDeal(n);
                    }}
                    disabled={saving || !!notes.find((x) => x.id === editingId)?.opportunityId}
                    className="flex items-center justify-center w-12 h-12 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors shadow-sm disabled:opacity-50"
                    title={
                      notes.find((x) => x.id === editingId)?.opportunityId
                        ? "Zápisek je už navázaný na obchod"
                        : "Převést do obchodu"
                    }
                  >
                    <Briefcase size={18} />
                  </button>
                </div>
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
  contacts: ContactNamePickerRow[];
  initialSearchQuery: string;
  initialNoteId: string | null;
  initialBoardPositions: Record<string, NotesBoardStoredPosition>;
}) {
  return (
    <Suspense fallback={<NotesBoardSuspenseFallback />}>
      <NotesVisionBoardInner {...props} />
    </Suspense>
  );
}
