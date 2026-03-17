"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, RefreshCw, FileText, Sparkles } from "lucide-react";
import { PreMeetingBriefPanel } from "@/app/components/meeting-briefing/PreMeetingBriefPanel";
import { PostMeetingSummaryPanel } from "@/app/components/meeting-briefing/PostMeetingSummaryPanel";
import {
  generatePreMeetingBriefingAction,
  generatePostMeetingFollowupAction,
  getLatestPreMeetingBriefing,
  getLatestMeetingGeneration,
} from "@/app/actions/ai-generations";

type Props = { contactId: string };

function extractTextFromContent(content: unknown): string {
  if (content == null) return "";
  const o = content as Record<string, unknown>;
  if (typeof o.summary === "string") return o.summary;
  if (typeof o.title === "string") return o.title;
  return JSON.stringify(o).slice(0, 4000);
}

export function BriefingTabContent({ contactId }: Props) {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");
  const meetingNoteId = searchParams.get("meetingNoteId");

  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState<string | null>(null);
  const [followUpNotes, setFollowUpNotes] = useState("");

  const loadLatestBriefing = useCallback(async () => {
    const r = await getLatestPreMeetingBriefing(contactId, eventId);
    setBriefingText(r?.outputText ?? null);
  }, [contactId, eventId]);

  const loadLatestFollowUp = useCallback(async () => {
    if (!meetingNoteId) return;
    const r = await getLatestMeetingGeneration("meeting_note", meetingNoteId, "postMeetingFollowup");
    setFollowUpText(r?.outputText ?? null);
  }, [meetingNoteId]);

  useEffect(() => {
    loadLatestBriefing();
  }, [loadLatestBriefing]);

  useEffect(() => {
    if (meetingNoteId) loadLatestFollowUp();
  }, [meetingNoteId, loadLatestFollowUp]);

  async function handlePrepareBriefing() {
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const result = await generatePreMeetingBriefingAction(contactId, eventId ?? undefined);
      if (result.ok) {
        setBriefingText(result.text);
        loadLatestBriefing();
      } else {
        setBriefingError(result.error);
      }
    } finally {
      setBriefingLoading(false);
    }
  }

  async function handleGenerateFollowUp(notes: string, meetingId?: string | null) {
    setFollowUpLoading(true);
    setFollowUpError(null);
    try {
      const result = await generatePostMeetingFollowupAction(contactId, notes, meetingId);
      if (result.ok) {
        setFollowUpText(result.text);
        if (meetingNoteId) loadLatestFollowUp();
      } else {
        setFollowUpError(result.error);
      }
    } finally {
      setFollowUpLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* AI briefing (OpenAI prompt) – Připrav briefing */}
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Sparkles size={20} className="text-indigo-500" />
              AI briefing (prompt)
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Vygeneruje přípravu na schůzku z dat v CRM pomocí nakonfigurovaného OpenAI promptu.
            </p>
          </div>
          <button
            type="button"
            onClick={handlePrepareBriefing}
            disabled={briefingLoading}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {briefingLoading ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw size={16} aria-hidden />
            )}
            {briefingLoading ? "Generuji…" : "Připrav briefing"}
          </button>
        </div>
        <div className="p-6">
          {briefingError && (
            <p className="text-sm text-rose-600 mb-3" role="alert">
              {briefingError}
            </p>
          )}
          {briefingText ? (
            <div className="text-sm text-slate-700 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 border border-slate-100">
              {briefingText}
            </div>
          ) : !briefingLoading && (
            <p className="text-sm text-slate-500 italic">
              Klikněte na „Připrav briefing“ pro vygenerování přípravy na schůzku.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6">
          <PreMeetingBriefPanel contactId={contactId} eventId={eventId} />
        </div>
      </div>

      {/* AI follow-up (OpenAI prompt) – Vygenerovat follow-up */}
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <FileText size={20} className="text-indigo-500" />
            AI follow-up (prompt)
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Vygeneruje shrnutí a další kroky z poznámek ze schůzky pomocí nakonfigurovaného OpenAI promptu.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <AiFollowUpForm
            contactId={contactId}
            meetingNoteId={meetingNoteId}
            followUpNotes={followUpNotes}
            setFollowUpNotes={setFollowUpNotes}
            followUpText={followUpText}
            followUpError={followUpError}
            followUpLoading={followUpLoading}
            onGenerate={handleGenerateFollowUp}
            onNotesFromNote={extractTextFromContent}
          />
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50">
          <h2 className="text-lg font-black text-slate-900">Po schůzce</h2>
          <p className="text-sm text-slate-500 mt-0.5">Shrnutí a návrhy dalších kroků ze zápisků nebo poznámek.</p>
        </div>
        <div className="p-6">
          <PostMeetingSummaryPanel
            contactId={contactId}
            meetingNoteId={meetingNoteId}
            eventId={eventId}
            showRawNotesInput
          />
        </div>
      </div>
    </div>
  );
}

type AiFollowUpFormProps = {
  contactId: string;
  meetingNoteId: string | null;
  followUpNotes: string;
  setFollowUpNotes: (s: string) => void;
  followUpText: string | null;
  followUpError: string | null;
  followUpLoading: boolean;
  onGenerate: (notes: string, meetingId?: string | null) => Promise<void>;
  onNotesFromNote: (content: unknown) => string;
};

function AiFollowUpForm({
  contactId,
  meetingNoteId,
  followUpNotes,
  setFollowUpNotes,
  followUpText,
  followUpError,
  followUpLoading,
  onGenerate,
  onNotesFromNote,
}: AiFollowUpFormProps) {
  const [loadingNote, setLoadingNote] = useState(false);

  async function loadNoteContent() {
    if (!meetingNoteId) return;
    setLoadingNote(true);
    try {
      const { getMeetingNote } = await import("@/app/actions/meeting-notes");
      const note = await getMeetingNote(meetingNoteId);
      if (note && note.contactId === contactId && note.content) {
        setFollowUpNotes(onNotesFromNote(note.content));
      }
    } finally {
      setLoadingNote(false);
    }
  }

  const notesToUse = followUpNotes.trim();

  return (
    <>
      <textarea
        value={followUpNotes}
        onChange={(e) => setFollowUpNotes(e.target.value)}
        placeholder="Vložte poznámky ze schůzky nebo načtěte z zápisku…"
        className="w-full min-h-[120px] rounded-xl border border-slate-200 p-3 text-sm text-slate-800 placeholder:text-slate-400"
        rows={4}
      />
      <div className="flex flex-wrap items-center gap-2">
        {meetingNoteId && (
          <button
            type="button"
            onClick={loadNoteContent}
            disabled={loadingNote}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            {loadingNote ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Načíst z zápisku
          </button>
        )}
        <button
          type="button"
          onClick={() => onGenerate(notesToUse || "Žádný text.", meetingNoteId)}
          disabled={followUpLoading}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {followUpLoading ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Sparkles size={16} aria-hidden />
          )}
          Vygenerovat follow-up
        </button>
      </div>
      {followUpError && (
        <p className="text-sm text-rose-600" role="alert">
          {followUpError}
        </p>
      )}
      {followUpText && (
        <div className="text-sm text-slate-700 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 border border-slate-100 mt-2">
          {followUpText}
        </div>
      )}
    </>
  );
}
