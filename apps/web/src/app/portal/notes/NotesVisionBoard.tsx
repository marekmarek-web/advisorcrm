"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Briefcase,
  Check,
  ChevronDown,
  FileText,
  LayoutGrid,
  Trash2,
  User,
  X,
} from "lucide-react";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import type { NotesBoardStoredPosition } from "@/app/actions/notes-board-positions";
import type { ContactNamePickerRow } from "@/app/actions/contacts";
import { NOTES_BOARD_MASONRY_BREAKPOINT_PX } from "@/lib/board/notes-board-units";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import {
  NOTES_EDIT_DRAWER_Z,
  contentTitle,
  useNotesBoardController,
} from "./useNotesBoardController";
import { NotesFreeBoard, type NotesFreeBoardHandle } from "./NotesFreeBoard";
import { NotesMasonryBoard } from "./NotesMasonryBoard";

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

type LayoutMode = "free" | "masonry";

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
  const controller = useNotesBoardController({
    initialNotes,
    contacts,
    initialSearchQuery,
    initialNoteId,
    initialBoardPositions,
  });

  const hostRef = useRef<HTMLDivElement>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("free");
  const freeBoardHandleRef = useRef<NotesFreeBoardHandle | null>(null);

  /** Přepínač layoutu: podle **šířky skutečného kontejneru** (ne viewportu),
   * aby se správně přepnul i při otevřeném/zavřeném sidebaru na úzkém notebooku. */
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      setLayoutMode(w >= NOTES_BOARD_MASONRY_BREAKPOINT_PX ? "free" : "masonry");
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleFreeBoardReady = useCallback((handle: NotesFreeBoardHandle) => {
    freeBoardHandleRef.current = handle;
  }, []);

  const handleTidy = useCallback(() => {
    freeBoardHandleRef.current?.tidy();
  }, []);

  const handleSave = useCallback(() => {
    void controller.save(async (newId) => {
      if (layoutMode === "free") {
        freeBoardHandleRef.current?.spawnNext(newId);
      } else {
        // V masonry řadíme dle `order`; nové karty dáme na začátek nepřipnuté sekce.
        const next = { ...controller.latestPositionsRef.current };
        const prev = next[newId] ?? { x: 0, y: 0, z: 1, pinned: false };
        let minOrder = 0;
        for (const p of Object.values(next)) {
          if (typeof p.order === "number" && p.order < minOrder) minOrder = p.order;
        }
        next[newId] = { ...prev, order: minOrder - 1, pinned: false };
        controller.persistPositions(next);
      }
    });
  }, [controller, layoutMode]);

  return (
    <div className="portal-notes-board-light flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--wp-main-scroll-bg)] font-sans">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--wp-surface-muted)] text-indigo-600">
            <FileText size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-none tracking-tight text-[color:var(--wp-text)] md:text-lg">
              Zápisky
            </h1>
            <p className="mt-0.5 hidden text-[11px] font-bold uppercase leading-none tracking-wider text-[color:var(--wp-text-muted)] md:block">
              {layoutMode === "free" ? "Nástěnka zápisků" : "Mobilní nástěnka"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {layoutMode === "free" && controller.notes.length > 1 ? (
            <button
              type="button"
              onClick={handleTidy}
              title="Uspořádat karty do mřížky"
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-2.5 py-2 text-xs font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors"
            >
              <LayoutGrid size={16} />
              <span className="hidden md:inline">Uspořádat</span>
            </button>
          ) : null}
          <button
            type="button"
            disabled={controller.aiLoading || controller.notes.length === 0}
            onClick={() => void controller.summarize()}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-fuchsia-500/20 bg-gradient-to-b from-fuchsia-500/10 to-indigo-500/5 px-2 py-2 text-xs font-bold text-[color:var(--wp-text)] shadow-sm transition-all hover:border-fuchsia-500/35 hover:from-fuchsia-500/14 disabled:opacity-50 md:px-3 md:text-sm"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--wp-surface-card-border)] bg-white">
              <AiAssistantBrandIcon size={18} variant="colorOnWhite" className="max-h-full max-w-full" />
            </span>
            <span className="font-black tracking-wide">
              {controller.aiLoading ? "Zpracovávám…" : "Sumarizace"}
            </span>
          </button>
          <CreateActionButton type="button" onClick={controller.openNew} className="min-w-[44px]">
            <span className="hidden sm:inline">Nový zápis</span>
          </CreateActionButton>
        </div>
      </header>

      <div ref={hostRef} className="flex flex-1 min-h-0 flex-col">
        {layoutMode === "free" ? (
          <NotesFreeBoard controller={controller} onHandleReady={handleFreeBoardReady} />
        ) : (
          <NotesMasonryBoard controller={controller} />
        )}
      </div>

      {controller.aiSummary && (
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
                onClick={() => controller.setAiSummary(null)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-raised)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap text-sm text-[color:var(--wp-text-secondary)] font-medium leading-relaxed">
                {controller.aiSummary}
              </pre>
            </div>
            <div className="px-6 py-4 border-t border-[color:var(--wp-surface-card-border)] flex justify-end">
              <button
                type="button"
                onClick={() => controller.setAiSummary(null)}
                className="px-5 py-2.5 rounded-xl font-bold text-sm border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-all min-h-[44px]"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}

      {controller.attachNote && (
        <AttachToDealModal
          attachNote={controller.attachNote}
          pipelineStages={controller.pipelineStages}
          attachStageId={controller.attachStageId}
          setAttachStageId={controller.setAttachStageId}
          attachDealTitle={controller.attachDealTitle}
          setAttachDealTitle={controller.setAttachDealTitle}
          attachLoading={controller.attachLoading}
          attachSaving={controller.attachSaving}
          onClose={controller.closeAttachModal}
          onCreate={() => void controller.handleCreateDealFromNote()}
        />
      )}

      <NotesEditDrawer
        isOpen={controller.isModalOpen}
        editingId={controller.editingId}
        formData={controller.formData}
        setFormData={controller.setFormData}
        notes={controller.notes}
        contacts={controller.contacts}
        contactPickerOpen={controller.contactPickerOpen}
        setContactPickerOpen={controller.setContactPickerOpen}
        contactSearch={controller.contactSearch}
        setContactSearch={controller.setContactSearch}
        filteredContactsForPicker={controller.filteredContactsForPicker}
        selectedContactLabel={controller.selectedContactLabel}
        isFormValid={controller.isFormValid}
        saving={controller.saving}
        onClose={controller.closeEditor}
        onSave={handleSave}
        onDelete={() => void controller.handleDelete()}
        onOpenAttachForEditing={() => {
          const n = controller.notes.find((x) => x.id === controller.editingId);
          if (n) void controller.openAttachToDeal(n);
        }}
      />
    </div>
  );
}

// ------------------- Attach modal (nezávisle vyňato) -------------------

function AttachToDealModal({
  attachNote,
  pipelineStages,
  attachStageId,
  setAttachStageId,
  attachDealTitle,
  setAttachDealTitle,
  attachLoading,
  attachSaving,
  onClose,
  onCreate,
}: {
  attachNote: MeetingNoteForBoard;
  pipelineStages: { id: string; name: string }[];
  attachStageId: string;
  setAttachStageId: (id: string) => void;
  attachDealTitle: string;
  setAttachDealTitle: (v: string) => void;
  attachLoading: boolean;
  attachSaving: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden border border-[color:var(--wp-surface-card-border)]">
        <div className="flex items-center justify-between border-b border-[color:var(--wp-surface-card-border)] px-6 py-4 shrink-0">
          <h2 className="text-lg font-bold text-[color:var(--wp-text)] pr-2">Nový obchod ze zápisku</h2>
          <button
            type="button"
            onClick={onClose}
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
            onClick={onClose}
            disabled={attachSaving}
            className="px-5 py-2.5 rounded-xl font-bold text-sm border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-all min-h-[44px] disabled:opacity-50"
          >
            Zrušit
          </button>
          <CreateActionButton
            type="button"
            disabled={attachSaving || attachLoading || !attachStageId || pipelineStages.length === 0}
            onClick={onCreate}
          >
            {attachSaving ? "Vytvářím…" : "Vytvořit obchod"}
          </CreateActionButton>
        </div>
      </div>
    </div>
  );
}

// ------------------- Edit drawer (portal → body) -------------------

type NotesFormData = {
  title: string;
  client: string;
  date: string;
  time: string;
  type: string;
  content: string;
  recommendation: string;
};

function NotesEditDrawer({
  isOpen,
  editingId,
  formData,
  setFormData,
  notes,
  contacts,
  contactPickerOpen,
  setContactPickerOpen,
  contactSearch,
  setContactSearch,
  filteredContactsForPicker,
  selectedContactLabel,
  isFormValid,
  saving,
  onClose,
  onSave,
  onDelete,
  onOpenAttachForEditing,
}: {
  isOpen: boolean;
  editingId: string | null;
  formData: NotesFormData;
  setFormData: (v: NotesFormData) => void;
  notes: MeetingNoteForBoard[];
  contacts: ContactNamePickerRow[];
  contactPickerOpen: boolean;
  setContactPickerOpen: (v: boolean) => void;
  contactSearch: string;
  setContactSearch: (v: string) => void;
  filteredContactsForPicker: ContactNamePickerRow[];
  selectedContactLabel: string;
  isFormValid: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onOpenAttachForEditing: () => void;
}) {
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);
  if (!portalReady || !isOpen) return null;

  return createPortal(
    <div
      style={{ zIndex: NOTES_EDIT_DRAWER_Z }}
      className="fixed inset-0 flex justify-end bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm animate-in fade-in duration-300"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[color:var(--wp-surface-card)] w-full max-w-[480px] h-full min-h-0 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between px-8 py-6 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80">
          <div>
            <h2 className="font-bold text-xl text-[color:var(--wp-text)]">
              {editingId ? "Upravit zápisek" : "Nový zápisek"}
            </h2>
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mt-1">Zápisky</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] flex items-center justify-center text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)] transition-colors shadow-sm"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-8 py-6 space-y-8">
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
                onClick={() => setContactPickerOpen(!contactPickerOpen)}
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
              <label className="block text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Další kroky / Interní úkoly</label>
              <textarea
                rows={3}
                value={formData.recommendation}
                onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
                placeholder="Interní úkoly pro vás nebo poznámky k ověření..."
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
                onClick={onDelete}
                disabled={saving}
                className="flex items-center justify-center w-12 h-12 bg-[color:var(--wp-surface-card)] border border-red-200 text-red-500 rounded-xl hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm disabled:opacity-50"
                title="Smazat zápisek"
              >
                <Trash2 size={18} />
              </button>
              <button
                type="button"
                onClick={onOpenAttachForEditing}
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
              onClick={onClose}
              className="px-6 py-3.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl font-bold hover:bg-[color:var(--wp-surface-muted)] transition-colors shadow-sm"
            >
              Zrušit
            </button>
          )}
          <CreateActionButton
            type="button"
            onClick={onSave}
            disabled={!isFormValid}
            isLoading={saving}
            icon={Check}
            className="min-w-0 flex-1 shadow-lg"
          >
            {saving ? "Ukládám…" : editingId ? "Uložit změny" : "Přidat na plátno"}
          </CreateActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NotesBoardSuspenseFallback() {
  return (
    <div className="portal-notes-board-light flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--wp-main-scroll-bg)] font-sans">
      <div className="flex h-14 shrink-0 animate-pulse items-center justify-between gap-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4" />
      <div className="m-4 min-h-[200px] flex-1 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-inset)]/40 animate-pulse" />
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
