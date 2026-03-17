"use client";

import { useState } from "react";
import { Loader2, FileText, MessageSquare } from "lucide-react";
import {
  generatePreMeetingBriefingAction,
  generatePostMeetingFollowupAction,
} from "@/app/actions/ai-generations";

type Props = {
  contactId: string;
  eventId: string;
  eventNotes: string | null;
};

export function CalendarEventAiActions({ contactId, eventId, eventNotes }: Props) {
  const [briefLoading, setBriefLoading] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [briefText, setBriefText] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  async function handlePreMeetingBriefing() {
    setBriefLoading(true);
    setBriefError(null);
    setBriefText(null);
    try {
      const result = await generatePreMeetingBriefingAction(contactId, eventId);
      if (result.ok) setBriefText(result.text);
      else setBriefError(result.error);
    } finally {
      setBriefLoading(false);
    }
  }

  async function handlePostMeetingFollowup() {
    setFollowUpLoading(true);
    setFollowUpError(null);
    setFollowUpText(null);
    try {
      const notes = eventNotes?.trim() || "Žádný zápis ze schůzky.";
      const result = await generatePostMeetingFollowupAction(contactId, notes, eventId);
      if (result.ok) setFollowUpText(result.text);
      else setFollowUpError(result.error);
    } finally {
      setFollowUpLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">
        AI – briefing a follow-up
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handlePreMeetingBriefing}
          disabled={briefLoading}
          className="flex items-center justify-center gap-2 min-h-[44px] w-full py-2.5 px-3 text-sm font-bold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors disabled:opacity-60"
        >
          {briefLoading ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <FileText size={14} aria-hidden />
          )}
          Připrav briefing
        </button>
        <button
          type="button"
          onClick={handlePostMeetingFollowup}
          disabled={followUpLoading}
          className="flex items-center justify-center gap-2 min-h-[44px] w-full py-2.5 px-3 text-sm font-bold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors disabled:opacity-60"
        >
          {followUpLoading ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <MessageSquare size={14} aria-hidden />
          )}
          Vygenerovat follow-up
        </button>
      </div>
      {briefError && (
        <p className="text-xs text-rose-600" role="alert">
          Briefing: {briefError}
        </p>
      )}
      {briefText && (
        <div className="border-t border-indigo-100 pt-2">
          <p className="text-[10px] font-bold uppercase text-indigo-600 mb-1">Briefing</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{briefText}</p>
        </div>
      )}
      {followUpError && (
        <p className="text-xs text-rose-600" role="alert">
          Follow-up: {followUpError}
        </p>
      )}
      {followUpText && (
        <div className="border-t border-indigo-100 pt-2">
          <p className="text-[10px] font-bold uppercase text-indigo-600 mb-1">Follow-up</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{followUpText}</p>
        </div>
      )}
    </div>
  );
}
