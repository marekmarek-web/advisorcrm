"use client";

import { CheckCheck, Trash2 } from "lucide-react";
import type { MessageRow, MessageAttachmentRow } from "@/app/actions/messages";

export function PortalMessageBubble({
  m,
  attachments,
  isOwn,
  onDeleteOne,
  deletePending,
}: {
  m: MessageRow;
  attachments: MessageAttachmentRow[];
  isOwn: boolean;
  onDeleteOne?: (messageId: string) => void;
  deletePending?: boolean;
}) {
  const showDel =
    "opacity-100 md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto";

  return (
    <div className={`group flex items-end gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
      {onDeleteOne && !isOwn ? (
        <button
          type="button"
          disabled={deletePending}
          onClick={() => onDeleteOne(m.id)}
          className={`mb-1 flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 disabled:opacity-40 ${showDel}`}
          aria-label="Smazat zprávu"
          title="Smazat zprávu"
        >
          <Trash2 size={16} />
        </button>
      ) : null}
      <div className={`relative ${isOwn ? "max-w-[78%]" : "max-w-[82%]"}`}>
        {onDeleteOne && isOwn ? (
          <button
            type="button"
            disabled={deletePending}
            onClick={() => onDeleteOne(m.id)}
            className={`absolute -right-1 -top-1 z-[1] rounded-full border border-rose-100 bg-white/95 p-1 text-rose-600 shadow-sm hover:bg-rose-50 disabled:opacity-40 ${showDel}`}
            aria-label="Smazat zprávu"
            title="Smazat zprávu"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
        <div
          className={`rounded-[var(--wp-radius-card)] px-4 py-3.5 text-[15px] leading-7 shadow-sm ${
            isOwn
              ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white"
              : "border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)]"
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
          {attachments.length > 0 ? (
            <div className="mt-3 space-y-2">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-2xl border px-3 py-2 text-sm ${
                    isOwn ? "border-white/25 bg-white/10" : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]"
                  }`}
                >
                  <a
                    href={`/api/messages/attachments/${a.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`font-medium underline ${isOwn ? "text-white" : "text-indigo-600"}`}
                    title={a.fileName}
                  >
                    📎 {a.fileName}
                  </a>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div
          className={`mt-2 flex items-center gap-2 px-1 text-xs ${isOwn ? "justify-end text-[color:var(--wp-text-tertiary)]" : "justify-start text-[color:var(--wp-text-tertiary)]"}`}
        >
          <span>
            {new Date(m.createdAt).toLocaleString("cs-CZ", {
              day: "numeric",
              month: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {isOwn ? <CheckCheck className="h-3.5 w-3.5 opacity-70" /> : null}
        </div>
      </div>
    </div>
  );
}
