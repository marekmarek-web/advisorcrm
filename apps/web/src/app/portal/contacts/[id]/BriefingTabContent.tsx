"use client";

import { useSearchParams } from "next/navigation";
import { PreMeetingBriefPanel } from "@/app/components/meeting-briefing/PreMeetingBriefPanel";
import { PostMeetingSummaryPanel } from "@/app/components/meeting-briefing/PostMeetingSummaryPanel";

type Props = { contactId: string };

export function BriefingTabContent({ contactId }: Props) {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");
  const meetingNoteId = searchParams.get("meetingNoteId");

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6">
          <PreMeetingBriefPanel contactId={contactId} eventId={eventId} />
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
