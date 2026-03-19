"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
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
  Sparkles,
  Edit2,
  Trash2,
  FileText,
  CheckCircle2,
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

const BOARD_POSITIONS_KEY = "portal-notes-board-positions";

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

export function NotesVisionBoard({
  initialNotes,
  contacts,
}: {
  initialNotes: MeetingNoteForBoard[];
  contacts: ContactRow[];
}) {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
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
  const [mobileTab, setMobileTab] = useState<"feed" | "board">("feed");
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
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
    <div className="flex flex-col h-full min-h-0 bg-[#f8fafc] overflow-hidden font-sans">
      <style>{`
        .notes-dot-grid {
          background-image: radial-gradient(#cbd5e1 1.5px, transparent 0);
          background-size: 28px 28px;
        }
        .notes-glass-card {
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .notes-no-scrollbar::-webkit-scrollbar { display: none; }
        .notes-no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white/80 shrink-0 gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 text-indigo-600">
            <FileText size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-base md:text-lg text-slate-900 tracking-tight leading-none truncate" style={{ color: "var(--wp-text)" }}>Zápisky</h1>
            <p className="text-[11px] font-bold tracking-wider uppercase leading-none mt-0.5 hidden md:block" style={{ color: "var(--wp-text-muted)" }}>Nástěnka zápisků</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {!isMobile && (
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
              className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 hover:shadow-md rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            >
              <Sparkles size={16} className="text-amber-500" /> {aiLoading ? "Zpracovávám…" : "AI Sumarizace"}
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenNew}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1a1c2e] text-white rounded-xl font-bold text-sm hover:bg-[#2a2d4a] shadow-lg transition-all active:scale-95 min-h-[44px] min-w-[44px]"
          >
            <Plus size={18} /> <span className="hidden sm:inline">Nový zápis</span>
          </button>
        </div>
      </div>

      {isMobile && (
        <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-100/80 mx-4 mt-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab("feed")}
            className={`flex-1 py-2.5 text-sm font-bold rounded-md transition-all min-h-[44px] ${mobileTab === "feed" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            Zápisky
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("board")}
            className={`flex-1 py-2.5 text-sm font-bold rounded-md transition-all min-h-[44px] ${mobileTab === "board" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            Board
          </button>
        </div>
      )}

      {isMobile && mobileTab === "feed" && (
        <main className="flex-1 overflow-auto min-h-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {filteredNotes.length === 0 ? (
            <div className="p-6 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-slate-100">
                <FileText size={28} style={{ color: "var(--brand-main)" }} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 mb-2">Žádné zápisky</h2>
              <p className="text-slate-500 text-sm mb-6">Vytvořte zápisek nebo přepněte na Board.</p>
              <button
                type="button"
                onClick={handleOpenNew}
                className="flex items-center gap-2 px-6 py-3 text-white rounded-xl font-bold shadow-lg"
                style={{ backgroundColor: "var(--brand-main)" }}
              >
                <Plus size={20} /> Nový zápisek
              </button>
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
                      className="w-full text-left notes-glass-card rounded-2xl border border-slate-100 shadow-lg p-4 transition-shadow active:scale-[0.99] min-h-[44px]"
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase border ${design.color}`}>
                          {design.icon}
                          {DOMAINS.find((d) => d.value === note.domain)?.label ?? note.domain}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                          <Calendar size={12} />
                          {formatDateCZ(note.meetingAt)}
                        </div>
                      </div>
                      <h3 className="font-bold text-slate-800 text-base leading-tight mb-2">
                        {contentTitle(note.content)}
                      </h3>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                          <User size={12} className="text-slate-500" />
                        </div>
                        <span className="text-sm font-medium text-slate-600">{note.contactName}</span>
                      </div>
                      <p className="text-[13px] text-slate-600 leading-relaxed line-clamp-2">
                        {contentBody(note.content) || <span className="text-slate-400 italic">Bez obsahu…</span>}
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
        className={`flex-1 relative overflow-auto notes-dot-grid cursor-crosshair min-h-0 ${
          isMobile && mobileTab === "board" ? "max-h-[55vh] rounded-xl mx-4 border border-slate-200" : ""
        } ${isMobile && mobileTab === "feed" ? "hidden" : ""}`}
      >
        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/80 backdrop-blur-xl p-10 rounded-[32px] border border-slate-200 shadow-2xl flex flex-col items-center max-w-md text-center pointer-events-auto">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: "var(--wp-surface-hover)" }}>
                <FileText size={40} style={{ color: "var(--brand-main)" }} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-3">Plátno je prázdné</h2>
              <p className="text-slate-500 mb-8 leading-relaxed">
                Všechny zápisky ze schůzek můžete mít zde jako karty a libovolně je přesouvat.
              </p>
              <button
                type="button"
                onClick={handleOpenNew}
                className="flex items-center gap-2 px-8 py-4 text-white rounded-2xl font-bold text-lg shadow-lg transition-all active:scale-95"
                style={{ backgroundColor: "var(--brand-main)" }}
              >
                <Plus size={24} /> Vytvořit první zápisek
              </button>
            </div>
          </div>
        )}

        {filteredNotes.length === 0 && notes.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-slate-500 font-medium">Žádné zápisky neodpovídají hledání.</p>
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
                ${pos.pinned ? `border-slate-300 shadow-[0_0_20px_-5px_rgba(0,0,0,0.1)] ${design.glow}` : "border-slate-100"}
              `}
            >
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-100/80 rounded-t-2xl">
                <GripHorizontal size={18} className="text-slate-300" />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => handleOpenEdit(note, e)}
                    className="p-1.5 rounded-full text-slate-400 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all"
                    title="Upravit zápisek"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => togglePin(note.id, e)}
                    className={`p-1.5 rounded-full transition-all ${pos.pinned ? "bg-amber-100 text-amber-600 shadow-sm" : "text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm"}`}
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
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                    <Calendar size={12} />
                    {formatDateCZ(note.meetingAt)}
                  </div>
                </div>
                <h3 className="font-bold text-slate-800 text-lg leading-tight mb-2 pr-2">
                  {contentTitle(note.content)}
                </h3>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                    <User size={12} className="text-slate-500" />
                  </div>
                  <span className="text-sm font-bold text-slate-600">{note.contactName}</span>
                </div>
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <p className="text-[13px] text-slate-600 leading-relaxed font-medium">
                    {contentBody(note.content) || <span className="text-slate-400 italic">Bez obsahu…</span>}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" /> AI Sumarizace
              </h2>
              <button
                type="button"
                onClick={() => setAiSummary(null)}
                className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap text-sm text-slate-700 font-medium leading-relaxed">{aiSummary}</pre>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setAiSummary(null)}
                className="px-5 py-2.5 bg-[#1a1c2e] text-white rounded-xl font-bold text-sm hover:bg-[#2a2d4a] transition-all"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white w-full max-w-[480px] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="font-bold text-xl text-slate-800">
                  {editingId ? "Upravit zápisek" : "Nový zápisek"}
                </h2>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Zápisky</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-11 h-11 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors shadow-sm"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto notes-no-scrollbar px-8 py-6 space-y-8">
              <div className="space-y-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Základní info</h3>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Název zápisku *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Např. Úvodní schůzka k hypotéce"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Kontakt / Klient (nepovinné)</label>
                  <CustomDropdown
                    value={formData.client}
                    onChange={(id) => setFormData({ ...formData, client: id })}
                    options={contactOptions.map((c) => ({ id: c.value, label: c.label }))}
                    placeholder="Vybrat klienta"
                    icon={User}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Datum schůzky</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Čas</label>
                    <input
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Doména (Typ)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DOMAINS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: d.value })}
                        className={`px-3 py-2.5 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-2
                          ${formData.type === d.value ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"}`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Obsah schůzky</h3>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Klíčové body (Obsah)</label>
                  <textarea
                    rows={5}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Co se na schůzce probíralo..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 resize-none leading-relaxed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Další kroky / Doporučení</label>
                  <textarea
                    rows={3}
                    value={formData.recommendation}
                    onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
                    placeholder="Úkoly pro klienta nebo pro vás..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400 resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              {editingId ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex items-center justify-center w-12 h-12 bg-white border border-red-200 text-red-500 rounded-xl hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm disabled:opacity-50"
                  title="Smazat zápisek"
                >
                  <Trash2 size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Zrušit
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!isFormValid || saving}
                className="flex-1 py-3.5 bg-[#1a1c2e] text-white rounded-xl font-bold shadow-lg hover:bg-[#2a2d4a] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Ukládám…" : editingId ? "Uložit změny" : "Přidat na plátno"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

