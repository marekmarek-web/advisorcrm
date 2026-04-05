"use client";

import { Plus, Search, X } from "lucide-react";
import clsx from "clsx";
import type { ConversationListItem as ConversationRow } from "@/app/actions/messages";
import type { ContactRow } from "@/app/actions/contacts";
import { ConversationListItem } from "./ConversationListItem";
import { initialsFromFullName } from "./chat-format";
import { portalPrimaryIconButtonClassName } from "@/lib/ui/create-action-button-styles";

export function ConversationList({
  conversations,
  selectedContactId,
  searchQuery,
  onSearchChange,
  onSelectConversation,
  newMsgOpen,
  onCloseNewMsg,
  onOpenNewMsg,
  contactSearch,
  onContactSearchChange,
  filteredContacts,
  onPickNewContact,
  listLoading,
  listError,
  onRetryList,
}: {
  conversations: ConversationRow[];
  selectedContactId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectConversation: (contactId: string) => void;
  newMsgOpen: boolean;
  onCloseNewMsg: () => void;
  onOpenNewMsg: () => void;
  contactSearch: string;
  onContactSearchChange: (q: string) => void;
  filteredContacts: ContactRow[];
  onPickNewContact: (contactId: string) => void;
  listLoading: boolean;
  listError: string | null;
  onRetryList: () => void;
}) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[28px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm">
      <div className="shrink-0 border-b border-[color:var(--wp-surface-card-border)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3">
            <Search className="h-4 w-4 shrink-0 text-[color:var(--wp-text-tertiary)]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Hledat v konverzacích…"
              className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] outline-none"
              aria-label="Hledat v konverzacích"
            />
          </div>
          <button
            type="button"
            onClick={onOpenNewMsg}
            className={clsx(portalPrimaryIconButtonClassName, "flex h-11 w-11 shrink-0 items-center justify-center shadow-sm")}
            title="Napsat zprávu"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {newMsgOpen ? (
        <div className="shrink-0 space-y-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-secondary)]">Nová zpráva</p>
            <button
              type="button"
              onClick={onCloseNewMsg}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)]"
              aria-label="Zavřít"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--wp-text-tertiary)]" />
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => onContactSearchChange(e.target.value)}
              placeholder="Hledat klienta…"
              className="w-full rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] outline-none focus:ring-2 focus:ring-indigo-100"
              autoFocus
            />
          </div>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {filteredContacts.length === 0 ? (
              <p className="py-2 text-center text-xs text-[color:var(--wp-text-secondary)]">Žádní klienti</p>
            ) : null}
            {filteredContacts.slice(0, 20).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPickNewContact(c.id)}
                className="flex w-full min-h-[44px] items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-[color:var(--wp-text)] transition-colors hover:bg-indigo-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-violet-700 text-xs font-bold text-white">
                  {initialsFromFullName([c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "?")}
                </span>
                <span className="truncate">{[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Kontakt"}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {listError ? (
        <div className="min-w-0 shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          <p className="whitespace-pre-line font-medium leading-snug break-words [overflow-wrap:anywhere] text-pretty">
            {listError}
          </p>
          <button type="button" onClick={onRetryList} className="mt-2 text-sm font-semibold text-rose-700 underline dark:text-rose-300">
            Zkusit znovu
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {listLoading && conversations.length === 0 ? (
          <div className="space-y-2 p-2" aria-busy="true" aria-label="Načítání konverzací">
            {[1, 2, 3, 4, 5].map((k) => (
              <div key={k} className="animate-pulse rounded-2xl bg-[color:var(--wp-surface-muted)] px-3 py-4">
                <div className="flex gap-3">
                  <div className="h-11 w-11 shrink-0 rounded-2xl bg-[color:var(--wp-surface-card-border)]/40" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-[color:var(--wp-surface-card-border)]/50" />
                    <div className="h-3 w-full rounded bg-[color:var(--wp-surface-card-border)]/30" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!listLoading && !listError && conversations.length === 0 ? (
          <p className="p-4 text-center text-sm text-[color:var(--wp-text-secondary)]">Zatím žádné konverzace.</p>
        ) : null}
        {conversations.map((c) => (
          <ConversationListItem
            key={c.contactId}
            item={c}
            active={selectedContactId === c.contactId}
            onSelect={() => onSelectConversation(c.contactId)}
          />
        ))}
      </div>
    </aside>
  );
}
