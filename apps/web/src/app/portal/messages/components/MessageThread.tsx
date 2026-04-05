"use client";

import type { RefObject } from "react";
import type { MessageRow, MessageAttachmentRow } from "@/app/actions/messages";
import { PortalMessageBubble } from "./PortalMessageBubble";
import { formatThreadDayLabel } from "./chat-format";

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function MessageThread({
  msgs,
  msgAttachments,
  onDeleteOne,
  deletingMessageId,
  bottomRef,
  loading,
  loadError,
  onRetryLoad,
  attachmentsLoading,
}: {
  msgs: MessageRow[];
  msgAttachments: Record<string, MessageAttachmentRow[]>;
  onDeleteOne: (messageId: string) => void;
  deletingMessageId: string | null;
  bottomRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  loadError: string | null;
  onRetryLoad: () => void;
  attachmentsLoading: boolean;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.05),transparent_28%),linear-gradient(180deg,#fbfcff_0%,#f8fafc_100%)] px-4 py-5 md:px-6 md:py-6 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-center text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-medium">{loadError}</p>
            <button type="button" onClick={onRetryLoad} className="mt-3 text-sm font-semibold text-rose-700 underline dark:text-rose-300">
              Zkusit znovu
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4 py-6" aria-busy="true" aria-label="Načítání zpráv">
            {[1, 2, 3].map((k) => (
              <div key={k} className={`flex ${k % 2 ? "justify-end" : "justify-start"}`}>
                <div className="h-16 w-[min(100%,280px)] animate-pulse rounded-[24px] bg-[color:var(--wp-surface-muted)]" />
              </div>
            ))}
          </div>
        ) : null}

        {!loading && !loadError && msgs.length === 0 ? (
          <p className="py-10 text-center text-sm text-[color:var(--wp-text-secondary)]">Zatím žádné zprávy. Napište první zprávu.</p>
        ) : null}

        {!loading && !loadError
          ? msgs.map((m, i) => {
              const d = new Date(m.createdAt);
              const prev = i > 0 ? new Date(msgs[i - 1]!.createdAt) : null;
              const showDay = !prev || !sameCalendarDay(d, prev);

              return (
                <div key={m.id} className="contents">
                  {showDay ? (
                    <div className="mx-auto rounded-full border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-1 text-xs font-medium text-[color:var(--wp-text-secondary)] shadow-sm">
                      {formatThreadDayLabel(d)}
                    </div>
                  ) : null}
                  <PortalMessageBubble
                    m={m}
                    attachments={msgAttachments[m.id] ?? []}
                    isOwn={m.senderType === "advisor"}
                    onDeleteOne={onDeleteOne}
                    deletePending={deletingMessageId === m.id}
                  />
                </div>
              );
            })
          : null}

        {attachmentsLoading && msgs.length > 0 ? (
          <p className="mt-2 text-center text-xs text-[color:var(--wp-text-tertiary)]">Načítání příloh…</p>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
