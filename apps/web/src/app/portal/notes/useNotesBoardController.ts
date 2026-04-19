"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createMeetingNote,
  createOpportunityFromMeetingNote,
  deleteMeetingNote,
  getMeetingNotesForBoard,
  summarizeMeetingNotes,
  updateMeetingNote,
  type MeetingNoteForBoard,
} from "@/app/actions/meeting-notes";
import { getPipeline, type StageWithOpportunities } from "@/app/actions/pipeline";
import {
  saveNotesBoardPositions,
  type NotesBoardStoredPosition,
} from "@/app/actions/notes-board-positions";
import type { ContactNamePickerRow } from "@/app/actions/contacts";

export type BoardPosition = NotesBoardStoredPosition;

/** Max. z-index pro karty na plátně (bring-to-front při uchopení). Musí zůstat pod NOTES_EDIT_DRAWER_Z. */
export const NOTES_BOARD_CARD_Z_RENDER_CAP = 99_998;
/** Pravý panel „Nový / Upravit zápisek" — nad všemi kartami i po dlouhém navyšování z při tažení. */
export const NOTES_EDIT_DRAWER_Z = 999_999;

export type NotesFormData = {
  title: string;
  client: string;
  date: string;
  time: string;
  type: string;
  content: string;
  recommendation: string;
};

const DEFAULT_FORM: NotesFormData = {
  title: "",
  client: "",
  date: "",
  time: "",
  type: "hypo",
  content: "",
  recommendation: "",
};

export function contentTitle(c: Record<string, unknown> | null): string {
  if (!c) return "Zápisek";
  if (typeof c.title === "string" && c.title.trim()) return c.title;
  const obsah = c.obsah;
  if (typeof obsah === "string" && obsah.trim()) return obsah.split("\n")[0].slice(0, 80) || "Zápisek";
  return "Zápisek";
}

export function contentBody(c: Record<string, unknown> | null): string {
  if (!c) return "";
  const o = c.obsah;
  return typeof o === "string" ? o : "";
}

export function contentRecommendation(c: Record<string, unknown> | null): string {
  if (!c) return "";
  const d = c.dalsi_kroky ?? c.doporuceni;
  return typeof d === "string" ? d : "";
}

export function defaultBoardPositionForIndex(index: number): BoardPosition {
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

export type NotesBoardController = ReturnType<typeof useNotesBoardController>;

export function useNotesBoardController(args: {
  initialNotes: MeetingNoteForBoard[];
  contacts: ContactNamePickerRow[];
  initialSearchQuery: string;
  initialNoteId: string | null;
  initialBoardPositions: Record<string, BoardPosition>;
}) {
  const { initialNotes, contacts, initialSearchQuery, initialNoteId, initialBoardPositions } = args;

  const searchParams = useSearchParams();
  const router = useRouter();
  const searchQuery = searchParams.get("q") ?? initialSearchQuery;
  const noteIdFromQuery = searchParams.get("noteId") ?? initialNoteId ?? "";

  const [notes, setNotes] = useState(initialNotes);
  const [positions, setPositions] = useState<Record<string, BoardPosition>>(initialBoardPositions);
  const latestPositionsRef = useRef<Record<string, BoardPosition>>(initialBoardPositions);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [maxZIndex, setMaxZIndex] = useState(() =>
    Math.min(
      NOTES_BOARD_CARD_Z_RENDER_CAP,
      Math.max(10, ...Object.values(initialBoardPositions).map((p) => p.z)),
    ),
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<NotesFormData>(DEFAULT_FORM);
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

  const deepLinkHandled = useRef(false);
  const contactFromQueryHandled = useRef(false);

  useEffect(
    () => () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    },
    [],
  );

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
    [flushSaveBoardPositions],
  );

  const flushPositionsNow = useCallback(() => {
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    void flushSaveBoardPositions(latestPositionsRef.current);
  }, [flushSaveBoardPositions]);

  const getPosition = useCallback(
    (id: string, index: number): BoardPosition => {
      if (positions[id]) return positions[id];
      return defaultBoardPositionForIndex(index);
    },
    [positions],
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
    [flushSaveBoardPositions],
  );

  const bumpZ = useCallback(
    (id: string, index: number) => {
      const next = Math.min(maxZIndex + 1, NOTES_BOARD_CARD_Z_RENDER_CAP);
      setMaxZIndex(next);
      setPosition(id, index, { z: next });
      return next;
    },
    [maxZIndex, setPosition],
  );

  const togglePin = useCallback(
    (id: string, index: number) => {
      const pos = getPosition(id, index);
      setPosition(id, index, { pinned: !pos.pinned });
    },
    [getPosition, setPosition],
  );

  const reload = useCallback(async () => {
    const fresh = await getMeetingNotesForBoard();
    setNotes(fresh);
  }, []);

  const openNew = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    setFormData({ ...DEFAULT_FORM, date: today });
    setEditingId(null);
    setIsModalOpen(true);
  }, []);

  const openEdit = useCallback((note: MeetingNoteForBoard) => {
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
  }, []);

  const closeEditor = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleDelete = useCallback(async () => {
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
  }, [editingId, persistPositions, reload]);

  /**
   * Uloží zápisek. Pokud vznikl nový (create), zavolá `onCreated` s jeho ID,
   * aby layout (free-board / masonry) mohl nastavit vlastní výchozí pozici
   * (např. první volný slot na plátně nebo append na konec masonry).
   */
  const save = useCallback(
    async (onCreated?: (newId: string) => void | Promise<void>) => {
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
        const meetingAt =
          formData.date && formData.time
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
          if (newId && onCreated) {
            await onCreated(newId);
          }
        }
        await reload();
        setIsModalOpen(false);
      } finally {
        setSaving(false);
      }
    },
    [editingId, formData, reload],
  );

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

  const handleCreateDealFromNote = useCallback(async () => {
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
  }, [attachNote, attachStageId, attachDealTitle, reload, closeAttachModal]);

  const summarize = useCallback(async () => {
    setAiLoading(true);
    try {
      const result = await summarizeMeetingNotes();
      setAiSummary(result);
    } catch {
      setAiSummary("Sumarizace se nezdařila.");
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (noteIdFromQuery && notes.length > 0 && !deepLinkHandled.current) {
      const target = notes.find((n) => n.id === noteIdFromQuery);
      if (target) {
        openEdit(target);
        deepLinkHandled.current = true;
      }
    }
  }, [noteIdFromQuery, notes, openEdit]);

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

  useEffect(() => {
    if (!attachNote || pipelineStages.length === 0) return;
    if (!pipelineStages.some((s) => s.id === attachStageId)) {
      setAttachStageId(pipelineStages[0].id);
    }
  }, [attachNote, pipelineStages, attachStageId]);

  useEffect(() => {
    if (isModalOpen) {
      setContactPickerOpen(false);
      setContactSearch("");
    }
  }, [isModalOpen]);

  const filteredNotes = useMemo(
    () => (searchQuery.trim() ? notes.filter((n) => noteMatchesSearch(n, searchQuery)) : notes),
    [notes, searchQuery],
  );

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

  const isFormValid = formData.title.trim() !== "";

  return {
    notes,
    filteredNotes,
    searchQuery,
    contacts,
    positions,
    latestPositionsRef,
    persistPositions,
    flushPositionsNow,
    getPosition,
    setPosition,
    maxZIndex,
    setMaxZIndex,
    bumpZ,
    togglePin,
    reload,
    isModalOpen,
    formData,
    setFormData,
    editingId,
    saving,
    openNew,
    openEdit,
    closeEditor,
    save,
    handleDelete,
    aiSummary,
    setAiSummary,
    aiLoading,
    summarize,
    contactPickerOpen,
    setContactPickerOpen,
    contactSearch,
    setContactSearch,
    filteredContactsForPicker,
    selectedContactLabel,
    isFormValid,
    attachNote,
    pipelineStages,
    attachStageId,
    setAttachStageId,
    attachDealTitle,
    setAttachDealTitle,
    attachLoading,
    attachSaving,
    openAttachToDeal,
    closeAttachModal,
    handleCreateDealFromNote,
  } as const;
}
