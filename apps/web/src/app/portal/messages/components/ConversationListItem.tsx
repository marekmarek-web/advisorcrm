"use client";

import clsx from "clsx";
import type { ConversationListItem as ConversationListItemType } from "@/app/actions/messages";
import { formatConversationListTime, presenceFromLastMessageAt, initialsFromFullName } from "./chat-format";
import { StatusDot } from "./StatusDot";

export function ConversationListItem({
  item,
  active,
  onSelect,
}: {
  item: ConversationListItemType;
  active: boolean;
  onSelect: () => void;
}) {
  const tier = presenceFromLastMessageAt(new Date(item.lastMessageAt));
  const initials = initialsFromFullName(item.contactName);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "w-full rounded-2xl px-3 py-3 text-left transition",
        active
          ? "bg-violet-50 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:ring-violet-900/40"
          : item.unread
            ? "bg-indigo-50/60 hover:bg-indigo-50 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/30"
            : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-violet-700 text-sm font-semibold text-white">
          {initials.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className={clsx("truncate text-[color:var(--wp-text)]", item.unread && !active ? "font-semibold" : "font-medium")}>
                {item.contactName}
              </div>
              <StatusDot tier={tier} />
            </div>
            <div className="shrink-0 text-xs text-[color:var(--wp-text-tertiary)]">
              {formatConversationListTime(new Date(item.lastMessageAt))}
            </div>
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.12em] text-[color:var(--wp-text-tertiary)]">Klient</div>
          <div className="mt-2 line-clamp-2 text-sm leading-5 text-[color:var(--wp-text-secondary)]">
            {item.lastMessage || "—"}
          </div>
        </div>
        {item.unreadCount > 0 ? (
          <div className="shrink-0 rounded-full bg-violet-600 px-2 py-1 text-xs font-semibold text-white">
            {item.unreadCount > 99 ? "99+" : item.unreadCount}
          </div>
        ) : null}
      </div>
    </button>
  );
}
