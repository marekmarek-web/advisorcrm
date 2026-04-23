"use client";

import React from "react";
import { Plus, Pencil, GripVertical, Sparkles } from "lucide-react";
import { DemoFrame } from "./DemoFrame";
import { DEMO_NOTES, type DemoNote } from "./demo-data";

const ACCENT: Record<string, { dot: string; chip: string; border: string }> = {
  emerald: {
    dot: "bg-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    border: "hover:border-emerald-400/50",
  },
  rose: {
    dot: "bg-rose-400",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    border: "hover:border-rose-400/50",
  },
  indigo: {
    dot: "bg-indigo-400",
    chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    border: "hover:border-indigo-400/50",
  },
};

/**
 * Zápisky — interaktivní mini board. Tři ukázkové zápisky z různých domén
 * (Investice / ZP / Penzijní spoření) + dlaždice „Přidat nový".
 * Cíl: ukázat, že zápisky nejsou mrtvý seznam, ale živé karty s quick edit.
 */
export function NotesBoardDemo() {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const handleSaveDraft = (id: string) => {
    setEditingId(null);
  };

  return (
    <DemoFrame label="Zápisky · Board" status={`${DEMO_NOTES.length} karty`} statusTone="indigo">
      <div className="p-4 md:p-5 bg-[#0a0f29]/40">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(["Vše", "Investice", "Životní pojištění", "Penzijní sp."] as const).map((c, i) => (
            <span
              key={c}
              className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                i === 0
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-transparent text-slate-400 border-white/10"
              }`}
            >
              {c}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Sparkles size={12} className="text-indigo-300" /> Živý board
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEMO_NOTES.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              active={activeId === note.id}
              editing={editingId === note.id}
              draft={drafts[note.id] ?? note.preview}
              onDraftChange={(v) => setDrafts((p) => ({ ...p, [note.id]: v }))}
              onActivate={() => setActiveId(note.id)}
              onDeactivate={() => setActiveId((curr) => (curr === note.id ? null : curr))}
              onStartEdit={() => {
                setEditingId(note.id);
                setActiveId(note.id);
              }}
              onSave={() => handleSaveDraft(note.id)}
              onCancelEdit={() => setEditingId(null)}
            />
          ))}
          <AddNewTile />
        </div>
      </div>
    </DemoFrame>
  );
}

function NoteCard({
  note,
  active,
  editing,
  draft,
  onDraftChange,
  onActivate,
  onDeactivate,
  onStartEdit,
  onSave,
  onCancelEdit,
}: {
  note: DemoNote;
  active: boolean;
  editing: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
}) {
  const accent = ACCENT[note.accent] ?? ACCENT.indigo;

  return (
    <div
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onMouseLeave={onDeactivate}
      onBlur={onDeactivate}
      tabIndex={0}
      className={`group relative rounded-2xl border bg-white/[0.04] border-white/10 p-4 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${accent.border} ${
        active ? "translate-y-[-2px] shadow-[0_14px_40px_-20px_rgba(99,102,241,0.45)] bg-white/[0.06]" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${accent.chip}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
          {note.domainLabel}
        </span>
        <div
          className={`flex items-center gap-1 transition-opacity ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Upravit zápisek"
          >
            <Pencil size={12} />
          </button>
          <span className="p-1.5 text-slate-500" aria-hidden>
            <GripVertical size={12} />
          </span>
        </div>
      </div>

      <h4 className="text-sm font-bold text-white mb-1.5 leading-snug">{note.title}</h4>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={3}
            className="w-full text-xs text-slate-200 bg-[#0a0f29]/70 border border-white/10 rounded-lg p-2 focus:outline-none focus:border-indigo-400/60 resize-none"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-300 px-2 py-1"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={onSave}
              className="text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md px-2.5 py-1"
            >
              Uložit
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{draft}</p>
      )}

      <div className="mt-3 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
        Upraveno {note.updatedLabel}
      </div>
    </div>
  );
}

function AddNewTile() {
  return (
    <button
      type="button"
      className="group rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4 flex flex-col items-center justify-center text-center min-h-[140px] hover:border-indigo-400/50 hover:bg-indigo-500/5 transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 group-hover:border-indigo-400/40 flex items-center justify-center mb-2">
        <Plus size={18} className="text-slate-400 group-hover:text-indigo-300" />
      </div>
      <span className="text-sm font-bold text-slate-300 group-hover:text-white">Přidat zápisek</span>
      <span className="text-[11px] text-slate-500 mt-1">Investice, ZP, penze, jiná doména…</span>
    </button>
  );
}

export default NotesBoardDemo;
